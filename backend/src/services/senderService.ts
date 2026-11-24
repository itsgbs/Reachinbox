import nodemailer from 'nodemailer';
import { db } from '../config/database';

export interface EtherealAccount {
  user: string;
  pass: string;
  host: string;
  port: number;
}

/**
 * Create a new Ethereal test account
 */
export async function createEtherealAccount(): Promise<EtherealAccount> {
  const account = await nodemailer.createTestAccount();
  return {
    user: account.user,
    pass: account.pass,
    host: account.smtp.host,
    port: account.smtp.port,
  };
}

/**
 * Ensure a sender record exists in the DB with Ethereal credentials.
 * If the sender doesn't have credentials yet, create an Ethereal account for them.
 */
export async function ensureSender(userId: string, email: string, name?: string): Promise<string> {
  const existing = await db.query(
    'SELECT id FROM senders WHERE user_id=$1 AND email=$2',
    [userId, email]
  );

  if (existing.rows.length) {
    return existing.rows[0].id;
  }

  // Create Ethereal account
  let etherealUser = process.env.ETHEREAL_USER;
  let etherealPass = process.env.ETHEREAL_PASS;

  if (!etherealUser || !etherealPass) {
    const account = await createEtherealAccount();
    etherealUser = account.user;
    etherealPass = account.pass;
  }

  const result = await db.query(
    `INSERT INTO senders (user_id, email, name, ethereal_user, ethereal_pass)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [userId, email, name || email, etherealUser, etherealPass]
  );

  return result.rows[0].id;
}
