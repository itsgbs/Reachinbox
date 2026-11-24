import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import session from 'express-session';
import passport from 'passport';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';

import { emailQueue } from './queues/emailQueue';
import { db } from './config/database';
import { redisClient } from './config/redis';
import { esClient, ensureEmailIndex } from './config/elasticsearch';
import { configurePassport } from './config/passport';
import authRouter from './api/auth';
import emailRouter from './api/emails';
import slackRouter from './api/slack';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// Security middlewares
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production', maxAge: 24 * 60 * 60 * 1000 },
}));

// Passport
configurePassport();
app.use(passport.initialize());
app.use(passport.session());

// BullMQ Board
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');
createBullBoard({
  queues: [new BullMQAdapter(emailQueue)],
  serverAdapter,
});
app.use('/admin/queues', serverAdapter.getRouter());

// Routes
app.use('/auth', authRouter);
app.use('/api/emails', emailRouter);
app.use('/auth/slack', slackRouter);

// Health check
app.get('/health', (_, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Start server
async function start() {
  try {
    await db.query('SELECT 1');
    console.log('✅ Database connected');

    await redisClient.ping();
    console.log('✅ Redis connected');

    // Initialize Elasticsearch index
    try {
      await ensureEmailIndex();
    } catch (esErr) {
      console.warn('⚠️ Elasticsearch not available — search will be degraded:', esErr);
    }

    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`📊 BullMQ Dashboard: http://localhost:${PORT}/admin/queues`);
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
}

start();

export default app;
