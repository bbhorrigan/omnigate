import { CredentialAdapter, ProxyRequestConfig } from './types';

/**
 * Generic Bearer token adapter.
 * Credentials shape: { token: string, baseUrl: string }
 */
export class BearerAdapter implements CredentialAdapter {
  readonly serviceType = 'bearer';

  resolveTargetUrl(remainingPath: string, credentials: Record<string, any>): string {
    const base = (credentials.baseUrl || '').replace(/\/+$/, '');
    return `${base}/${remainingPath}`;
  }

  apply(config: ProxyRequestConfig, credentials: Record<string, any>): ProxyRequestConfig {
    config.headers['authorization'] = `Bearer ${credentials.token}`;
    return config;
  }
}
