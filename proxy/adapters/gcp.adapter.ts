import { CredentialAdapter, ProxyRequestConfig } from './types';

/**
 * GCP adapter — Bearer token for Google Cloud APIs.
 * Credentials shape: { token, baseUrl? }
 *
 * URL routing: /proxy/gcp/compute/v1/projects/... -> GCP Compute API
 *              /proxy/gcp/storage/v1/b/...        -> Cloud Storage API
 *
 * Defaults to googleapis.com, subpath determines the API.
 */
export class GcpAdapter implements CredentialAdapter {
  readonly serviceType = 'gcp';

  resolveTargetUrl(remainingPath: string, credentials: Record<string, any>): string {
    const base = (credentials.baseUrl || 'https://www.googleapis.com').replace(/\/+$/, '');
    return `${base}/${remainingPath}`;
  }

  apply(config: ProxyRequestConfig, credentials: Record<string, any>): ProxyRequestConfig {
    config.headers['authorization'] = `Bearer ${credentials.token}`;
    config.headers['content-type'] = config.headers['content-type'] || 'application/json';
    return config;
  }
}
