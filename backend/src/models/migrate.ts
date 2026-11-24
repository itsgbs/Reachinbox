import { db } from '../config/database';

export async function runMigrations() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      google_id VARCHAR(255) UNIQUE NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      name VARCHAR(255),
      avatar TEXT,
      slack_access_token TEXT,
      slack_team_id VARCHAR(255),
      slack_channel_id VARCHAR(255),
      slack_bot_token TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS senders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      email VARCHAR(255) NOT NULL,
      name VARCHAR(255),
      ethereal_user VARCHAR(255),
      ethereal_pass VARCHAR(255),
      smtp_host VARCHAR(255) DEFAULT 'smtp.ethereal.email',
      smtp_port INTEGER DEFAULT 587,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, email)
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      sender_id UUID REFERENCES senders(id),
      name VARCHAR(500) NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      hourly_limit INTEGER DEFAULT 50,
      delay_between_emails_ms INTEGER DEFAULT 2000,
      status VARCHAR(50) DEFAULT 'scheduled',
      total_recipients INTEGER DEFAULT 0,
      sent_count INTEGER DEFAULT 0,
      failed_count INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS scheduled_emails (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
      sender_id UUID REFERENCES senders(id),
      sender_email VARCHAR(255) NOT NULL,
      recipient_email VARCHAR(255) NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      scheduled_at TIMESTAMPTZ NOT NULL,
      status VARCHAR(50) DEFAULT 'scheduled',
      job_id VARCHAR(255),
      idempotency_key VARCHAR(255) UNIQUE,
      sent_at TIMESTAMPTZ,
      error_message TEXT,
      preview_url TEXT,
      message_id VARCHAR(500),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_scheduled_emails_user_id ON scheduled_emails(user_id);
    CREATE INDEX IF NOT EXISTS idx_scheduled_emails_status ON scheduled_emails(status);
    CREATE INDEX IF NOT EXISTS idx_scheduled_emails_scheduled_at ON scheduled_emails(scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_scheduled_emails_campaign_id ON scheduled_emails(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_scheduled_emails_idempotency ON scheduled_emails(idempotency_key);
  `);

  console.log('✅ Database migrations complete');
}

// Run directly
runMigrations()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
