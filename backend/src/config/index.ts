import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  sessionSecret: process.env.SESSION_SECRET || 'changeme',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',

  db: {
    connectionString: process.env.DATABASE_URL || '',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'reachinbox_scheduler',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    callbackUrl: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3001/auth/google/callback',
  },

  slack: {
    clientId: process.env.SLACK_CLIENT_ID || '',
    clientSecret: process.env.SLACK_CLIENT_SECRET || '',
    redirectUri: process.env.SLACK_REDIRECT_URI || 'http://localhost:3001/auth/slack/callback',
  },

  elasticsearch: {
    node: process.env.ELASTICSEARCH_NODE || 'http://localhost:9200',
    username: process.env.ELASTICSEARCH_USERNAME || '',
    password: process.env.ELASTICSEARCH_PASSWORD || '',
  },

  rateLimit: {
    maxEmailsPerHour: parseInt(process.env.MAX_EMAILS_PER_HOUR || '200', 10),
    maxEmailsPerHourPerSender: parseInt(process.env.MAX_EMAILS_PER_HOUR_PER_SENDER || '50', 10),
    minDelayBetweenEmailsMs: parseInt(process.env.MIN_DELAY_BETWEEN_EMAILS_MS || '2000', 10),
    workerConcurrency: parseInt(process.env.WORKER_CONCURRENCY || '5', 10),
  },

  bullBoard: {
    path: process.env.BULL_BOARD_PATH || '/admin/queues',
  },
};
