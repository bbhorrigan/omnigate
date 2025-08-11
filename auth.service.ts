import { DataSource } from 'typeorm';
import { AppDataSource } from './db';
import { User } from './user';
import { SaaSMapping } from './SaaSMapping';
import { cacheToken } from './cache';

type Credentials = Record<string, unknown>;

export class AuthService {
  private ds: DataSource;
  private userRepo;
  private mappingRepo;
  private cacheTtlSeconds: number;

  constructor(ds: DataSource = AppDataSource) {
    this.ds = ds;
    this.userRepo = this.ds.getRepository(User);
    this.mappingRepo = this.ds.getRepository(SaaSMapping);
    this.cacheTtlSeconds = Number(process.env.AUTH_CACHE_TTL_SEC ?? 3600);
  }

  private async findOrCreateUser(email: string): Promise<User> {
    let user = await this.userRepo.findOne({ where: { email } });
    if (user) return user;

    const newUser = this.userRepo.create({ email });
    user = await this.userRepo.save(newUser);
    return user;
  }

  /**
   * Upserts a SaaS mapping for a user. Assumes a unique constraint on (userId, saasType).
   * If you haven't added it yet, in SaaSMapping entity:
   *   @Index(['user', 'saasType'], { unique: true })
   */
  private async upsertMapping(user: User, saasType: string, credentials: Credentials) {
    // Prefer repository.upsert when available (TypeORM 0.3+)
    // NB: conflictPaths should reference actual columns. If your join column is "userId", use that.
    return this.mappingRepo.upsert(
      {
        user: { id: user.id } as User, // minimal relation reference
        saasType,
        credentials,
      },
      {
        conflictPaths: ['userId', 'saasType'],
        skipUpdateIfNoValuesChanged: true,
      }
    );
  }

  /**
   * Handles auth flow: ensures user exists, upserts SaaS mapping, caches credentials.
   */
  async handleAuth(email: string, saasType: string, credentials: Credentials) {
    // Basic sanity checks (cheap guardrails)
    if (!email || !email.includes('@')) {
      throw new Error('Invalid email.');
    }
    if (!saasType) {
      throw new Error('saasType is required.');
    }

    // Do user + mapping inside a transaction so we don’t end up with a user but no mapping (or vice versa)
    const { userId } = await this.ds.transaction(async (manager) => {
      const userRepo = manager.getRepository(User);
      const mappingRepo = manager.getRepository(SaaSMapping);

      // findOrCreate within the tx
      let user = await userRepo.findOne({ where: { email } });
      if (!user) {
        user = userRepo.create({ email });
        user = await userRepo.save(user);
      }

      // Upsert mapping
      await mappingRepo.upsert(
        {
          user: { id: user.id } as User,
          saasType,
          credentials,
        },
        {
          conflictPaths: ['userId', 'saasType'],
          skipUpdateIfNoValuesChanged: true,
        }
      );

      return { userId: user.id };
    });

    // Cache (best-effort, don’t fail the whole request if Redis says no)
    try {
      await cacheToken(
        `user:${userId}:${saasType}`,
        JSON.stringify(credentials),
        this.cacheTtlSeconds
      );
    } catch (e) {
      // Log and keep moving; caching is an optimization, not the source of truth
      // console.warn('Cache write failed', e);
    }

    return { success: true, userId };
  }
}
