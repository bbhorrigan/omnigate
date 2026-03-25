import { CredentialAdapter, ProxyRequestConfig } from './types';

/**
 * Snowflake SQL API adapter.
 * Credentials shape: { account: string, token: string, tokenType?: 'OAUTH' | 'KEYPAIR_JWT' }
 *
 * URL routing: /proxy/snowflake/statements -> POST to Snowflake SQL API
 */
export class SnowflakeAdapter implements CredentialAdapter {
  readonly serviceType = 'snowflake';

  resolveTargetUrl(remainingPath: string, credentials: Record<string, any>): string {
    const account = credentials.account;
    const path = remainingPath || 'statements';
    return `https://${account}.snowflakecomputing.com/api/v2/${path}`;
  }

  apply(config: ProxyRequestConfig, credentials: Record<string, any>): ProxyRequestConfig {
    const tokenType = credentials.tokenType || 'OAUTH';
    config.headers['authorization'] = `Bearer ${credentials.token}`;
    config.headers['content-type'] = config.headers['content-type'] || 'application/json';
    config.headers['x-snowflake-authorization-token-type'] = tokenType;
    config.headers['accept'] = 'application/json';
    return config;
  }
}
