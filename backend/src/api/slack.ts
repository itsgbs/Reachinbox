import { Router, Request, Response } from 'express';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { db } from '../config/database';

const router = Router();

const SLACK_SCOPES = 'chat:write,channels:read,channels:join';

// Helper: extract userId from Bearer header or ?_token query param (for browser redirects)
function extractUserId(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET || 'secret') as any;
      return decoded.id;
    } catch {}
  }
  const queryToken = req.query._token as string;
  if (queryToken) {
    try {
      const decoded = jwt.verify(queryToken, process.env.JWT_SECRET || 'secret') as any;
      return decoded.id;
    } catch {}
  }
  return null;
}

// Step 1: Redirect user to Slack OAuth
router.get('/connect', (req: Request, res: Response) => {
  const userId = extractUserId(req);
  if (!userId) return res.status(401).json({ error: 'Authorization required' });

  const state = Buffer.from(JSON.stringify({ userId })).toString('base64');

  const url = new URL('https://slack.com/oauth/v2/authorize');
  url.searchParams.set('client_id', process.env.SLACK_CLIENT_ID!);
  url.searchParams.set('scope', SLACK_SCOPES);
  url.searchParams.set('redirect_uri', process.env.SLACK_REDIRECT_URI!);
  url.searchParams.set('state', state);

  return res.redirect(url.toString());
});

// Step 2: Slack OAuth callback
router.get('/callback', async (req: Request, res: Response) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect(`${process.env.FRONTEND_URL}/dashboard?slack_error=${error}`);
  }

  if (!code || !state) {
    return res.redirect(`${process.env.FRONTEND_URL}/dashboard?slack_error=missing_params`);
  }

  try {
    const stateData = JSON.parse(Buffer.from(state as string, 'base64').toString());
    const { userId } = stateData;

    // Exchange code for token
    const tokenRes = await axios.post('https://slack.com/api/oauth.v2.access', null, {
      params: {
        client_id: process.env.SLACK_CLIENT_ID,
        client_secret: process.env.SLACK_CLIENT_SECRET,
        code,
        redirect_uri: process.env.SLACK_REDIRECT_URI,
      },
    });

    const data = tokenRes.data;
    if (!data.ok) {
      throw new Error(data.error || 'Slack OAuth failed');
    }

    const botToken = data.access_token;
    const teamId = data.team?.id;

    // Get default channel
    let channelId = data.incoming_webhook?.channel_id || null;
    if (!channelId) {
      try {
        const channelsRes = await axios.get('https://slack.com/api/conversations.list', {
          headers: { Authorization: `Bearer ${botToken}` },
          params: { types: 'public_channel', limit: 10 },
        });
        const general = channelsRes.data.channels?.find((c: any) => c.name === 'general');
        channelId = general?.id;
      } catch {}
    }

    await db.query(
      `UPDATE users SET slack_bot_token=$1, slack_team_id=$2, slack_channel_id=$3 WHERE id=$4`,
      [botToken, teamId, channelId, userId]
    );

    return res.redirect(`${process.env.FRONTEND_URL}/dashboard?slack_connected=true`);
  } catch (err: any) {
    console.error('Slack callback error:', err);
    return res.redirect(`${process.env.FRONTEND_URL}/dashboard?slack_error=callback_failed`);
  }
});

// Get Slack status
router.get('/status', requireAuth, async (req: AuthRequest, res: Response) => {
  const result = await db.query(
    'SELECT slack_bot_token IS NOT NULL as connected, slack_team_id FROM users WHERE id=$1',
    [req.userId]
  );
  return res.json(result.rows[0] || { connected: false });
});

// Disconnect Slack
router.delete('/disconnect', requireAuth, async (req: AuthRequest, res: Response) => {
  await db.query(
    'UPDATE users SET slack_bot_token=NULL, slack_team_id=NULL, slack_channel_id=NULL WHERE id=$1',
    [req.userId]
  );
  return res.json({ success: true });
});

export default router;
