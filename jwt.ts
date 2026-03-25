import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { cacheToken, getCachedToken, redisClient } from './cache';

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const ACCESS_TOKEN_TTL = Number(process.env.ACCESS_TOKEN_TTL_SEC ?? 900); // 15 min
const REFRESH_TOKEN_TTL = Number(process.env.REFRESH_TOKEN_TTL_SEC ?? 604800); // 7 days

export interface TokenPayload {
  sub: string; // userId
  email: string;
}

export function signAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET) as TokenPayload;
}

export async function createRefreshToken(userId: string): Promise<string> {
  const token = crypto.randomBytes(48).toString('hex');
  await cacheToken(`refresh:${token}`, userId, REFRESH_TOKEN_TTL);
  return token;
}

export async function consumeRefreshToken(token: string): Promise<string | null> {
  const key = `refresh:${token}`;
  const userId = await getCachedToken(key);
  if (!userId) return null;
  // Single-use: delete after consumption
  try {
    await redisClient.del(key);
  } catch (_) {
    // best-effort deletion
  }
  return userId;
}
