'use client';

import { useState, useEffect, useCallback } from 'react';
import { ScheduledEmail, PaginatedResponse } from '../types';
import { getScheduledEmails, getSentEmails, getEmailStats } from '../lib/api';

export function useEmails(type: 'scheduled' | 'sent') {
  const [data, setData] = useState<PaginatedResponse<ScheduledEmail>>({
    emails: [],
    total: 0,
    page: 1,
    limit: 20,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const result = type === 'scheduled'
        ? await getScheduledEmails(page)
        : await getSentEmails(page);
      setData(result);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load emails');
    } finally {
      setLoading(false);
    }
  }, [type, page]);

  useEffect(() => {
    fetch();
    // Poll every 10 seconds for live updates
    const interval = setInterval(fetch, 10000);
    return () => clearInterval(interval);
  }, [fetch]);

  return { ...data, loading, error, page, setPage, refetch: fetch };
}

export function useEmailStats() {
  const [stats, setStats] = useState({ scheduled: '0', sent: '0', failed: '0', total: '0' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const data = await getEmailStats();
        setStats(data);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    };
    fetch();
    const interval = setInterval(fetch, 15000);
    return () => clearInterval(interval);
  }, []);

  return { stats, loading };
}
