export interface ProxyRequestConfig {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: Buffer | string;
}

export interface CredentialAdapter {
  /** Matches SaaSMapping.saasType */
  readonly serviceType: string;

  /** Build the downstream URL from the remaining path + stored credentials */
  resolveTargetUrl(remainingPath: string, credentials: Record<string, any>): string;

  /** Inject auth into the outgoing request */
  apply(
    config: ProxyRequestConfig,
    credentials: Record<string, any>
  ): Promise<ProxyRequestConfig> | ProxyRequestConfig;
}
