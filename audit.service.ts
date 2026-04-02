import { DataSource, Repository } from 'typeorm';
import { AppDataSource } from './db';
import { AuditLog } from './audit';

export interface AuditEntry {
  userId: string;
  action: string;
  service?: string | null;
  method?: string | null;
  path?: string | null;
  statusCode?: number | null;
  metadata?: Record<string, any> | null;
  ipAddress?: string | null;
}

export interface AuditQueryFilters {
  limit?: number;
  service?: string;
}

export class AuditService {
  private repo: Repository<AuditLog>;

  constructor(ds: DataSource = AppDataSource) {
    this.repo = ds.getRepository(AuditLog);
  }

  /**
   * Best-effort audit log write. Never throws — failures are silently logged
   * so that audit issues do not break the primary request flow.
   */
  async log(entry: AuditEntry): Promise<void> {
    try {
      const record = this.repo.create({
        userId: entry.userId,
        action: entry.action,
        service: entry.service ?? null,
        method: entry.method ?? null,
        path: entry.path ?? null,
        statusCode: entry.statusCode ?? null,
        metadata: entry.metadata ?? null,
        ipAddress: entry.ipAddress ?? null,
      });
      await this.repo.save(record);
    } catch (err) {
      // Best-effort: log the error but never propagate
      console.error('Audit log write failed:', err);
    }
  }

  /**
   * Query audit logs for a given user, with optional filters.
   */
  async query(userId: string, filters?: AuditQueryFilters): Promise<AuditLog[]> {
    const qb = this.repo
      .createQueryBuilder('audit')
      .where('audit.userId = :userId', { userId })
      .orderBy('audit.createdAt', 'DESC');

    if (filters?.service) {
      qb.andWhere('audit.service = :service', { service: filters.service });
    }

    const limit = filters?.limit && filters.limit > 0 ? Math.min(filters.limit, 1000) : 50;
    qb.limit(limit);

    return qb.getMany();
  }
}
