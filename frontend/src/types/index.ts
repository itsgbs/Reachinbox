// API Response Types
export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
}

export interface Campaign {
  id: string;
  user_id: string;
  sender_email: string;
  name: string;
  subject: string;
  body: string;
  hourly_limit: number;
  delay_between_emails_ms: number;
  status: 'scheduled' | 'running' | 'completed' | 'failed';
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  created_at: string;
  updated_at: string;
}

export interface ScheduledEmail {
  id: string;
  user_id: string;
  campaign_id: string;
  campaign_name?: string;
  sender_email: string;
  recipient_email: string;
  subject: string;
  body: string;
  scheduled_at: string;
  status: 'scheduled' | 'sent' | 'failed';
  job_id?: string;
  sent_at?: string;
  error_message?: string;
  preview_url?: string;
  message_id?: string;
  created_at: string;
}

export interface EmailStats {
  scheduled: string;
  sent: string;
  failed: string;
  total: string;
}

export interface PaginatedResponse<T> {
  emails: T[];
  total: number;
  page: number;
  limit: number;
}

export interface ScheduleEmailPayload {
  senderEmail: string;
  senderName?: string;
  subject: string;
  body: string;
  startAt: string;
  delayBetweenEmailsMs: number;
  hourlyLimit: number;
  campaignName?: string;
  recipients?: string[];
  file?: File;
}

export interface ScheduleResult {
  success: boolean;
  campaignId: string;
  scheduled: number;
  message: string;
}

export interface SlackStatus {
  connected: boolean;
  slack_team_id?: string;
}
