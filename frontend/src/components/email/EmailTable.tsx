'use client';

import { ScheduledEmail } from '@/types';
import { formatDate, getStatusColor } from '@/lib/utils';
import { Loader2, Inbox, ExternalLink } from 'lucide-react';

interface EmailTableProps {
  emails: ScheduledEmail[];
  loading: boolean;
  error: string | null;
  type: 'scheduled' | 'sent';
  searchQuery?: string;
}

export default function EmailTable({ emails, loading, error, type, searchQuery }: EmailTableProps) {
  // Client-side filter by searchQuery
  const filtered = searchQuery
    ? emails.filter((e) =>
        e.recipient_email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.sender_email.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : emails;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
        <span className="ml-2 text-gray-400">Loading emails...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    );
  }

  if (!filtered.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Inbox className="w-12 h-12 text-gray-600 mb-4" />
        <p className="text-gray-400 font-medium">No {type} emails yet</p>
        <p className="text-gray-500 text-sm mt-1">
          {type === 'scheduled' ? 'Schedule your first email campaign to get started.' : 'Sent emails will appear here.'}
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-surface-border">
            <th className="text-left text-gray-400 font-medium px-5 py-3">Recipient</th>
            <th className="text-left text-gray-400 font-medium px-5 py-3">Subject</th>
            <th className="text-left text-gray-400 font-medium px-5 py-3">Sender</th>
            <th className="text-left text-gray-400 font-medium px-5 py-3">
              {type === 'scheduled' ? 'Scheduled At' : 'Sent At'}
            </th>
            <th className="text-left text-gray-400 font-medium px-5 py-3">Status</th>
            {type === 'sent' && (
              <th className="text-left text-gray-400 font-medium px-5 py-3">Preview</th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-border">
          {filtered.map((email) => (
            <tr key={email.id} className="hover:bg-surface-hover/50 transition-colors">
              <td className="px-5 py-3.5 text-white max-w-[200px] truncate">
                {email.recipient_email}
              </td>
              <td className="px-5 py-3.5 text-gray-300 max-w-[250px] truncate">
                {email.subject}
              </td>
              <td className="px-5 py-3.5 text-gray-400 max-w-[180px] truncate">
                {email.sender_email}
              </td>
              <td className="px-5 py-3.5 text-gray-400 whitespace-nowrap">
                {formatDate(type === 'scheduled' ? email.scheduled_at : email.sent_at)}
              </td>
              <td className="px-5 py-3.5">
                <span className={`status-badge ${getStatusColor(email.status)}`}>
                  {email.status}
                </span>
              </td>
              {type === 'sent' && (
                <td className="px-5 py-3.5">
                  {email.preview_url ? (
                    <a
                      href={email.preview_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-400 hover:text-brand-300 flex items-center gap-1 text-xs"
                    >
                      View <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    <span className="text-gray-600 text-xs">—</span>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
