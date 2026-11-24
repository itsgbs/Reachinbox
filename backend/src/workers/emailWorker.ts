import 'dotenv/config';
import { Worker, Job } from 'bullmq';
import { createRedisConnection, redisClient } from '../config/redis';
import { db } from '../config/database';
import { esClient, EMAIL_INDEX } from '../config/elasticsearch';
import { EmailJobData } from '../queues/emailQueue';
import { createTransport, getTestMessageUrl } from 'nodemailer';
import { sendSlackRateLimitNotification } from '../services/slackService';

const WORKER_CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '5', 10);
const MIN_DELAY_MS = parseInt(process.env.MIN_DELAY_BETWEEN_SENDS_MS || '2000', 10);
const MAX_EMAILS_PER_HOUR = parseInt(process.env.MAX_EMAILS_PER_HOUR || '200', 10);
const MAX_EMAILS_PER_HOUR_PER_SENDER = parseInt(process.env.MAX_EMAILS_PER_HOUR_PER_SENDER || '50', 10);

/**
 * Get the current hour window key for rate limiting.
 * Format: ratelimit:sender:{senderEmail}:hour:{YYYY-MM-DD-HH}
 */
function getHourWindowKey(senderEmail: string): string {
  const now = new Date();
  const hourKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}-${String(now.getUTCHours()).padStart(2, '0')}`;
  return `ratelimit:sender:${senderEmail}:hour:${hourKey}`;
}

function getGlobalHourWindowKey(): string {
  const now = new Date();
  const hourKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}-${String(now.getUTCHours()).padStart(2, '0')}`;
  return `ratelimit:global:hour:${hourKey}`;
}

/**
 * Atomically increment Redis rate limit counter and check if limit exceeded.
 * Returns true if rate limit is NOT exceeded (email can be sent).
 * Returns false if limit IS exceeded.
 */
async function checkAndIncrementRateLimit(senderEmail: string, userId: string): Promise<{ allowed: boolean; nextWindowMs: number }> {
  const senderKey = getHourWindowKey(senderEmail);
  const globalKey = getGlobalHourWindowKey();
  const ttl = 3600; // 1 hour in seconds

  // Atomic increment using Redis pipeline
  const pipeline = redisClient.pipeline();
  pipeline.incr(senderKey);
  pipeline.expire(senderKey, ttl);
  pipeline.incr(globalKey);
  pipeline.expire(globalKey, ttl);
  const results = await pipeline.exec();

  if (!results) {
    return { allowed: true, nextWindowMs: 0 };
  }

  const senderCount = results[0][1] as number;
  const globalCount = results[2][1] as number;

  // Calculate next window start
  const now = new Date();
  const nextHour = new Date(now);
  nextHour.setUTCMinutes(0, 0, 0);
  nextHour.setUTCHours(nextHour.getUTCHours() + 1);
  const nextWindowMs = nextHour.getTime() - now.getTime();

  if (senderCount > MAX_EMAILS_PER_HOUR_PER_SENDER) {
    // Notify Slack
    try {
      await sendSlackRateLimitNotification(userId, senderEmail, 'sender', senderCount, MAX_EMAILS_PER_HOUR_PER_SENDER);
    } catch (e) {
      console.warn('Slack notification failed:', e);
    }
    return { allowed: false, nextWindowMs };
  }

  if (globalCount > MAX_EMAILS_PER_HOUR) {
    try {
      await sendSlackRateLimitNotification(userId, senderEmail, 'global', globalCount, MAX_EMAILS_PER_HOUR);
    } catch (e) {
      console.warn('Slack notification failed:', e);
    }
    return { allowed: false, nextWindowMs };
  }

  return { allowed: true, nextWindowMs: 0 };
}

/**
 * Create a Nodemailer transport for Ethereal Email
 */
async function getTransport(senderEmail: string) {
  // Look up sender credentials from DB
  const result = await db.query(
    'SELECT ethereal_user, ethereal_pass, smtp_host, smtp_port FROM senders WHERE email=$1',
    [senderEmail]
  );

  if (result.rows.length && result.rows[0].ethereal_user) {
    return createTransport({
      host: result.rows[0].smtp_host || 'smtp.ethereal.email',
      port: result.rows[0].smtp_port || 587,
      secure: false,
      auth: {
        user: result.rows[0].ethereal_user,
        pass: result.rows[0].ethereal_pass,
      },
    });
  }

  // Fallback: use env
  return createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false,
    auth: {
      user: process.env.ETHEREAL_USER,
      pass: process.env.ETHEREAL_PASS,
    },
  });
}

const worker = new Worker<EmailJobData>(
  'email-queue',
  async (job: Job<EmailJobData>) => {
    const data = job.data;
    console.log(`📧 Processing email job ${job.id} for ${data.recipientEmail}`);

    // ✅ Idempotency check — do not re-send if already sent
    const existing = await db.query(
      `SELECT status, preview_url FROM scheduled_emails WHERE idempotency_key=$1`,
      [data.idempotencyKey]
    );

    if (existing.rows.length && existing.rows[0].status === 'sent') {
      console.log(`⚠️ Email ${data.idempotencyKey} already sent, skipping.`);
      return { skipped: true, reason: 'already_sent' };
    }

    // ✅ Rate limit check (Redis-backed, safe across multiple workers)
    const { allowed, nextWindowMs } = await checkAndIncrementRateLimit(data.senderEmail, data.userId);

    if (!allowed) {
      console.log(`⏳ Rate limit hit for ${data.senderEmail}. Rescheduling in ${nextWindowMs}ms`);
      // Delay job to next window — preserves order
      await job.moveToDelayed(Date.now() + nextWindowMs + Math.floor(Math.random() * 5000));
      return { rescheduled: true, reason: 'rate_limit', nextWindowMs };
    }

    // ✅ Minimum delay between sends
    await new Promise((resolve) => setTimeout(resolve, MIN_DELAY_MS));

    // ✅ Send email via Ethereal SMTP
    const transport = await getTransport(data.senderEmail);
    
    let info: any;
    try {
      info = await transport.sendMail({
        from: `"ReachInbox Scheduler" <${data.senderEmail}>`,
        to: data.recipientEmail,
        subject: data.subject,
        html: data.body,
      });
    } catch (smtpErr: any) {
      // Update DB status to failed
      await db.query(
        `UPDATE scheduled_emails SET status='failed', error_message=$1, updated_at=NOW() WHERE idempotency_key=$2`,
        [smtpErr.message, data.idempotencyKey]
      );
      // Update Elasticsearch
      await esClient.update({
        index: EMAIL_INDEX,
        id: data.emailId,
        doc: { status: 'failed', error_message: smtpErr.message },
      }).catch(() => {});
      throw smtpErr;
    }

    const previewUrl = getTestMessageUrl(info) || '';
    const sentAt = new Date().toISOString();

    // ✅ Update DB
    await db.query(
      `UPDATE scheduled_emails 
       SET status='sent', sent_at=$1, preview_url=$2, message_id=$3, updated_at=NOW()
       WHERE idempotency_key=$4`,
      [sentAt, previewUrl, info.messageId, data.idempotencyKey]
    );

    // Update campaign sent count
    await db.query(
      `UPDATE campaigns SET sent_count=sent_count+1, updated_at=NOW() WHERE id=$1`,
      [data.campaignId]
    );

    // ✅ Update Elasticsearch
    await esClient.update({
      index: EMAIL_INDEX,
      id: data.emailId,
      doc: {
        status: 'sent',
        sent_at: sentAt,
        preview_url: previewUrl,
      },
    }).catch((err) => console.warn('ES update failed:', err));

    console.log(`✅ Email sent to ${data.recipientEmail}. Preview: ${previewUrl}`);

    return { success: true, previewUrl, messageId: info.messageId };
  },
  {
    connection: createRedisConnection(),
    concurrency: WORKER_CONCURRENCY,
    // BullMQ limiter as an extra safety net (in addition to Redis counter)
    limiter: {
      max: 100,
      duration: 60000, // max 100 jobs per minute across all workers
    },
  }
);

worker.on('completed', (job, result) => {
  console.log(`✅ Job ${job.id} completed`, result);
});

worker.on('failed', (job, err) => {
  console.error(`❌ Job ${job?.id} failed:`, err.message);
});

worker.on('stalled', (jobId) => {
  console.warn(`⚠️ Job ${jobId} stalled`);
});

console.log(`🔄 Email worker started with concurrency=${WORKER_CONCURRENCY}, minDelay=${MIN_DELAY_MS}ms`);

export { worker };
