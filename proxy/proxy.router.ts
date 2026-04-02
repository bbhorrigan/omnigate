import { Router, Request, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware';
import { CredentialService } from './credential.service';
import { RefreshService } from '../connectors/refresh.service';
import { getAdapter, listAdapters } from './adapters';
import { ProxyRequestConfig } from './adapters/types';
import { AuditService } from '../audit.service';

const router = Router();
const credentialService = new CredentialService();
const refreshService = new RefreshService();
const auditService = new AuditService();

// All proxy routes require auth
router.use(requireAuth);

// Parse body as raw buffer for proxy forwarding
router.use((req: Request, _res: Response, next) => {
  if (req.body && Buffer.isBuffer(req.body)) {
    next();
    return;
  }
  // If body was already parsed as JSON by express.json(), re-serialize
  if (req.body && typeof req.body === 'object') {
    (req as any).rawBody = Buffer.from(JSON.stringify(req.body));
  }
  next();
});

// List available services
router.get('/', (_req: Request, res: Response) => {
  res.json({ services: listAdapters() });
});

// Proxy catch-all: /proxy/:service/...
router.all('/:service/*', async (req: Request, res: Response) => {
  const { service } = req.params;
  const remainingPath = (req.params as any)[0] || '';
  const { sub: userId, email } = (req as AuthenticatedRequest).tokenPayload;

  // 1. Find adapter
  const adapter = getAdapter(service);
  if (!adapter) {
    res.status(400).json({
      error: `Unsupported service: ${service}`,
      supported: listAdapters(),
    });
    return;
  }

  // 2. Look up credentials
  let credentials: Record<string, any> | null;
  try {
    credentials = await credentialService.getCredentials(userId, service);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve credentials' });
    return;
  }

  if (!credentials) {
    res.status(403).json({
      error: `No credentials configured for service: ${service}`,
      hint: 'Connect via /connect/:service or store credentials via POST /credentials.',
    });
    return;
  }

  // 2b. Auto-refresh if expired
  try {
    credentials = await refreshService.ensureFresh(userId, email, service, credentials);
  } catch (_) {
    // Non-fatal — proceed with possibly stale credentials
  }

  // 3. Build outgoing request
  const targetUrl = adapter.resolveTargetUrl(remainingPath, credentials);
  const outgoingHeaders: Record<string, string> = {};

  // Copy safe headers from the incoming request
  for (const [key, value] of Object.entries(req.headers)) {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP.has(lower) || lower === 'authorization' || lower === 'host') continue;
    if (typeof value === 'string') outgoingHeaders[lower] = value;
  }

  const body = Buffer.isBuffer(req.body)
    ? req.body
    : (req as any).rawBody || undefined;

  const config: ProxyRequestConfig = {
    url: targetUrl,
    method: req.method,
    headers: outgoingHeaders,
    body: ['GET', 'HEAD'].includes(req.method) ? undefined : body,
  };

  // 4. Inject credentials
  let finalConfig: ProxyRequestConfig;
  try {
    finalConfig = await adapter.apply(config, credentials);
  } catch (err) {
    res.status(500).json({ error: 'Credential injection failed', detail: String(err) });
    return;
  }

  // 5. Forward to downstream
  try {
    const response = await fetch(finalConfig.url, {
      method: finalConfig.method,
      headers: finalConfig.headers,
      body: finalConfig.body ? String(finalConfig.body) : undefined,
    });

    // 6. Return response
    res.status(response.status);
    response.headers.forEach((value, key) => {
      if (!HOP_BY_HOP.has(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });
    const responseBody = Buffer.from(await response.arrayBuffer());
    res.send(responseBody);

    // Best-effort audit log
    auditService.log({
      userId,
      action: 'proxy',
      service,
      method: req.method,
      path: remainingPath,
      statusCode: response.status,
      ipAddress: req.ip || null,
    });
  } catch (err) {
    res.status(502).json({ error: 'Failed to reach downstream service', detail: String(err) });

    // Best-effort audit log
    auditService.log({
      userId,
      action: 'proxy',
      service,
      method: req.method,
      path: remainingPath,
      statusCode: 502,
      ipAddress: req.ip || null,
    });
  }
});

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
]);

export { router as proxyRouter };
