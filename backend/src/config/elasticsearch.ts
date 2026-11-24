import { Client } from '@elastic/elasticsearch';

export const esClient = new Client({
  node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
});

export const EMAIL_INDEX = 'emails';

export async function ensureEmailIndex() {
  const exists = await esClient.indices.exists({ index: EMAIL_INDEX });
  if (!exists) {
    await esClient.indices.create({
      index: EMAIL_INDEX,
      mappings: {
        properties: {
          id: { type: 'keyword' },
          user_id: { type: 'keyword' },
          sender_email: { type: 'keyword' },
          recipient_email: { type: 'keyword' },
          subject: { type: 'text', analyzer: 'standard' },
          body: { type: 'text', analyzer: 'standard' },
          status: { type: 'keyword' },
          scheduled_at: { type: 'date' },
          sent_at: { type: 'date' },
          created_at: { type: 'date' },
          job_id: { type: 'keyword' },
          idempotency_key: { type: 'keyword' },
          campaign_id: { type: 'keyword' },
        },
      },
    });
    console.log('✅ Elasticsearch index created');
  }
}
