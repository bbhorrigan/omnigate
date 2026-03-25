import { CredentialAdapter } from './types';
import { BearerAdapter } from './bearer.adapter';
import { AwsAdapter } from './aws.adapter';
import { SnowflakeAdapter } from './snowflake.adapter';

const adapters = new Map<string, CredentialAdapter>();

function register(adapter: CredentialAdapter) {
  adapters.set(adapter.serviceType, adapter);
}

register(new BearerAdapter());
register(new AwsAdapter());
register(new SnowflakeAdapter());

export function getAdapter(serviceType: string): CredentialAdapter | undefined {
  return adapters.get(serviceType);
}

export function listAdapters(): string[] {
  return Array.from(adapters.keys());
}
