import { Client } from '@elastic/elasticsearch';
import { config } from '../config';
import { logger } from '../utils/logger';
import { EmailJob } from '../types';

const INDEX_NAME = 'email_jobs';

let esClient: Client | null = null;

function getESClient(): Client {
  if (!esClient) {
    const clientConfig: ConstructorParameters<typeof Client>[0] = {
      node: config.elasticsearch.node,
    };
    if (config.elasticsearch.username && config.elasticsearch.password) {
      clientConfig.auth = {
        username: config.elasticsearch.username,
        password: config.elasticsearch.password,
      };
    }
    esClient = new Client(clientConfig);
  }
  return esClient;
}

export async function ensureIndex(): Promise<void> {
  const client = getESClient();
  try {
    const exists = await client.indices.exists({ index: INDEX_NAME });
    if (!exists) {
      await client.indices.create({
        index: INDEX_NAME,
        mappings: {
          properties: {
            id: { type: 'keyword' },
            user_id: { type: 'keyword' },
            sender_id: { type: 'keyword' },
            sender_email: { type: 'keyword' },
            recipient_email: { type: 'keyword' },
            subject: { type: 'text', analyzer: 'standard' },
            body: { type: 'text', analyzer: 'standard' },
            scheduled_at: { type: 'date' },
            sent_at: { type: 'date' },
            status: { type: 'keyword' },
            campaign_id: { type: 'keyword' },
            idempotency_key: { type: 'keyword' },
            created_at: { type: 'date' },
          },
        },
      });
      logger.info(`Elasticsearch index "${INDEX_NAME}" created`);
    }
  } catch (err) {
    logger.error('Failed to ensure Elasticsearch index', err);
  }
}

export async function indexEmailJob(job: EmailJob): Promise<void> {
  const client = getESClient();
  try {
    await client.index({
      index: INDEX_NAME,
      id: job.id,
      document: {
        id: job.id,
        user_id: job.user_id,
        sender_id: job.sender_id,
        sender_email: job.sender_email,
        recipient_email: job.recipient_email,
        subject: job.subject,
        body: job.body,
        scheduled_at: job.scheduled_at,
        sent_at: job.sent_at,
        status: job.status,
        campaign_id: job.campaign_id,
        idempotency_key: job.idempotency_key,
        created_at: job.created_at,
      },
    });
  } catch (err) {
    logger.error(`Failed to index email job ${job.id} to Elasticsearch`, err);
    // Non-fatal: DB is source of truth
  }
}

export async function updateIndexedEmailJob(
  jobId: string,
  updates: Partial<EmailJob>
): Promise<void> {
  const client = getESClient();
  try {
    await client.update({
      index: INDEX_NAME,
      id: jobId,
      doc: updates,
    });
  } catch (err) {
    logger.error(`Failed to update indexed email job ${jobId}`, err);
  }
}

export async function searchEmailJobs(
  userId: string,
  query: string,
  page = 1,
  pageSize = 20
): Promise<{ hits: Partial<EmailJob>[]; total: number }> {
  const client = getESClient();
  try {
    const from = (page - 1) * pageSize;
    const result = await client.search({
      index: INDEX_NAME,
      from,
      size: pageSize,
      query: {
        bool: {
          must: [
            { term: { user_id: userId } },
            {
              multi_match: {
                query,
                fields: ['recipient_email^2', 'sender_email^2', 'subject^3', 'body'],
                type: 'best_fields',
                fuzziness: 'AUTO',
              },
            },
          ],
        },
      },
      sort: [{ created_at: { order: 'desc' } }],
    });

    const hits = result.hits.hits.map((h) => h._source as Partial<EmailJob>);
    const total = typeof result.hits.total === 'number'
      ? result.hits.total
      : result.hits.total?.value ?? 0;

    return { hits, total };
  } catch (err) {
    logger.error('Elasticsearch search failed', err);
    return { hits: [], total: 0 };
  }
}

export async function isElasticsearchAvailable(): Promise<boolean> {
  try {
    const client = getESClient();
    await client.ping();
    return true;
  } catch {
    return false;
  }
}
