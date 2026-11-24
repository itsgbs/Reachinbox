import { query } from '../config/database';
import { EmailJob, EmailStatus, PaginatedResult } from '../types';

export class EmailJobModel {
  static async create(data: {
    userId: string;
    senderId: string;
    senderEmail: string;
    recipientEmail: string;
    subject: string;
    body: string;
    scheduledAt: Date;
    idempotencyKey: string;
    campaignId?: string;
    bullJobId?: string;
  }): Promise<EmailJob> {
    const { rows } = await query<EmailJob>(
      `INSERT INTO email_jobs
         (user_id, sender_id, sender_email, recipient_email, subject, body,
          scheduled_at, idempotency_key, campaign_id, bull_job_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'scheduled')
       RETURNING *`,
      [
        data.userId, data.senderId, data.senderEmail, data.recipientEmail,
        data.subject, data.body, data.scheduledAt, data.idempotencyKey,
        data.campaignId, data.bullJobId,
      ]
    );
    return rows[0];
  }

  static async findById(id: string): Promise<EmailJob | null> {
    const { rows } = await query<EmailJob>(
      'SELECT * FROM email_jobs WHERE id = $1',
      [id]
    );
    return rows[0] || null;
  }

  static async findByIdempotencyKey(key: string): Promise<EmailJob | null> {
    const { rows } = await query<EmailJob>(
      'SELECT * FROM email_jobs WHERE idempotency_key = $1',
      [key]
    );
    return rows[0] || null;
  }

  static async updateStatus(
    id: string,
    status: EmailStatus,
    extra?: {
      sentAt?: Date;
      errorMessage?: string;
      retryCount?: number;
      previewUrl?: string;
      bullJobId?: string;
    }
  ): Promise<EmailJob | null> {
    const { rows } = await query<EmailJob>(
      `UPDATE email_jobs SET
         status = $1,
         sent_at = COALESCE($2, sent_at),
         error_message = COALESCE($3, error_message),
         retry_count = COALESCE($4, retry_count),
         preview_url = COALESCE($5, preview_url),
         bull_job_id = COALESCE($6, bull_job_id),
         updated_at = NOW()
       WHERE id = $7 RETURNING *`,
      [
        status,
        extra?.sentAt,
        extra?.errorMessage,
        extra?.retryCount,
        extra?.previewUrl,
        extra?.bullJobId,
        id,
      ]
    );
    return rows[0] || null;
  }

  static async getScheduled(
    userId: string,
    page = 1,
    pageSize = 20
  ): Promise<PaginatedResult<EmailJob>> {
    const offset = (page - 1) * pageSize;
    const { rows } = await query<EmailJob>(
      `SELECT * FROM email_jobs
       WHERE user_id = $1 AND status = 'scheduled'
       ORDER BY scheduled_at ASC
       LIMIT $2 OFFSET $3`,
      [userId, pageSize, offset]
    );
    const { rows: countRows } = await query<{ count: string }>(
      `SELECT COUNT(*) FROM email_jobs WHERE user_id = $1 AND status = 'scheduled'`,
      [userId]
    );
    const total = parseInt(countRows[0].count, 10);
    return { data: rows, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  static async getSent(
    userId: string,
    page = 1,
    pageSize = 20
  ): Promise<PaginatedResult<EmailJob>> {
    const offset = (page - 1) * pageSize;
    const { rows } = await query<EmailJob>(
      `SELECT * FROM email_jobs
       WHERE user_id = $1 AND status IN ('sent', 'failed')
       ORDER BY sent_at DESC NULLS LAST, updated_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, pageSize, offset]
    );
    const { rows: countRows } = await query<{ count: string }>(
      `SELECT COUNT(*) FROM email_jobs WHERE user_id = $1 AND status IN ('sent', 'failed')`,
      [userId]
    );
    const total = parseInt(countRows[0].count, 10);
    return { data: rows, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  static async search(
    userId: string,
    q: string,
    page = 1,
    pageSize = 20
  ): Promise<PaginatedResult<EmailJob>> {
    const offset = (page - 1) * pageSize;
    const { rows } = await query<EmailJob>(
      `SELECT * FROM email_jobs
       WHERE user_id = $1 AND (
         recipient_email ILIKE $2 OR subject ILIKE $2 OR sender_email ILIKE $2
       )
       ORDER BY created_at DESC
       LIMIT $3 OFFSET $4`,
      [userId, `%${q}%`, pageSize, offset]
    );
    const { rows: countRows } = await query<{ count: string }>(
      `SELECT COUNT(*) FROM email_jobs
       WHERE user_id = $1 AND (
         recipient_email ILIKE $2 OR subject ILIKE $2 OR sender_email ILIKE $2
       )`,
      [userId, `%${q}%`]
    );
    const total = parseInt(countRows[0].count, 10);
    return { data: rows, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  /** All future scheduled jobs (for restart recovery) */
  static async getFutureScheduled(): Promise<EmailJob[]> {
    const { rows } = await query<EmailJob>(
      `SELECT * FROM email_jobs
       WHERE status = 'scheduled' AND scheduled_at > NOW()
       ORDER BY scheduled_at ASC`
    );
    return rows;
  }

  static async getStats(userId: string) {
    const { rows } = await query<{ status: string; count: string }>(
      `SELECT status, COUNT(*) as count FROM email_jobs
       WHERE user_id = $1 GROUP BY status`,
      [userId]
    );
    return rows.reduce(
      (acc, r) => ({ ...acc, [r.status]: parseInt(r.count, 10) }),
      {} as Record<string, number>
    );
  }
}
