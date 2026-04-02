// Database configuration and connection utilities.
import { DataSource, DataSourceOptions } from 'typeorm';
// Local entities
// The original paths assumed a nested `entities/` folder, but the project keeps
// entity files in the repository root. Adjust imports accordingly.
import { User } from './user';
import { SaaSMapping } from './SaaSMapping';
import { AuditLog } from './audit';

const toInt = (v: string | undefined, def: number) =>
  Number.isFinite(Number(v)) ? parseInt(String(v!), 10) : def;

const bool = (v: string | undefined, def = false) =>
  v === undefined ? def : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());

const isProd = process.env.NODE_ENV === 'production';
const dbUrl = process.env.DATABASE_URL; // e.g. postgres://user:pass@host:5432/db

const baseOptions: DataSourceOptions = dbUrl
  ? {
      type: 'postgres',
      url: dbUrl,
    }
  : {
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: toInt(process.env.DB_PORT, 5432),
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'auth_middleware',
    };

const options: DataSourceOptions = {
  ...baseOptions,
  entities: [User, SaaSMapping, AuditLog],
  // In prod, never use synchronize; use migrations instead.
  synchronize: bool(process.env.DB_SYNCHRONIZE, !isProd),
  // Logging defaults: errors/warnings in prod, more in dev if needed
  logging: isProd ? ['error', 'warn'] : (process.env.DB_LOGGING as any) ?? ['error', 'warn'],
  // SSL defaults: on in prod unless explicitly disabled
  ssl: bool(process.env.DB_SSL, isProd)
    ? {
        rejectUnauthorized: bool(process.env.DB_SSL_REJECT_UNAUTHORIZED, true),
      }
    : false,
  // Connection pool & PG extras
  extra: {
    // pg pool options
    max: toInt(process.env.DB_POOL_MAX, 10),
    idleTimeoutMillis: toInt(process.env.DB_POOL_IDLE_MS, 30000),
    connectionTimeoutMillis: toInt(process.env.DB_CONN_TIMEOUT_MS, 10000),
    statement_timeout: toInt(process.env.DB_STATEMENT_TIMEOUT_MS, 30000),
    application_name: process.env.DB_APP_NAME || 'omnigate',
  },
  // Use compiled JS migrations at runtime; TS when running via ts-node
  migrations:
    process.env.TS_NODE === 'true'
      ? ['src/migrations/**/*.{ts}']
      : ['dist/migrations/**/*.{js}'],
  migrationsRun: bool(process.env.DB_MIGRATIONS_RUN, isProd), // auto-run migrations in prod if you like
  // namingStrategy: new SnakeNamingStrategy(), // optional: install typeorm-naming-strategies
};

export const AppDataSource = new DataSource(options);

// Initialize once, with small retry loop to tolerate DB restarts on boot
export const initDB = async () => {
  if (AppDataSource.isInitialized) return AppDataSource;

  const maxRetries = toInt(process.env.DB_INIT_RETRIES, 5);
  const backoffMs = toInt(process.env.DB_INIT_BACKOFF_MS, 1000);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await AppDataSource.initialize();
      console.log('Database connected');
      return AppDataSource;
    } catch (err) {
      const last = attempt === maxRetries;
      console.error(`Database connection failed (attempt ${attempt}/${maxRetries})`, err);
      if (last) {
        // Fail hard on final attempt
        process.exit(1);
      }
      await new Promise((r) => setTimeout(r, backoffMs * attempt)); // simple linear backoff
    }
  }
  return AppDataSource; // unreachable, but satisfies typing
};

// Health check (e.g., for readiness probes)
export const dbHealthcheck = async () => {
  if (!AppDataSource.isInitialized) return { ok: false, error: 'not_initialized' };
  try {
    await AppDataSource.query('SELECT 1');
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
};

// Clean shutdown hook
export const closeDB = async () => {
  if (AppDataSource.isInitialized) {
    try {
      await AppDataSource.destroy();
      console.log('Database connection closed');
    } catch (err) {
      console.error('Failed to close DB connection', err);
    }
  }
};
