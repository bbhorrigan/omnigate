import { Connector } from './types';
import { SnowflakeConnector } from './snowflake.connector';
import { AwsConnector } from './aws.connector';
import { AzureConnector } from './azure.connector';
import { DatabricksConnector } from './databricks.connector';
import { GcpConnector } from './gcp.connector';

const connectors = new Map<string, Connector>();

function register(connector: Connector) {
  connectors.set(connector.serviceType, connector);
}

register(new SnowflakeConnector());
register(new AwsConnector());
register(new AzureConnector());
register(new DatabricksConnector());
register(new GcpConnector());

export function getConnector(serviceType: string): Connector | undefined {
  return connectors.get(serviceType);
}

export function listConnectors(): { serviceType: string; displayName: string; flowType: string }[] {
  return Array.from(connectors.values()).map(c => ({
    serviceType: c.serviceType,
    displayName: c.displayName,
    flowType: c.flowType,
  }));
}
