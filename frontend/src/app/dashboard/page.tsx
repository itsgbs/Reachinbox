'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { Mail, Send, Calendar, TrendingUp, Plus, Search, Slack } from 'lucide-react';

import { useAuth } from '@/hooks/useAuth';
import { useEmails, useEmailStats } from '@/hooks/useEmails';
import Header from '@/components/ui/Header';
import StatCard from '@/components/ui/StatCard';
import EmailTable from '@/components/email/EmailTable';
import ComposeModal from '@/components/email/ComposeModal';
import SearchBar from '@/components/ui/SearchBar';
import SlackButton from '@/components/ui/SlackButton';
import { getSlackStatus } from '@/lib/api';
import { SlackStatus } from '@/types';

type TabType = 'scheduled' | 'sent';

export default function DashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('scheduled');
  const [showCompose, setShowCompose] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [slackStatus, setSlackStatus] = useState<SlackStatus>({ connected: false });

  const scheduledEmails = useEmails('scheduled');
  const sentEmails = useEmails('sent');
  const { stats } = useEmailStats();

  // Handle Slack OAuth redirect
  useEffect(() => {
    const slackConnected = searchParams.get('slack_connected');
    const slackError = searchParams.get('slack_error');
    if (slackConnected === 'true') {
      toast.success('Slack connected! You will receive rate limit notifications.');
      setSlackStatus({ connected: true });
    } else if (slackError) {
      toast.error(`Slack error: ${slackError}`);
    }
  }, [searchParams]);

  // Fetch Slack status
  useEffect(() => {
    if (user) {
      getSlackStatus().then(setSlackStatus).catch(() => {});
    }
  }, [user]);

  // Guard — redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login');
    }
  }, [authLoading, user, router]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500" />
      </div>
    );
  }

  if (!user) return null;

  const activeEmails = activeTab === 'scheduled' ? scheduledEmails : sentEmails;

  return (
    <div className="min-h-screen bg-surface">
      <Header user={user} onLogout={logout} slackStatus={slackStatus} onSlackChange={setSlackStatus} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Title */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Email Dashboard</h1>
            <p className="text-gray-400 text-sm mt-1">Manage and monitor your email campaigns</p>
          </div>
          <button onClick={() => setShowCompose(true)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Compose New Email
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard label="Scheduled" value={stats.scheduled} icon={<Calendar className="w-5 h-5" />} color="blue" />
          <StatCard label="Sent" value={stats.sent} icon={<Send className="w-5 h-5" />} color="green" />
          <StatCard label="Failed" value={stats.failed} icon={<Mail className="w-5 h-5" />} color="red" />
          <StatCard label="Total" value={stats.total} icon={<TrendingUp className="w-5 h-5" />} color="purple" />
        </div>

        {/* Table Card */}
        <div className="card">
          {/* Tabs + Search */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-5 border-b border-surface-border gap-4">
            <div className="flex gap-1">
              {(['scheduled', 'sent'] as TabType[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                    activeTab === tab
                      ? 'bg-brand-500 text-white'
                      : 'text-gray-400 hover:text-white hover:bg-surface-hover'
                  }`}
                >
                  {tab} Emails
                  {tab === 'scheduled' && stats.scheduled !== '0' && (
                    <span className="ml-2 bg-brand-500/30 text-brand-400 text-xs px-1.5 py-0.5 rounded-full">
                      {stats.scheduled}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <SearchBar value={searchQuery} onChange={setSearchQuery} />
              <button
                onClick={() => activeEmails.refetch()}
                className="btn-secondary text-sm py-1.5"
              >
                Refresh
              </button>
            </div>
          </div>

          <EmailTable
            emails={activeEmails.emails}
            loading={activeEmails.loading}
            error={activeEmails.error}
            type={activeTab}
            searchQuery={searchQuery}
          />

          {/* Pagination */}
          {activeEmails.total > activeEmails.limit && (
            <div className="flex items-center justify-between p-4 border-t border-surface-border">
              <p className="text-sm text-gray-400">
                Showing {((activeEmails.page - 1) * activeEmails.limit) + 1}–{Math.min(activeEmails.page * activeEmails.limit, activeEmails.total)} of {activeEmails.total}
              </p>
              <div className="flex gap-2">
                <button
                  disabled={activeEmails.page <= 1}
                  onClick={() => activeEmails.setPage((p) => p - 1)}
                  className="btn-secondary text-sm py-1.5 disabled:opacity-30"
                >
                  Previous
                </button>
                <button
                  disabled={activeEmails.page * activeEmails.limit >= activeEmails.total}
                  onClick={() => activeEmails.setPage((p) => p + 1)}
                  className="btn-secondary text-sm py-1.5 disabled:opacity-30"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Compose Modal */}
      {showCompose && (
        <ComposeModal
          onClose={() => setShowCompose(false)}
          onSuccess={() => {
            setShowCompose(false);
            scheduledEmails.refetch();
          }}
          senderEmail={user.email}
        />
      )}
    </div>
  );
}
