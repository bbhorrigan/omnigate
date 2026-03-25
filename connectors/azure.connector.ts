import { Connector, TokenResult } from './types';

/**
 * Azure / Entra ID OAuth connector.
 *
 * Env vars: AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET
 * Scopes default to Azure Resource Manager.
 */
export class AzureConnector implements Connector {
  readonly serviceType = 'azure';
  readonly displayName = 'Azure';
  readonly flowType = 'oauth' as const;
  readonly supportsRefresh = true;

  private get tenantId() { return process.env.AZURE_TENANT_ID || 'common'; }
  private get clientId() { return process.env.AZURE_CLIENT_ID || ''; }
  private get clientSecret() { return process.env.AZURE_CLIENT_SECRET || ''; }
  private get scope() { return process.env.AZURE_SCOPE || 'https://management.azure.com/.default offline_access'; }
  private get baseUrl() { return `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0`; }

  getAuthorizationUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: this.scope,
      state,
      response_mode: 'query',
    });
    return `${this.baseUrl}/authorize?${params}`;
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
      scope: this.scope,
    });

    const res = await fetch(`${this.baseUrl}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Azure token exchange failed (${res.status}): ${text}`);
    }

    const data = await res.json() as any;
    const expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000);

    return {
      credentials: {
        token: data.access_token,
        refreshToken: data.refresh_token,
        tenantId: this.tenantId,
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
      scope: this.scope,
    });

    const res = await fetch(`${this.baseUrl}/token`, {
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
        refreshToken: data.refresh_token || credentials.refreshToken,
        expiresAt: expiresAt.toISOString(),
      },
      expiresAt,
    };
  }
}
