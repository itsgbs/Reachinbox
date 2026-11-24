import { query } from '../config/database';
import { logger } from '../utils/logger';

export async function runMigrations() {
  logger.info('Running database migrations...');

  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      google_id VARCHAR(255) UNIQUE NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      name VARCHAR(255) NOT NULL,
      avatar_url TEXT,
      slack_access_token TEXT,
      slack_webhook_url TEXT,
      slack_team_id VARCHAR(255),
      slack_channel VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS senders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      email VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL,
      ethereal_user VARCHAR(255) NOT NULL,
      ethereal_pass VARCHAR(255) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, email)
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      sender_id UUID NOT NULL REFERENCES senders(id),
      name VARCHAR(255) NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      total_recipients INTEGER DEFAULT 0,
      sent_count INTEGER DEFAULT 0,
      failed_count INTEGER DEFAULT 0,
      status VARCHAR(50) DEFAULT 'pending',
      delay_between_emails_ms INTEGER DEFAULT 2000,
      hourly_limit INTEGER DEFAULT 50,
      scheduled_start_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS email_jobs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      sender_id UUID NOT NULL REFERENCES senders(id),
      sender_email VARCHAR(255) NOT NULL,
      recipient_email VARCHAR(255) NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      scheduled_at TIMESTAMPTZ NOT NULL,
      sent_at TIMESTAMPTZ,
      status VARCHAR(50) DEFAULT 'scheduled',
      bull_job_id VARCHAR(255),
      idempotency_key VARCHAR(512) UNIQUE NOT NULL,
      error_message TEXT,
      retry_count INTEGER DEFAULT 0,
      campaign_id UUID REFERENCES campaigns(id),
      preview_url TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_email_jobs_status ON email_jobs(status);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_email_jobs_scheduled_at ON email_jobs(scheduled_at);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_email_jobs_user_id ON email_jobs(user_id);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_email_jobs_sender_email ON email_jobs(sender_email);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_email_jobs_idempotency ON email_jobs(idempotency_key);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_campaigns_user_id ON campaigns(user_id);`);

  logger.info('Migrations completed successfully');
}
