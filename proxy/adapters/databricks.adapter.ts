import { CredentialAdapter, ProxyRequestConfig } from './types';

/**
 * Databricks adapter — Bearer token (OAuth or PAT) for Databricks REST API.
 * Credentials shape: { token, workspaceUrl }
 *
 * URL routing: /proxy/databricks/api/2.0/clusters/list -> Databricks API
 */
export class DatabricksAdapter implements CredentialAdapter {
  readonly serviceType = 'databricks';

  resolveTargetUrl(remainingPath: string, credentials: Record<string, any>): string {
    const base = (credentials.workspaceUrl || '').replace(/\/+$/, '');
    return `${base}/${remainingPath}`;
  }

  apply(config: ProxyRequestConfig, credentials: Record<string, any>): ProxyRequestConfig {
    config.headers['authorization'] = `Bearer ${credentials.token}`;
    config.headers['content-type'] = config.headers['content-type'] || 'application/json';
    return config;
  }
}
