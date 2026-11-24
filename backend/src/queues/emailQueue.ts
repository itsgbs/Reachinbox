import { Queue } from 'bullmq';
import { createRedisConnection } from '../config/redis';

export interface EmailJobData {
  emailId: string;
  userId: string;
  campaignId: string;
  senderId: string;
  senderEmail: string;
  recipientEmail: string;
  subject: string;
  body: string;
  idempotencyKey: string;
  scheduledAt: string;
  delayBetweenEmailsMs: number;
  hourlyLimit: number;
}

export const emailQueue = new Queue<EmailJobData>('email-queue', {
  connection: createRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: { count: 1000, age: 7 * 24 * 60 * 60 }, // Keep last 1000, max 7 days
    removeOnFail: { count: 500, age: 30 * 24 * 60 * 60 }, // Keep failures for 30 days
  },
});
