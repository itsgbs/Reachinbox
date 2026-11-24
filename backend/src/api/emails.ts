import { Router, Response } from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { scheduleEmailCampaign } from '../services/schedulerService';
import { db } from '../config/database';
import { esClient, EMAIL_INDEX } from '../config/elasticsearch';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ─── Schedule Emails ───────────────────────────────────────────────────────────
router.post('/schedule', requireAuth, upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    const { subject, body, startAt, delayBetweenEmailsMs, hourlyLimit, senderEmail, senderName, campaignName } = req.body;

    if (!subject || !body || !startAt || !senderEmail) {
      return res.status(400).json({ error: 'subject, body, startAt, and senderEmail are required' });
    }

    let recipients: string[] = [];

    // Parse file (CSV or plain text with emails)
    if (req.file) {
      const content = req.file.buffer.toString('utf-8');
      const ext = req.file.originalname?.toLowerCase();

      if (ext?.endsWith('.csv')) {
        const records = parse(content, { skip_empty_lines: true, trim: true });
        // Find email column
        for (const row of records) {
          for (const cell of (Array.isArray(row) ? row : Object.values(row))) {
            const str = String(cell).trim();
            if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str)) {
              recipients.push(str);
            }
          }
        }
      } else {
        // Plain text — one email per line, or comma-separated
        const emails = content.split(/[\n,;]+/).map((e) => e.trim()).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
        recipients = emails;
      }
    } else if (req.body.recipients) {
      // Also accept JSON array in body
      recipients = Array.isArray(req.body.recipients)
        ? req.body.recipients
        : req.body.recipients.split(',').map((e: string) => e.trim());
    }

    if (!recipients.length) {
      return res.status(400).json({ error: 'No valid email recipients found' });
    }

    const result = await scheduleEmailCampaign({
      userId: req.userId!,
      senderEmail,
      senderName,
      recipients,
      subject,
      body,
      startAt: new Date(startAt),
      delayBetweenEmailsMs: parseInt(delayBetweenEmailsMs || '2000', 10),
      hourlyLimit: parseInt(hourlyLimit || '50', 10),
      campaignName,
    });

    return res.json({
      success: true,
      campaignId: result.campaignId,
      scheduled: result.scheduled,
      message: `Scheduled ${result.scheduled} emails`,
    });
  } catch (err: any) {
    console.error('Schedule error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── Get Scheduled Emails ──────────────────────────────────────────────────────
router.get('/scheduled', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string || '1', 10);
    const limit = parseInt(req.query.limit as string || '20', 10);
    const offset = (page - 1) * limit;

    const { rows } = await db.query(
      `SELECT se.*, c.name as campaign_name
       FROM scheduled_emails se
       LEFT JOIN campaigns c ON se.campaign_id = c.id
       WHERE se.user_id=$1 AND se.status='scheduled'
       ORDER BY se.scheduled_at ASC
       LIMIT $2 OFFSET $3`,
      [req.userId, limit, offset]
    );

    const countResult = await db.query(
      'SELECT COUNT(*) FROM scheduled_emails WHERE user_id=$1 AND status=$2',
      [req.userId, 'scheduled']
    );

    return res.json({
      emails: rows,
      total: parseInt(countResult.rows[0].count, 10),
      page,
      limit,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── Get Sent Emails ───────────────────────────────────────────────────────────
router.get('/sent', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string || '1', 10);
    const limit = parseInt(req.query.limit as string || '20', 10);
    const offset = (page - 1) * limit;

    const { rows } = await db.query(
      `SELECT se.*, c.name as campaign_name
       FROM scheduled_emails se
       LEFT JOIN campaigns c ON se.campaign_id = c.id
       WHERE se.user_id=$1 AND se.status IN ('sent', 'failed')
       ORDER BY se.sent_at DESC NULLS LAST
       LIMIT $2 OFFSET $3`,
      [req.userId, limit, offset]
    );

    const countResult = await db.query(
      `SELECT COUNT(*) FROM scheduled_emails WHERE user_id=$1 AND status IN ('sent', 'failed')`,
      [req.userId]
    );

    return res.json({
      emails: rows,
      total: parseInt(countResult.rows[0].count, 10),
      page,
      limit,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── Search Emails (Elasticsearch) ────────────────────────────────────────────
router.get('/search', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const q = req.query.q as string;
    const status = req.query.status as string;

    if (!q && !status) {
      return res.status(400).json({ error: 'Provide a search query (q) or status filter' });
    }

    const must: any[] = [{ term: { user_id: req.userId } }];

    if (q) {
      must.push({
        multi_match: {
          query: q,
          fields: ['subject^3', 'body', 'recipient_email^2', 'sender_email'],
        },
      });
    }

    if (status) {
      must.push({ term: { status } });
    }

    const result = await esClient.search({
      index: EMAIL_INDEX,
      body: {
        query: { bool: { must } },
        sort: [{ scheduled_at: { order: 'desc' } }],
        size: 50,
      },
    });

    const hits = result.hits.hits.map((h: any) => h._source);
    return res.json({ emails: hits, total: result.hits.total });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── Get Campaigns ─────────────────────────────────────────────────────────────
router.get('/campaigns', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = await db.query(
      `SELECT c.*, s.email as sender_email
       FROM campaigns c
       LEFT JOIN senders s ON c.sender_id = s.id
       WHERE c.user_id=$1
       ORDER BY c.created_at DESC`,
      [req.userId]
    );
    return res.json({ campaigns: rows });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── Get Stats ─────────────────────────────────────────────────────────────────
router.get('/stats', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const stats = await db.query(
      `SELECT
        COUNT(*) FILTER (WHERE status='scheduled') as scheduled,
        COUNT(*) FILTER (WHERE status='sent') as sent,
        COUNT(*) FILTER (WHERE status='failed') as failed,
        COUNT(*) as total
       FROM scheduled_emails WHERE user_id=$1`,
      [req.userId]
    );
    return res.json(stats.rows[0]);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
