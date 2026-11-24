'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { X, Upload, Users, Loader2, Mail, Clock, Gauge } from 'lucide-react';

import { scheduleEmail } from '@/lib/api';
import { parseEmailsFromText } from '@/lib/utils';

const schema = z.object({
  senderEmail: z.string().email('Invalid sender email'),
  subject: z.string().min(1, 'Subject is required').max(500),
  body: z.string().min(1, 'Body is required'),
  startAt: z.string().min(1, 'Start time is required'),
  delayBetweenEmailsMs: z.number().min(500).max(60000),
  hourlyLimit: z.number().min(1).max(10000),
  campaignName: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface ComposeModalProps {
  onClose: () => void;
  onSuccess: () => void;
  senderEmail: string;
}

export default function ComposeModal({ onClose, onSuccess, senderEmail }: ComposeModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [parsedEmails, setParsedEmails] = useState<string[]>([]);
  const [manualEmails, setManualEmails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      senderEmail,
      delayBetweenEmailsMs: 2000,
      hourlyLimit: 50,
      startAt: new Date(Date.now() + 60000).toISOString().slice(0, 16),
    },
  });

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const f = acceptedFiles[0];
    if (!f) return;
    setFile(f);

    const text = await f.text();
    const emails = parseEmailsFromText(text);
    setParsedEmails(emails);
    toast.success(`Detected ${emails.length} email(s) from file`);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'], 'text/plain': ['.txt'] },
    maxFiles: 1,
  });

  const handleManualEmailChange = (val: string) => {
    setManualEmails(val);
    const emails = parseEmailsFromText(val);
    setParsedEmails(emails);
  };

  const onSubmit = async (data: FormData) => {
    const recipients = parsedEmails.length > 0
      ? parsedEmails
      : parseEmailsFromText(manualEmails);

    if (!recipients.length) {
      toast.error('Please add at least one recipient email address');
      return;
    }

    setSubmitting(true);
    try {
      const result = await scheduleEmail({
        ...data,
        recipients,
        file: file || undefined,
      });
      toast.success(result.message || `Scheduled ${result.scheduled} emails!`);
      onSuccess();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to schedule emails');
    } finally {
      setSubmitting(false);
    }
  };

  const totalRecipients = parsedEmails.length;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-surface-card border border-surface-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-surface-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-brand-500/20 rounded-lg flex items-center justify-center">
              <Mail className="w-4 h-4 text-brand-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Compose Email Campaign</h2>
              <p className="text-xs text-gray-400">Schedule emails for delivery via BullMQ</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-surface-hover rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-5">
          {/* Campaign Name */}
          <div>
            <label className="label">Campaign Name (optional)</label>
            <input {...register('campaignName')} className="input" placeholder="e.g. November Outreach" />
          </div>

          {/* Sender Email */}
          <div>
            <label className="label">From Email *</label>
            <input {...register('senderEmail')} className="input" placeholder="sender@example.com" />
            {errors.senderEmail && <p className="text-red-400 text-xs mt-1">{errors.senderEmail.message}</p>}
          </div>

          {/* Subject */}
          <div>
            <label className="label">Subject *</label>
            <input {...register('subject')} className="input" placeholder="Your email subject..." />
            {errors.subject && <p className="text-red-400 text-xs mt-1">{errors.subject.message}</p>}
          </div>

          {/* Body */}
          <div>
            <label className="label">Body *</label>
            <textarea
              {...register('body')}
              rows={5}
              className="input resize-none"
              placeholder="Your email body... (HTML supported)"
            />
            {errors.body && <p className="text-red-400 text-xs mt-1">{errors.body.message}</p>}
          </div>

          {/* Recipients */}
          <div>
            <label className="label">Recipients *</label>
            {/* File Drop Zone */}
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors mb-3 ${
                isDragActive
                  ? 'border-brand-500 bg-brand-500/10'
                  : 'border-surface-border hover:border-brand-500/50'
              }`}
            >
              <input {...getInputProps()} />
              <Upload className="w-6 h-6 text-gray-500 mx-auto mb-2" />
              <p className="text-sm text-gray-400">
                {file ? (
                  <span className="text-brand-400">{file.name}</span>
                ) : (
                  <>Drop CSV/TXT file here, or <span className="text-brand-400">click to browse</span></>
                )}
              </p>
            </div>

            {/* Manual entry */}
            <label className="label">Or paste email addresses (one per line or comma-separated)</label>
            <textarea
              value={manualEmails}
              onChange={(e) => handleManualEmailChange(e.target.value)}
              rows={3}
              className="input resize-none text-sm"
              placeholder="john@example.com, jane@example.com..."
            />

            {totalRecipients > 0 && (
              <div className="flex items-center gap-2 mt-2 text-sm text-green-400">
                <Users className="w-4 h-4" />
                {totalRecipients} recipient{totalRecipients !== 1 ? 's' : ''} detected
              </div>
            )}
          </div>

          {/* Schedule Settings */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="label flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                Start At *
              </label>
              <input
                type="datetime-local"
                {...register('startAt')}
                className="input text-sm"
              />
              {errors.startAt && <p className="text-red-400 text-xs mt-1">{errors.startAt.message}</p>}
            </div>
            <div>
              <label className="label">Delay Between Emails (ms)</label>
              <input
                type="number"
                {...register('delayBetweenEmailsMs', { valueAsNumber: true })}
                className="input text-sm"
                min={500}
                step={500}
              />
              <p className="text-xs text-gray-500 mt-1">Min 500ms, default 2000ms</p>
            </div>
            <div>
              <label className="label flex items-center gap-1.5">
                <Gauge className="w-3.5 h-3.5" />
                Hourly Limit
              </label>
              <input
                type="number"
                {...register('hourlyLimit', { valueAsNumber: true })}
                className="input text-sm"
                min={1}
              />
              <p className="text-xs text-gray-500 mt-1">Emails per hour per sender</p>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-surface-border">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || totalRecipients === 0}
              className="btn-primary flex items-center gap-2 min-w-[140px] justify-center"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Scheduling...
                </>
              ) : (
                <>
                  Schedule {totalRecipients > 0 ? `${totalRecipients} Email${totalRecipients > 1 ? 's' : ''}` : 'Emails'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
