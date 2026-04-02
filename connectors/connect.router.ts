import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { requireAuth, AuthenticatedRequest } from '../middleware';
import { AuthService } from '../auth.service';
import { cacheToken, getCachedToken, redisClient } from '../cache';
import { getConnector, listConnectors } from './index';
import { AuditService } from '../audit.service';

const router = Router();
const authService = new AuthService();
const auditService = new AuditService();
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// Most connect routes require auth
router.use((req: Request, res: Response, next) => {
  // Allow callback routes without auth (user is returning from external OAuth)
  if (req.path.endsWith('/callback')) return next();
  // For OAuth initiation, accept token as query param (browser redirect can't set headers)
  if (req.query.token && !req.headers.authorization) {
    req.headers.authorization = `Bearer ${req.query.token}`;
  }
  requireAuth(req, res, next);
});

// List available connectors
router.get('/', (_req: Request, res: Response) => {
  res.json({ connectors: listConnectors() });
});

// Initiate OAuth flow for a service
router.get('/:service', async (req: Request, res: Response) => {
  const { service } = req.params;
  if (service === 'services') {
    // /connect/services — list connectors
    res.json({ connectors: listConnectors() });
    return;
  }
  const { sub: userId } = (req as AuthenticatedRequest).tokenPayload;

  const connector = getConnector(service);
  if (!connector) {
    res.status(400).json({ error: `No connector for: ${service}` });
    return;
  }

  if (connector.flowType !== 'oauth') {
    res.status(400).json({
      error: `${service} uses form-based flow. POST to /connect/${service} instead.`,
    });
    return;
  }

  // Generate CSRF state, store in Redis
  const state = crypto.randomBytes(24).toString('hex');
  const redirectUri = `${BASE_URL}/connect/${service}/callback`;

  await cacheToken(
    `oauth_state:${state}`,
    JSON.stringify({ userId, service }),
    600 // 10 minute TTL
  );

  // Store the user's JWT in a cookie so we can identify them on callback
  const token = req.headers.authorization?.slice(7) || '';
  res.cookie('omnigate_jwt', token, { httpOnly: true, maxAge: 600000, sameSite: 'lax' });

  const authUrl = connector.getAuthorizationUrl(state, redirectUri);
  res.redirect(authUrl);
});

// OAuth callback
router.get('/:service/callback', async (req: Request, res: Response) => {
  const { service } = req.params;
  const { state, code } = req.query as Record<string, string>;

  if (!state) {
    res.redirect(`/?error=missing_state`);
    return;
  }

  // Validate state from Redis
  const stateData = await getCachedToken(`oauth_state:${state}`);
  if (!stateData) {
    res.redirect(`/?error=invalid_state`);
    return;
  }

  // Delete state (single-use)
  try { await redisClient.del(`oauth_state:${state}`); } catch (_) {}

  const { userId, service: expectedService } = JSON.parse(stateData);
  if (expectedService !== service) {
    res.redirect(`/?error=state_mismatch`);
    return;
  }

  const connector = getConnector(service);
  if (!connector) {
    res.redirect(`/?error=unknown_service`);
    return;
  }

  try {
    const redirectUri = `${BASE_URL}/connect/${service}/callback`;
    const result = await connector.handleCallback({ code, state }, redirectUri);

    // Get user email for handleAuth
    const user = await authService.getUserById(userId);
    if (!user) {
      res.redirect(`/?error=user_not_found`);
      return;
    }

    await authService.handleAuth(user.email, service, result.credentials);
    // Best-effort audit log
    auditService.log({
      userId,
      action: 'connect',
      service,
      method: req.method,
      path: req.path,
      ipAddress: req.ip || null,
      metadata: { flow: 'oauth' },
    });
    res.redirect(`/?connected=${service}`);
  } catch (err: any) {
    console.error(`Connector callback failed for ${service}:`, err);
    res.redirect(`/?error=connect_failed&detail=${encodeURIComponent(err.message)}`);
  }
});

// Form-based connect (for AWS and similar non-OAuth services)
router.post('/:service', async (req: Request, res: Response) => {
  const { service } = req.params;
  const { sub: userId, email } = (req as AuthenticatedRequest).tokenPayload;

  const connector = getConnector(service);
  if (!connector) {
    res.status(400).json({ error: `No connector for: ${service}` });
    return;
  }

  try {
    const result = await connector.handleCallback(req.body, '');
    await authService.handleAuth(email, service, result.credentials);
    // Best-effort audit log
    auditService.log({
      userId,
      action: 'connect',
      service,
      method: req.method,
      path: req.path,
      statusCode: 200,
      ipAddress: req.ip || null,
      metadata: { flow: 'form' },
    });
    res.json({ success: true, service, expiresAt: result.expiresAt });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export { router as connectRouter };
