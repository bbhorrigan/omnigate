import { AuthService } from '../auth.service';
import { getConnector } from './index';

const REFRESH_BUFFER_MS = 5 * 60 * 1000; // refresh 5 minutes before expiry

export class RefreshService {
  private authService: AuthService;

  constructor(authService?: AuthService) {
    this.authService = authService || new AuthService();
  }

  async ensureFresh(
    userId: string,
    email: string,
    serviceType: string,
    credentials: Record<string, any>
  ): Promise<Record<string, any>> {
    // If no expiry info, pass through
    if (!credentials.expiresAt) return credentials;

    const expiresAt = new Date(credentials.expiresAt);
    const now = new Date();

    // Not expired yet (with buffer)
    if (expiresAt.getTime() - now.getTime() > REFRESH_BUFFER_MS) {
      return credentials;
    }

    // Try to refresh
    const connector = getConnector(serviceType);
    if (!connector?.supportsRefresh) return credentials;

    try {
      const result = await connector.refreshCredentials(credentials);
      if (!result) return credentials;

      // Store refreshed credentials
      await this.authService.handleAuth(email, serviceType, result.credentials);
      console.log(`Refreshed ${serviceType} credentials for user ${userId}`);
      return result.credentials;
    } catch (err) {
      console.error(`Failed to refresh ${serviceType} credentials:`, err);
      // Return stale credentials — let the downstream service reject if truly expired
      return credentials;
    }
  }
}
