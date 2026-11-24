import { query } from '../config/database';
import { Sender } from '../types';
import nodemailer from 'nodemailer';
import { logger } from '../utils/logger';

export class SenderModel {
  static async findByUserId(userId: string): Promise<Sender[]> {
    const { rows } = await query<Sender>(
      'SELECT * FROM senders WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    return rows;
  }

  static async findById(id: string): Promise<Sender | null> {
    const { rows } = await query<Sender>(
      'SELECT * FROM senders WHERE id = $1',
      [id]
    );
    return rows[0] || null;
  }

  static async findByEmail(email: string, userId: string): Promise<Sender | null> {
    const { rows } = await query<Sender>(
      'SELECT * FROM senders WHERE email = $1 AND user_id = $2',
      [email, userId]
    );
    return rows[0] || null;
  }

  /**
   * Create or return existing Ethereal sender for a given email address.
   * Each sender gets their own Ethereal test account for inbox visibility.
   */
  static async getOrCreateSender(userId: string, email: string, name: string): Promise<Sender> {
    const existing = await this.findByEmail(email, userId);
    if (existing) return existing;

    // Create a new Ethereal test account for this sender
    logger.info(`Creating Ethereal account for sender: ${email}`);
    const testAccount = await nodemailer.createTestAccount();

    const { rows } = await query<Sender>(
      `INSERT INTO senders (user_id, email, name, ethereal_user, ethereal_pass)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, email) DO UPDATE SET name = EXCLUDED.name
       RETURNING *`,
      [userId, email, name, testAccount.user, testAccount.pass]
    );
    logger.info(`Created Ethereal sender ${email} -> ${testAccount.user}`);
    return rows[0];
  }

  static async delete(id: string, userId: string): Promise<boolean> {
    const { rowCount } = await query(
      'DELETE FROM senders WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    return rowCount > 0;
  }
}
