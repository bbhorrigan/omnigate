import { createClient, RedisClientType } from 'redis';

let redisClient: RedisClientType | null = null;

export const initRedis = async () => {
  if (redisClient) return redisClient; // prevent multiple connects

  redisClient = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    socket: {
      reconnectStrategy: (retries) => {
        // Retry with exponential backoff, up to ~1 minute
        if (retries > 10) return new Error('Redis reconnect limit reached');
        return Math.min(retries * 100, 3000);
      }
    }
  });

  redisClient.on('error', (err) => {
    console.error('Redis error:', err);
  });

  redisClient.on('connect', () => {
    console.log('Redis connecting...');
  });

  redisClient.on('ready', () => {
    console.log('Redis connected and ready');
  });

  redisClient.on('reconnecting', () => {
    console.warn('Redis reconnecting...');
  });

  try {
    await redisClient.connect();
    return redisClient;
  } catch (error) {
    console.error('Redis connection failed', error);
    process.exit(1);
  }
};

export const cacheToken = async (key: string, token: string, ttlSeconds: number) => {
  if (!redisClient) throw new Error('Redis not initialized');
  try {
    await redisClient.setEx(key, ttlSeconds, token);
  } catch (error) {
    console.error(`Failed to cache token for key "${key}":`, error);
  }
};

export const getCachedToken = async (key: string) => {
  if (!redisClient) throw new Error('Redis not initialized');
  try {
    return await redisClient.get(key);
  } catch (error) {
    console.error(`Failed to get cached token for key "${key}":`, error);
    return null;
  }
};

export const closeRedis = async () => {
  if (redisClient) {
    try {
      await redisClient.quit();
      console.log('Redis connection closed');
    } catch (error) {
      console.error('Failed to close Redis connection', error);
    }
  }
};

export { redisClient };
