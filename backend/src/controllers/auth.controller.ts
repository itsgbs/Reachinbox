import { Request, Response } from 'express';
import { UserModel } from '../models/user.model';
import { logger } from '../utils/logger';
import { config } from '../config';
import axios from 'axios';

export class AuthController {
  static googleLogin(_req: Request, res: Response): void {
    const params = new URLSearchParams({
      client_id: config.google.clientId,
      redirect_uri: config.google.callbackUrl,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'select_account',
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  }

  static async googleCallback(req: Request, res: Response): Promise<void> {
    const { code, error } = req.query;

    if (error || !code) {
      res.redirect(`${config.frontendUrl}/login?error=oauth_failed`);
      return;
    }

    try {
      // Exchange code for tokens
      const tokenRes = await axios.post('https://oauth2.googleapis.com/token', {
        code,
        client_id: config.google.clientId,
        client_secret: config.google.clientSecret,
        redirect_uri: config.google.callbackUrl,
        grant_type: 'authorization_code',
      });

      const { access_token } = tokenRes.data;

      // Get user profile
      const profileRes = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${access_token}` },
      });

      const profile = profileRes.data;
      const user = await UserModel.upsertGoogleUser({
        googleId: profile.id,
        email: profile.email,
        name: profile.name,
        avatarUrl: profile.picture,
      });

      req.session.userId = user.id;
      req.session.save((err) => {
        if (err) logger.error('Session save error', err);
        res.redirect(`${config.frontendUrl}/dashboard`);
      });
    } catch (err) {
      logger.error('Google OAuth callback error', err);
      res.redirect(`${config.frontendUrl}/login?error=server_error`);
    }
  }

  static async getMe(req: Request, res: Response): Promise<void> {
    try {
      const user = await UserModel.findById(req.session.userId!);
      if (!user) {
        res.status(404).json({ success: false, error: 'User not found' });
        return;
      }
      // Don't expose tokens
      const { slack_access_token, ...safeUser } = user;
      res.json({
        success: true,
        data: {
          ...safeUser,
          slackConnected: !!slack_access_token,
        },
      });
    } catch (err) {
      res.status(500).json({ success: false, error: 'Failed to fetch user' });
    }
  }

  static logout(req: Request, res: Response): void {
    req.session.destroy((err) => {
      if (err) logger.error('Session destroy error', err);
      res.json({ success: true, message: 'Logged out' });
    });
  }

  // Slack OAuth
  static slackConnect(req: Request, res: Response): void {
    const params = new URLSearchParams({
      client_id: config.slack.clientId,
      redirect_uri: config.slack.redirectUri,
      scope: 'chat:write,incoming-webhook',
      state: req.session.userId || '',
    });
    res.redirect(`https://slack.com/oauth/v2/authorize?${params}`);
  }

  static async slackCallback(req: Request, res: Response): Promise<void> {
    const { code, state: userId, error } = req.query;

    if (error || !code || !userId) {
      res.redirect(`${config.frontendUrl}/dashboard?slackError=1`);
      return;
    }

    try {
      const tokenRes = await axios.post(
        'https://slack.com/api/oauth.v2.access',
        new URLSearchParams({
          code: code as string,
          client_id: config.slack.clientId,
          client_secret: config.slack.clientSecret,
          redirect_uri: config.slack.redirectUri,
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      const data = tokenRes.data;
      if (!data.ok) {
        throw new Error(data.error || 'Slack OAuth failed');
      }

      await UserModel.updateSlackToken(userId as string, {
        slackAccessToken: data.access_token,
        slackTeamId: data.team?.id || '',
        slackChannel: data.incoming_webhook?.channel,
        slackWebhookUrl: data.incoming_webhook?.url,
      });

      res.redirect(`${config.frontendUrl}/dashboard?slackConnected=1`);
    } catch (err) {
      logger.error('Slack OAuth error', err);
      res.redirect(`${config.frontendUrl}/dashboard?slackError=1`);
    }
  }

  static async slackDisconnect(req: Request, res: Response): Promise<void> {
    try {
      await UserModel.disconnectSlack(req.session.userId!);
      res.json({ success: true, message: 'Slack disconnected' });
    } catch {
      res.status(500).json({ success: false, error: 'Failed to disconnect Slack' });
    }
  }
}
