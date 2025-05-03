import { createClient } from 'redis';

const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => console.error('Redis error:', err));

export const initRedis = async () => {
  try {
    await redisClient.connect();
    console.log('Redis connected');
  } catch (error) {
    console.error('Redis connection failed', error);
    process.exit(1);
  }
};

export const cacheToken = async (key: string, token: string, ttl: number) => {
  await redisClient.setEx(key, ttl, token);
};

export const getCachedToken = async (key: string) => {
  return await redisClient.get(key);
};

export { redisClient };
