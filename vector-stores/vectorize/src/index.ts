import { MastraVector, QueryResult } from '@mastra/core';
import Cloudflare from 'cloudflare';

export class CloudflareVector extends MastraVector {
  client: Cloudflare;
  accountId: string;

  constructor({ accountId, apiToken }: { accountId: string; apiToken: string }) {
    super();
    this.accountId = accountId;

    this.client = new Cloudflare({
      apiKey: apiToken,
    });
  }

  async upsert(
    indexName: string,
    vectors: number[][],
    metadata?: Record<string, any>[],
    ids?: string[],
  ): Promise<string[]> {
    const generatedIds = ids || vectors.map(() => crypto.randomUUID());

    // Create NDJSON string - each line is a JSON object
    const ndjson = vectors
      .map((vector, index) => ({
        id: generatedIds[index]!,
        values: vector,
        metadata: metadata?.[index],
      }))
      .map(record => JSON.stringify(record))
      .join('\n');

    await this.client.vectorize.indexes.upsert(indexName, {
      account_id: this.accountId,
      body: ndjson as any,
    });

    return generatedIds;
  }

  transformFilter(filter?: Record<string, any>) {
    // Implement if Cloudflare Vectorize supports filtering
    return filter;
  }

  async createIndex(
    indexName: string,
    dimension: number,
    metric: 'cosine' | 'euclidean' | 'dotproduct' = 'cosine',
  ): Promise<void> {
    await this.client.vectorize.indexes.create({
      account_id: this.accountId,
      config: {
        dimensions: dimension,
        metric: metric === 'dotproduct' ? 'dot-product' : metric,
      },
      name: indexName,
    });
  }

  async query(
    indexName: string,
    queryVector: number[],
    topK: number = 10,
    filter?: Record<string, any>,
    includeVector: boolean = false,
  ): Promise<QueryResult[]> {
    const response = await this.client.vectorize.indexes.query(indexName, {
      account_id: this.accountId,
      vector: queryVector,
      returnValues: includeVector,
      returnMetadata: 'all',
      topK,
      filter,
    });

    return (
      response?.matches?.map((match: any) => {
        return {
          id: match.id,
          metadata: match.metadata,
          score: match.score,
          vector: match.values,
        };
      }) || []
    );
  }

  async listIndexes(): Promise<string[]> {
    const res = await this.client.vectorize.indexes.list({
      account_id: this.accountId,
    });

    return res?.result?.map(index => index.name!) || [];
  }

  async describeIndex(indexName: string) {
    const index = await this.client.vectorize.indexes.get(indexName, {
      account_id: this.accountId,
    });

    const described = await this.client.vectorize.indexes.info(indexName, {
      account_id: this.accountId,
    });

    return {
      dimension: described?.dimensions!,
      // Since vector_count is not available in the response,
      // we might need a separate API call to get the count if needed
      count: described?.vectorCount || 0,
      metric: index?.config?.metric as 'cosine' | 'euclidean' | 'dotproduct',
    };
  }

  async deleteIndex(indexName: string): Promise<void> {
    await this.client.vectorize.indexes.delete(indexName, {
      account_id: this.accountId,
    });
  }
}
