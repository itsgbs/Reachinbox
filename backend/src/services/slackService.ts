import axios from 'axios';
import { db } from '../config/database';

/**
 * Send a Slack notification when rate limit is hit.
 * Looks up user's Slack token from DB — does nothing if not connected.
 */
export async function sendSlackRateLimitNotification(
  userId: string,
  senderEmail: string,
  limitType: 'sender' | 'global',
  currentCount: number,
  limit: number
): Promise<void> {
  const result = await db.query(
    'SELECT slack_bot_token, slack_channel_id FROM users WHERE id=$1',
    [userId]
  );

  if (!result.rows.length || !result.rows[0].slack_bot_token) {
    // User hasn't connected Slack — do nothing
    return;
  }

  const { slack_bot_token: token, slack_channel_id: channel } = result.rows[0];

  if (!token || !channel) return;

  const message =
    limitType === 'sender'
      ? `🚨 *Rate limit hit!*\nSender \`${senderEmail}\` has reached *${currentCount}/${limit}* emails this hour.\nFuture emails from this sender will be delayed to the next hour.`
      : `🚨 *Global rate limit hit!*\n*${currentCount}/${limit}* emails sent this hour (global limit).\nFuture emails will be delayed to the next hour.`;

  await axios.post(
    'https://slack.com/api/chat.postMessage',
    {
      channel,
      text: message,
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: message },
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `📅 ${new Date().toUTCString()} | ReachInbox Scheduler`,
            },
          ],
        },
      ],
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  );
}
