// Shared TypeScript types across backend
export interface User {
  id: string;
  google_id: string;
  email: string;
  name: string;
  avatar_url?: string;
  slack_access_token?: string;
  slack_webhook_url?: string;
  slack_team_id?: string;
  slack_channel?: string;
  created_at: Date;
  updated_at: Date;
}

export interface Sender {
  id: string;
  user_id: string;
  email: string;
  name: string;
  ethereal_user: string;
  ethereal_pass: string;
  created_at: Date;
}

export interface EmailJob {
  id: string;
  user_id: string;
  sender_id: string;
  sender_email: string;
  recipient_email: string;
  subject: string;
  body: string;
  scheduled_at: Date;
  sent_at?: Date;
  status: EmailStatus;
  bull_job_id?: string;
  idempotency_key: string;
  error_message?: string;
  retry_count: number;
  campaign_id?: string;
  created_at: Date;
  updated_at: Date;
}

export type EmailStatus = 'scheduled' | 'processing' | 'sent' | 'failed' | 'cancelled';

export interface Campaign {
  id: string;
  user_id: string;
  sender_id: string;
  name: string;
  subject: string;
  body: string;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  delay_between_emails_ms: number;
  hourly_limit: number;
  scheduled_start_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface ScheduleEmailRequest {
  senderEmail: string;
  recipients: string[];
  subject: string;
  body: string;
  scheduledAt: string; // ISO string
  delayBetweenEmailsMs?: number;
  hourlyLimit?: number;
  campaignName?: string;
}

export interface BullEmailJobData {
  emailJobId: string;
  userId: string;
  senderId: string;
  senderEmail: string;
  recipientEmail: string;
  subject: string;
  body: string;
  idempotencyKey: string;
  campaignId?: string;
  attemptNumber?: number;
}

export interface RateLimitState {
  senderEmail: string;
  windowStart: number; // epoch hour
  count: number;
  limit: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
