export const DEFAULT_REFRESH_BUFFER_MS = 5 * 60 * 1000; // refresh 5 minutes before expiry

export interface TokenResult {
  /** Credentials to store in SaaSMapping.credentials JSONB */
  credentials: Record<string, any>;
  /** When the access token expires */
  expiresAt?: Date;
}

export interface Connector {
  /** Must match the adapter's serviceType (e.g., 'snowflake', 'aws') */
  readonly serviceType: string;

  /** Human-readable label for the UI */
  readonly displayName: string;

  /** Whether this connector uses OAuth (browser redirect) or form-based flow */
  readonly flowType: 'oauth' | 'form';

  /** Build the authorization URL to redirect the user to (OAuth connectors) */
  getAuthorizationUrl(state: string, redirectUri: string): string;

  /** Exchange the callback params for credentials */
  handleCallback(
    params: Record<string, string>,
    redirectUri: string
  ): Promise<TokenResult>;

  /** Refresh expired credentials. Return null if not supported. */
  refreshCredentials(credentials: Record<string, any>): Promise<TokenResult | null>;

  /** Whether this connector supports automatic refresh */
  readonly supportsRefresh: boolean;

  /** Optional refresh buffer in milliseconds (defaults to DEFAULT_REFRESH_BUFFER_MS) */
  readonly refreshBufferMs?: number;
}
