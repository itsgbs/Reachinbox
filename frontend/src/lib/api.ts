import axios from 'axios';
import {
  PaginatedResponse,
  ScheduledEmail,
  ScheduleEmailPayload,
  ScheduleResult,
  EmailStats,
  Campaign,
  SlackStatus,
} from '../types';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
  withCredentials: true,
});

// Attach JWT token from localStorage
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Handle 401 — redirect to login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ─── Auth ──────────────────────────────────────────────────────────────────────
export const getMe = () => api.get('/auth/me').then((r) => r.data.user);

// ─── Emails ───────────────────────────────────────────────────────────────────
export const getScheduledEmails = (page = 1, limit = 20): Promise<PaginatedResponse<ScheduledEmail>> =>
  api.get(`/api/emails/scheduled?page=${page}&limit=${limit}`).then((r) => r.data);

export const getSentEmails = (page = 1, limit = 20): Promise<PaginatedResponse<ScheduledEmail>> =>
  api.get(`/api/emails/sent?page=${page}&limit=${limit}`).then((r) => r.data);

export const getEmailStats = (): Promise<EmailStats> =>
  api.get('/api/emails/stats').then((r) => r.data);

export const getCampaigns = (): Promise<{ campaigns: Campaign[] }> =>
  api.get('/api/emails/campaigns').then((r) => r.data);

export const searchEmails = (q: string, status?: string): Promise<{ emails: ScheduledEmail[]; total: any }> =>
  api.get(`/api/emails/search?q=${encodeURIComponent(q)}${status ? `&status=${status}` : ''}`).then((r) => r.data);

export async function scheduleEmail(payload: ScheduleEmailPayload): Promise<ScheduleResult> {
  const formData = new FormData();
  formData.append('senderEmail', payload.senderEmail);
  if (payload.senderName) formData.append('senderName', payload.senderName);
  formData.append('subject', payload.subject);
  formData.append('body', payload.body);
  formData.append('startAt', payload.startAt);
  formData.append('delayBetweenEmailsMs', String(payload.delayBetweenEmailsMs));
  formData.append('hourlyLimit', String(payload.hourlyLimit));
  if (payload.campaignName) formData.append('campaignName', payload.campaignName);
  if (payload.recipients?.length) formData.append('recipients', payload.recipients.join(','));
  if (payload.file) formData.append('file', payload.file);

  const response = await api.post('/api/emails/schedule', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
}

// ─── Slack ────────────────────────────────────────────────────────────────────
export const getSlackStatus = (): Promise<SlackStatus> =>
  api.get('/auth/slack/status').then((r) => r.data);

export const connectSlack = () => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : '';
  window.location.href = `${process.env.NEXT_PUBLIC_API_URL}/auth/slack/connect?_token=${token}`;
};

export const disconnectSlack = () => api.delete('/auth/slack/disconnect').then((r) => r.data);

export default api;
