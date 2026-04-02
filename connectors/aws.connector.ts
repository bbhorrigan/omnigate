import crypto from 'crypto';
import { Connector, TokenResult } from './types';

/**
 * AWS STS connector — assumes a role to get temporary credentials.
 * Uses form-based flow (no browser redirect).
 *
 * User provides: roleArn, region (optional), externalId (optional)
 * Omnigate calls STS AssumeRole and stores the temporary credentials.
 *
 * Requires server-level AWS credentials (env: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
 * that have permission to call sts:AssumeRole on the target role.
 */
export class AwsConnector implements Connector {
  readonly serviceType = 'aws';
  readonly displayName = 'AWS';
  readonly flowType = 'form' as const;
  readonly supportsRefresh = true;
  readonly refreshBufferMs = 5 * 60 * 1000; // 5 min buffer for 1-hour STS tokens

  private get accessKeyId() { return process.env.AWS_ACCESS_KEY_ID || ''; }
  private get secretAccessKey() { return process.env.AWS_SECRET_ACCESS_KEY || ''; }

  getAuthorizationUrl(): string {
    throw new Error('AWS connector uses form-based flow, not OAuth redirect');
  }

  async handleCallback(params: Record<string, string>): Promise<TokenResult> {
    const { roleArn, region = 'us-east-1', externalId, sessionName = 'omnigate' } = params;
    if (!roleArn) throw new Error('roleArn is required');

    // Build STS AssumeRole request
    const stsParams: Record<string, string> = {
      Action: 'AssumeRole',
      Version: '2011-06-15',
      RoleArn: roleArn,
      RoleSessionName: sessionName,
      DurationSeconds: '3600',
    };
    if (externalId) stsParams.ExternalId = externalId;

    const host = `sts.${region}.amazonaws.com`;
    const body = new URLSearchParams(stsParams).toString();
    const now = new Date();
    const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z/, 'Z');
    const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, '');

    // SigV4 signing
    const payloadHash = sha256Hex(body);
    const canonicalHeaders = `content-type:application/x-www-form-urlencoded\nhost:${host}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = 'content-type;host;x-amz-date';
    const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

    const scope = `${dateStamp}/${region}/sts/aws4_request`;
    const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${sha256Hex(canonicalRequest)}`;

    const kDate = hmac(`AWS4${this.secretAccessKey}`, dateStamp);
    const kRegion = hmac(kDate, region);
    const kService = hmac(kRegion, 'sts');
    const kSigning = hmac(kService, 'aws4_request');
    const signature = hmacHex(kSigning, stringToSign);

    const authorization =
      `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${scope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const res = await fetch(`https://${host}/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Host': host,
        'X-Amz-Date': amzDate,
        'Authorization': authorization,
      },
      body,
    });

    const xml = await res.text();
    if (!res.ok) throw new Error(`STS AssumeRole failed (${res.status}): ${xml}`);

    // Parse XML response (simple regex extraction, no XML parser needed)
    const accessKeyIdResult = extract(xml, 'AccessKeyId');
    const secretAccessKeyResult = extract(xml, 'SecretAccessKey');
    const sessionToken = extract(xml, 'SessionToken');
    const expiration = extract(xml, 'Expiration');

    if (!accessKeyIdResult || !secretAccessKeyResult) {
      throw new Error('Failed to parse STS response');
    }

    return {
      credentials: {
        accessKeyId: accessKeyIdResult,
        secretAccessKey: secretAccessKeyResult,
        sessionToken,
        region,
        roleArn,
        expiresAt: expiration,
      },
      expiresAt: expiration ? new Date(expiration) : undefined,
    };
  }

  async refreshCredentials(credentials: Record<string, any>): Promise<TokenResult | null> {
    // Re-assume the role to get fresh temporary credentials
    if (!credentials.roleArn) return null;
    return this.handleCallback({
      roleArn: credentials.roleArn,
      region: credentials.region || 'us-east-1',
    });
  }
}

function sha256Hex(data: string): string {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}

function hmac(key: string | Buffer, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}

function hmacHex(key: Buffer, data: string): string {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest('hex');
}

function extract(xml: string, tag: string): string | undefined {
  const match = xml.match(new RegExp(`<${tag}>([^<]+)</${tag}>`));
  return match?.[1];
}
