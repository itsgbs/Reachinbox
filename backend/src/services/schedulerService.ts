import { emailQueue, EmailJobData } from '../queues/emailQueue';
import { db } from '../config/database';
import { esClient, EMAIL_INDEX } from '../config/elasticsearch';
import { v4 as uuidv4 } from 'uuid';
import { ensureSender } from './senderService';

export interface ScheduleEmailRequest {
  userId: string;
  senderEmail: string;
  senderName?: string;
  recipients: string[];
  subject: string;
  body: string;
  startAt: Date;
  delayBetweenEmailsMs?: number;
  hourlyLimit?: number;
  campaignName?: string;
}

export interface ScheduleResult {
  campaignId: string;
  scheduled: number;
  jobIds: string[];
}

export async function scheduleEmailCampaign(req: ScheduleEmailRequest): Promise<ScheduleResult> {
  const {
    userId,
    senderEmail,
    senderName,
    recipients,
    subject,
    body,
    startAt,
    delayBetweenEmailsMs = parseInt(process.env.MIN_DELAY_BETWEEN_SENDS_MS || '2000', 10),
    hourlyLimit = parseInt(process.env.MAX_EMAILS_PER_HOUR_PER_SENDER || '50', 10),
    campaignName = `Campaign ${new Date().toISOString()}`,
  } = req;

  // Ensure sender exists
  const senderId = await ensureSender(userId, senderEmail, senderName);

  // Create campaign
  const campaignResult = await db.query(
    `INSERT INTO campaigns (user_id, sender_id, name, subject, body, hourly_limit, delay_between_emails_ms, total_recipients)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [userId, senderId, campaignName, subject, body, hourlyLimit, delayBetweenEmailsMs, recipients.length]
  );
  const campaignId = campaignResult.rows[0].id;

  const jobIds: string[] = [];
  const now = Date.now();

  for (let i = 0; i < recipients.length; i++) {
    const recipient = recipients[i];
    const emailId = uuidv4();
    
    // Idempotency key: campaign + recipient (prevents duplicate sends on restart)
    const idempotencyKey = `${campaignId}:${recipient}`;

    // Calculate scheduled time: startAt + (i * delayBetweenEmailsMs)
    const scheduledAt = new Date(startAt.getTime() + i * delayBetweenEmailsMs);
    const delay = Math.max(0, scheduledAt.getTime() - now);

    // Check if this combination already exists (idempotency)
    const existingCheck = await db.query(
      'SELECT id, job_id FROM scheduled_emails WHERE idempotency_key=$1',
      [idempotencyKey]
    );

    if (existingCheck.rows.length) {
      // Already scheduled, skip
      jobIds.push(existingCheck.rows[0].job_id || 'existing');
      continue;
    }

    // Insert into DB first
    await db.query(
      `INSERT INTO scheduled_emails 
       (id, user_id, campaign_id, sender_id, sender_email, recipient_email, subject, body, scheduled_at, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [emailId, userId, campaignId, senderId, senderEmail, recipient, subject, body, scheduledAt.toISOString(), idempotencyKey]
    );

    // Create BullMQ delayed job
    const jobData: EmailJobData = {
      emailId,
      userId,
      campaignId,
      senderId,
      senderEmail,
      recipientEmail: recipient,
      subject,
      body,
      idempotencyKey,
      scheduledAt: scheduledAt.toISOString(),
      delayBetweenEmailsMs,
      hourlyLimit,
    };

    const job = await emailQueue.add('send-email', jobData, {
      delay,
      jobId: `email-${idempotencyKey}`, // Prevents duplicate jobs on restart
    });

    // Update DB with job ID
    await db.query(
      'UPDATE scheduled_emails SET job_id=$1 WHERE id=$2',
      [job.id, emailId]
    );

    // Index in Elasticsearch
    await esClient.index({
      index: EMAIL_INDEX,
      id: emailId,
      document: {
        id: emailId,
        user_id: userId,
        campaign_id: campaignId,
        sender_email: senderEmail,
        recipient_email: recipient,
        subject,
        body,
        status: 'scheduled',
        scheduled_at: scheduledAt.toISOString(),
        created_at: new Date().toISOString(),
        job_id: job.id,
        idempotency_key: idempotencyKey,
      },
    }).catch((err) => console.warn('ES index failed:', err));

    jobIds.push(job.id || '');
  }

  return { campaignId, scheduled: jobIds.length, jobIds };
}
