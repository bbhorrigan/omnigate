import { Connector, TokenResult } from './types';

/**
 * GCP OAuth connector.
 *
 * Uses Google OAuth2 authorization code flow.
 * Scopes default to cloud-platform (full access).
 *
 * Env vars: GCP_CLIENT_ID, GCP_CLIENT_SECRET, GCP_SCOPES (optional)
 */
export class GcpConnector implements Connector {
  readonly serviceType = 'gcp';
  readonly displayName = 'Google Cloud';
  readonly flowType = 'oauth' as const;
  readonly supportsRefresh = true;

  private get clientId() { return process.env.GCP_CLIENT_ID || ''; }
  private get clientSecret() { return process.env.GCP_CLIENT_SECRET || ''; }
  private get scope() { return process.env.GCP_SCOPES || 'https://www.googleapis.com/auth/cloud-platform'; }

  getAuthorizationUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: this.scope,
      state,
      access_type: 'offline',
      prompt: 'consent',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  async handleCallback(params: Record<string, string>, redirectUri: string): Promise<TokenResult> {
    const { code } = params;
    if (!code) throw new Error('Missing authorization code');

    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    });

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GCP token exchange failed (${res.status}): ${text}`);
    }

    const data = await res.json() as any;
    const expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000);

    return {
      credentials: {
        token: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: expiresAt.toISOString(),
      },
      expiresAt,
    };
  }

  async refreshCredentials(credentials: Record<string, any>): Promise<TokenResult | null> {
    if (!credentials.refreshToken) return null;

    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: credentials.refreshToken,
    });

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) return null;

    const data = await res.json() as any;
    const expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000);

    return {
      credentials: {
        ...credentials,
        token: data.access_token,
        refreshToken: credentials.refreshToken,  // GCP never rotates; preserve explicitly
        expiresAt: expiresAt.toISOString(),
      },
      expiresAt,
    };
  }
}
