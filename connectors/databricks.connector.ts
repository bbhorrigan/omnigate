import { Connector, TokenResult } from './types';

/**
 * Databricks OAuth (U2M) connector.
 *
 * Supports both Databricks-native OAuth and PAT (form-based).
 * OAuth uses Databricks accounts-level OIDC.
 *
 * Env vars: DATABRICKS_CLIENT_ID, DATABRICKS_CLIENT_SECRET, DATABRICKS_HOST (workspace URL)
 */
export class DatabricksConnector implements Connector {
  readonly serviceType = 'databricks';
  readonly displayName = 'Databricks';
  readonly flowType = 'oauth' as const;
  readonly supportsRefresh = true;
  readonly refreshBufferMs = 5 * 60 * 1000; // 5 min buffer for 1-hour tokens

  private get clientId() { return process.env.DATABRICKS_CLIENT_ID || ''; }
  private get clientSecret() { return process.env.DATABRICKS_CLIENT_SECRET || ''; }
  private get host() { return (process.env.DATABRICKS_HOST || '').replace(/\/+$/, ''); }

  getAuthorizationUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: 'all-apis offline_access',
      state,
    });
    return `${this.host}/oidc/v1/authorize?${params}`;
  }

  async handleCallback(params: Record<string, string>, redirectUri: string): Promise<TokenResult> {
    const { code } = params;
    if (!code) throw new Error('Missing authorization code');

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });

    const res = await fetch(`${this.host}/oidc/v1/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Databricks token exchange failed (${res.status}): ${text}`);
    }

    const data = await res.json() as any;
    const expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000);

    return {
      credentials: {
        token: data.access_token,
        refreshToken: data.refresh_token,
        workspaceUrl: this.host,
        expiresAt: expiresAt.toISOString(),
      },
      expiresAt,
    };
  }

  async refreshCredentials(credentials: Record<string, any>): Promise<TokenResult | null> {
    if (!credentials.refreshToken) return null;

    const host = credentials.workspaceUrl || this.host;
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: credentials.refreshToken,
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });

    const res = await fetch(`${host}/oidc/v1/token`, {
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
        refreshToken: data.refresh_token || credentials.refreshToken,  // Preserve if refresh_token not rotated
        expiresAt: expiresAt.toISOString(),
      },
      expiresAt,
    };
  }
}
