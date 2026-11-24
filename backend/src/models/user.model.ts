import { query } from '../config/database';
import { User } from '../types';

export class UserModel {
  static async findByGoogleId(googleId: string): Promise<User | null> {
    const { rows } = await query<User>(
      'SELECT * FROM users WHERE google_id = $1',
      [googleId]
    );
    return rows[0] || null;
  }

  static async findById(id: string): Promise<User | null> {
    const { rows } = await query<User>(
      'SELECT * FROM users WHERE id = $1',
      [id]
    );
    return rows[0] || null;
  }

  static async findByEmail(email: string): Promise<User | null> {
    const { rows } = await query<User>(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    return rows[0] || null;
  }

  static async upsertGoogleUser(profile: {
    googleId: string;
    email: string;
    name: string;
    avatarUrl?: string;
  }): Promise<User> {
    const { rows } = await query<User>(
      `INSERT INTO users (google_id, email, name, avatar_url)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (google_id) DO UPDATE SET
         email = EXCLUDED.email,
         name = EXCLUDED.name,
         avatar_url = EXCLUDED.avatar_url,
         updated_at = NOW()
       RETURNING *`,
      [profile.googleId, profile.email, profile.name, profile.avatarUrl]
    );
    return rows[0];
  }

  static async updateSlackToken(
    userId: string,
    data: {
      slackAccessToken: string;
      slackTeamId: string;
      slackChannel?: string;
      slackWebhookUrl?: string;
    }
  ): Promise<User | null> {
    const { rows } = await query<User>(
      `UPDATE users SET
         slack_access_token = $1,
         slack_team_id = $2,
         slack_channel = $3,
         slack_webhook_url = $4,
         updated_at = NOW()
       WHERE id = $5 RETURNING *`,
      [data.slackAccessToken, data.slackTeamId, data.slackChannel, data.slackWebhookUrl, userId]
    );
    return rows[0] || null;
  }

  static async disconnectSlack(userId: string): Promise<void> {
    await query(
      `UPDATE users SET
         slack_access_token = NULL,
         slack_team_id = NULL,
         slack_channel = NULL,
         slack_webhook_url = NULL,
         updated_at = NOW()
       WHERE id = $1`,
      [userId]
    );
  }
}
