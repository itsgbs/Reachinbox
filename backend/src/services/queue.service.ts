import { Queue, QueueEvents } from 'bullmq';
import { createRedisConnection } from '../config/redis';
import { logger } from '../utils/logger';
import { BullEmailJobData } from '../types';

export const EMAIL_QUEUE_NAME = 'email-send';

// Single shared queue instance
let emailQueue: Queue<BullEmailJobData> | null = null;

export function getEmailQueue(): Queue<BullEmailJobData> {
  if (!emailQueue) {
    emailQueue = new Queue<BullEmailJobData>(EMAIL_QUEUE_NAME, {
      connection: createRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: { count: 1000 }, // Keep last 1000 completed
        removeOnFail: { count: 500 },      // Keep last 500 failed
      },
    });
    logger.info(`BullMQ queue "${EMAIL_QUEUE_NAME}" initialized`);
  }
  return emailQueue;
}

export async function scheduleEmailJob(
  data: BullEmailJobData,
  scheduledAt: Date,
  delayMs?: number
): Promise<string> {
  const queue = getEmailQueue();
  const now = Date.now();
  const scheduledTime = scheduledAt.getTime();
  const delay = delayMs !== undefined ? delayMs : Math.max(0, scheduledTime - now);

  const job = await queue.add(
    'send-email',
    data,
    {
      jobId: data.idempotencyKey, // Idempotent: same key = same job, no duplicates
      delay,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    }
  );

  logger.info(`Scheduled email job ${job.id} for ${data.recipientEmail} at ${scheduledAt.toISOString()} (delay: ${delay}ms)`);
  return job.id!;
}

export async function getQueueMetrics() {
  const queue = getEmailQueue();
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
  ]);
  return { waiting, active, completed, failed, delayed };
}
