import { redisConnection } from '../config/redis';
import { config } from '../config';
import { logger } from '../utils/logger';
import { UserModel } from '../models/user.model';
import axios from 'axios';

/**
 * Rate limiting strategy:
 * - Use Redis INCR + EXPIREAT keyed by: `ratelimit:{senderEmail}:{hourWindow}`
 * - hourWindow = Math.floor(Date.now() / 3600000) → unique per UTC hour
 * - On each email send attempt, check the counter before processing
 * - If limit reached: re-delay the job to next hour window + notify Slack
 * - Keys auto-expire after the hour passes (we set expire to end of current hour)
 * - Safe across multiple workers because Redis INCR is atomic
 */

const RATE_LIMIT_PREFIX = 'ratelimit';
const GLOBAL_RATE_LIMIT_PREFIX = 'ratelimit:global';

export function getCurrentHourWindow(): number {
  return Math.floor(Date.now() / 3600000);
}

export function getNextHourWindowMs(): number {
  const currentWindow = getCurrentHourWindow();
  return (currentWindow + 1) * 3600000 - Date.now();
}

function rateLimitKey(senderEmail: string, hourWindow: number): string {
  return `${RATE_LIMIT_PREFIX}:${senderEmail}:${hourWindow}`;
}

function globalRateLimitKey(hourWindow: number): string {
  return `${GLOBAL_RATE_LIMIT_PREFIX}:${hourWindow}`;
}

/**
 * Atomically increment and check rate limit for a sender.
 * Returns { allowed: boolean, currentCount: number, limit: number, msUntilNextWindow: number }
 */
export async function checkAndIncrementRateLimit(
  senderEmail: string,
  limitOverride?: number
): Promise<{ allowed: boolean; currentCount: number; limit: number; msUntilNextWindow: number }> {
  const hourWindow = getCurrentHourWindow();
  const perSenderLimit = limitOverride ?? config.rateLimit.maxEmailsPerHourPerSender;
  const globalLimit = config.rateLimit.maxEmailsPerHour;
  const msUntilNextWindow = getNextHourWindowMs();

  const senderKey = rateLimitKey(senderEmail, hourWindow);
  const globalKey = globalRateLimitKey(hourWindow);

  // Use pipeline for atomicity
  const pipeline = redisConnection.pipeline();
  pipeline.incr(senderKey);
  pipeline.incr(globalKey);

  // Calculate seconds until end of this hour for expiry
  const secondsUntilNextHour = Math.ceil(msUntilNextWindow / 1000) + 10;
  pipeline.expire(senderKey, secondsUntilNextHour);
  pipeline.expire(globalKey, secondsUntilNextHour);

  const results = await pipeline.exec();
  const senderCount = (results![0][1] as number) || 0;
  const globalCount = (results![1][1] as number) || 0;

  if (senderCount > perSenderLimit || globalCount > globalLimit) {
    // Decrement since we over-counted
    await redisConnection.pipeline()
      .decr(senderKey)
      .decr(globalKey)
      .exec();

    logger.warn(`Rate limit hit for sender ${senderEmail}: ${senderCount}/${perSenderLimit} (global: ${globalCount}/${globalLimit})`);
    return {
      allowed: false,
      currentCount: senderCount,
      limit: perSenderLimit,
      msUntilNextWindow,
    };
  }

  return {
    allowed: true,
    currentCount: senderCount,
    limit: perSenderLimit,
    msUntilNextWindow,
  };
}

/**
 * Get current rate limit counts without incrementing.
 */
export async function getRateLimitStatus(senderEmail: string): Promise<{
  senderCount: number;
  globalCount: number;
  senderLimit: number;
  globalLimit: number;
}> {
  const hourWindow = getCurrentHourWindow();
  const senderKey = rateLimitKey(senderEmail, hourWindow);
  const globalKey = globalRateLimitKey(hourWindow);

  const [senderCountStr, globalCountStr] = await redisConnection.mget(senderKey, globalKey);
  return {
    senderCount: parseInt(senderCountStr || '0', 10),
    globalCount: parseInt(globalCountStr || '0', 10),
    senderLimit: config.rateLimit.maxEmailsPerHourPerSender,
    globalLimit: config.rateLimit.maxEmailsPerHour,
  };
}

/**
 * Send Slack notification when rate limit is hit.
 * Gracefully no-ops if the user hasn't connected Slack.
 */
export async function notifySlackRateLimit(
  userId: string,
  senderEmail: string,
  currentCount: number,
  limit: number,
  msUntilNextWindow: number
): Promise<void> {
  try {
    const user = await UserModel.findById(userId);
    if (!user || !user.slack_access_token) {
      logger.info(`Slack not connected for user ${userId}, skipping rate limit notification`);
      return;
    }

    const minutesUntilReset = Math.ceil(msUntilNextWindow / 60000);
    const message = {
      text: `⚠️ *Rate Limit Reached* for sender \`${senderEmail}\`\n` +
            `• Emails sent this hour: *${currentCount}/${limit}*\n` +
            `• Next window opens in: *${minutesUntilReset} minute(s)*\n` +
            `• Affected emails will be automatically rescheduled to the next hour.`,
    };

    // Try webhook first, then fall back to chat.postMessage
    if (user.slack_webhook_url) {
      await axios.post(user.slack_webhook_url, message, { timeout: 5000 });
    } else if (user.slack_access_token && user.slack_channel) {
      await axios.post(
        'https://slack.com/api/chat.postMessage',
        {
          channel: user.slack_channel,
          text: message.text,
          parse: 'mrkdwn',
        },
        {
          headers: {
            Authorization: `Bearer ${user.slack_access_token}`,
            'Content-Type': 'application/json',
          },
          timeout: 5000,
        }
      );
    }

    logger.info(`Slack rate limit notification sent for user ${userId}, sender ${senderEmail}`);
  } catch (err) {
    // Never crash the worker due to Slack notification failure
    logger.error(`Failed to send Slack notification for user ${userId}`, err);
  }
}
