import { DataSource } from 'typeorm';
import { AppDataSource } from '../db';
import { SaaSMapping } from '../SaaSMapping';
import { getCachedToken, cacheToken } from '../cache';

export class CredentialService {
  private ds: DataSource;
  private cacheTtlSeconds: number;

  constructor(ds: DataSource = AppDataSource) {
    this.ds = ds;
    this.cacheTtlSeconds = Number(process.env.AUTH_CACHE_TTL_SEC ?? 3600);
  }

  async getCredentials(userId: string, saasType: string): Promise<Record<string, any> | null> {
    const cacheKey = `user:${userId}:${saasType}`;

    // 1. Try Redis cache
    try {
      const cached = await getCachedToken(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (_) {
      // cache miss or parse error — fall through to DB
    }

    // 2. Fall back to DB
    const repo = this.ds.getRepository(SaaSMapping);
    const mapping = await repo.findOne({
      where: { user: { id: userId }, saasType },
    });

    if (!mapping) return null;

    // 3. Backfill cache (best-effort)
    try {
      await cacheToken(cacheKey, JSON.stringify(mapping.credentials), this.cacheTtlSeconds);
    } catch (_) {
      // non-fatal
    }

    return mapping.credentials;
  }
}
