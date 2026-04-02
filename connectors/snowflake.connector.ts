import { Connector, TokenResult } from './types';

/**
 * Snowflake OAuth connector.
 *
 * Requires a Snowflake Security Integration:
 *   CREATE SECURITY INTEGRATION omnigate_oauth
 *     TYPE = OAUTH
 *     OAUTH_CLIENT = CUSTOM
 *     OAUTH_CLIENT_TYPE = 'CONFIDENTIAL'
 *     OAUTH_REDIRECT_URI = 'http://<host>/connect/snowflake/callback'
 *     OAUTH_ISSUE_REFRESH_TOKENS = TRUE
 *     ENABLED = TRUE;
 *
 * Env vars: SNOWFLAKE_ACCOUNT, SNOWFLAKE_OAUTH_CLIENT_ID, SNOWFLAKE_OAUTH_CLIENT_SECRET
 */
export class SnowflakeConnector implements Connector {
  readonly serviceType = 'snowflake';
  readonly displayName = 'Snowflake';
  readonly flowType = 'oauth' as const;
  readonly supportsRefresh = true;
  readonly refreshBufferMs = 2 * 60 * 1000; // 2 min buffer for 10 min tokens

  private get account() { return process.env.SNOWFLAKE_ACCOUNT || ''; }
  private get clientId() { return process.env.SNOWFLAKE_OAUTH_CLIENT_ID || ''; }
  private get clientSecret() { return process.env.SNOWFLAKE_OAUTH_CLIENT_SECRET || ''; }
  private get role() { return process.env.SNOWFLAKE_ROLE || 'PUBLIC'; }
  private get baseUrl() { return `https://${this.account}.snowflakecomputing.com`; }

  getAuthorizationUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: redirectUri,
      scope: `session:role:${this.role}`,
      state,
    });
    return `${this.baseUrl}/oauth/authorize?${params}`;
  }

  async handleCallback(params: Record<string, string>, redirectUri: string): Promise<TokenResult> {
    const { code } = params;
    if (!code) throw new Error('Missing authorization code');

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    });

    const res = await fetch(`${this.baseUrl}/oauth/token-request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`,
      },
      body: body.toString(),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Snowflake token exchange failed (${res.status}): ${text}`);
    }

    const data = await res.json() as any;
    const expiresAt = new Date(Date.now() + (data.expires_in || 600) * 1000);

    return {
      credentials: {
        account: this.account,
        token: data.access_token,
        refreshToken: data.refresh_token,
        tokenType: 'OAUTH',
        expiresAt: expiresAt.toISOString(),
      },
      expiresAt,
    };
  }

  async refreshCredentials(credentials: Record<string, any>): Promise<TokenResult | null> {
    if (!credentials.refreshToken) return null;

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: credentials.refreshToken,
    });

    const res = await fetch(`${this.baseUrl}/oauth/token-request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`,
      },
      body: body.toString(),
    });

    if (!res.ok) return null;

    const data = await res.json() as any;
    const expiresAt = new Date(Date.now() + (data.expires_in || 600) * 1000);

    return {
      credentials: {
        ...credentials,
        token: data.access_token,
        refreshToken: data.refresh_token || credentials.refreshToken,
        expiresAt: expiresAt.toISOString(),
      },
      expiresAt,
    };
  }
}
