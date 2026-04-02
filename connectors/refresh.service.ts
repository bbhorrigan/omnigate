import { AuthService } from '../auth.service';
import { getConnector } from './index';
import { decryptCredentials } from '../crypto';
import { deleteCachedToken } from '../cache';
import { DEFAULT_REFRESH_BUFFER_MS, TokenResult } from './types';

export class RefreshService {
  private authService: AuthService;

  constructor(authService?: AuthService) {
    this.authService = authService || new AuthService();
  }

  /**
   * Attempts to refresh credentials once.
   * Returns: TokenResult on success, null if refresh not possible, 'transient-error' if retryable
   */
  private async attemptRefresh(
    connector: any,
    credentials: Record<string, any>
  ): Promise<TokenResult | null | 'transient-error'> {
    try {
      const result = await connector.refreshCredentials(credentials);
      return result; // null or TokenResult
    } catch (err: any) {
      // Check if it's a transient error (e.g., 5xx response)
      const message = err?.message || '';
      if (
        message.includes('503') ||
        message.includes('500') ||
        message.includes('timeout') ||
        message.includes('Network error')
      ) {
        return 'transient-error';
      }
      // Non-transient errors (4xx, invalid creds, etc) are fatal
      throw err;
    }
  }

  async ensureFresh(
    userId: string,
    email: string,
    serviceType: string,
    credentials: Record<string, any>
  ): Promise<Record<string, any>> {
    // Decrypt if needed (handles both encrypted and legacy plaintext)
    const decrypted = decryptCredentials(credentials);

    // If no expiry info, pass through
    if (!decrypted.expiresAt) return decrypted;

    const expiresAt = new Date(decrypted.expiresAt);
    const now = new Date();

    // Get connector to check refresh support and buffer
    const connector = getConnector(serviceType);
    if (!connector?.supportsRefresh) return decrypted;

    // Use per-connector buffer or fall back to default
    const refreshBufferMs = connector.refreshBufferMs ?? DEFAULT_REFRESH_BUFFER_MS;

    // Not expired yet (with buffer)
    if (expiresAt.getTime() - now.getTime() > refreshBufferMs) {
      return decrypted;
    }

    // Try to refresh with single retry on transient error
    let refreshResult: TokenResult | null | 'transient-error';
    try {
      refreshResult = await this.attemptRefresh(connector, decrypted);
    } catch (err) {
      console.error(`Failed to refresh ${serviceType} credentials:`, err);
      return decrypted; // Return stale on non-transient error
    }

    // Single immediate retry on transient errors
    if (refreshResult === 'transient-error') {
      console.warn(`Transient error refreshing ${serviceType}, retrying...`);
      try {
        refreshResult = await this.attemptRefresh(connector, decrypted);
      } catch (retryErr) {
        console.error(`Retry failed for ${serviceType}:`, retryErr);
        return decrypted; // Return stale on non-transient error after retry
      }
    }

    // Handle non-TokenResult responses (null or still transient after retry)
    if (!refreshResult || refreshResult === 'transient-error') return decrypted; // Return stale

    // Invalidate cache before writing new credentials (fixes race condition)
    const cacheKey = `user:${userId}:${serviceType}`;
    await deleteCachedToken(cacheKey);

    // Store refreshed credentials using userId (not email)
    try {
      await this.authService.updateCredentialsByUserId(userId, serviceType, refreshResult.credentials);
      console.log(`Refreshed ${serviceType} credentials for user ${userId}`);
      return refreshResult.credentials;
    } catch (err) {
      console.error(`Failed to write refreshed ${serviceType} credentials:`, err);
      return decrypted; // Return stale on write failure
    }
  }
}
