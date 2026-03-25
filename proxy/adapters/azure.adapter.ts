import { CredentialAdapter, ProxyRequestConfig } from './types';

/**
 * Azure adapter — Bearer token for Azure Resource Manager and other Azure APIs.
 * Credentials shape: { token, tenantId, baseUrl? }
 *
 * URL routing: /proxy/azure/subscriptions/... -> Azure ARM API
 *              /proxy/azure/custom/path     -> custom baseUrl if set
 */
export class AzureAdapter implements CredentialAdapter {
  readonly serviceType = 'azure';

  resolveTargetUrl(remainingPath: string, credentials: Record<string, any>): string {
    const base = (credentials.baseUrl || 'https://management.azure.com').replace(/\/+$/, '');
    return `${base}/${remainingPath}`;
  }

  apply(config: ProxyRequestConfig, credentials: Record<string, any>): ProxyRequestConfig {
    config.headers['authorization'] = `Bearer ${credentials.token}`;
    config.headers['content-type'] = config.headers['content-type'] || 'application/json';
    return config;
  }
}
