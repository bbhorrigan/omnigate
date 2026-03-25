import crypto from 'crypto';
import { CredentialAdapter, ProxyRequestConfig } from './types';

/**
 * AWS SigV4 adapter — signs requests for any AWS service.
 * Credentials shape: { accessKeyId, secretAccessKey, sessionToken?, region }
 *
 * URL routing: /proxy/aws/s3/my-bucket/key -> service=s3, path=/my-bucket/key
 */
export class AwsAdapter implements CredentialAdapter {
  readonly serviceType = 'aws';

  resolveTargetUrl(remainingPath: string, credentials: Record<string, any>): string {
    const region = credentials.region || 'us-east-1';
    // First segment is the AWS service name, rest is the path
    const slashIdx = remainingPath.indexOf('/');
    const service = slashIdx === -1 ? remainingPath : remainingPath.slice(0, slashIdx);
    const path = slashIdx === -1 ? '/' : '/' + remainingPath.slice(slashIdx + 1);
    return `https://${service}.${region}.amazonaws.com${path}`;
  }

  apply(config: ProxyRequestConfig, credentials: Record<string, any>): ProxyRequestConfig {
    const url = new URL(config.url);
    const region = credentials.region || 'us-east-1';
    // Extract AWS service from hostname (e.g., s3.us-east-1.amazonaws.com -> s3)
    const service = url.hostname.split('.')[0];

    const now = new Date();
    const dateStamp = toDateStamp(now);
    const amzDate = toAmzDate(now);

    const scope = `${dateStamp}/${region}/${service}/aws4_request`;

    // Canonical headers
    config.headers['host'] = url.hostname;
    config.headers['x-amz-date'] = amzDate;
    if (credentials.sessionToken) {
      config.headers['x-amz-security-token'] = credentials.sessionToken;
    }

    const body = config.body ? String(config.body) : '';
    const payloadHash = sha256Hex(body);
    config.headers['x-amz-content-sha256'] = payloadHash;

    // Build canonical request
    const signedHeaderKeys = Object.keys(config.headers)
      .map(k => k.toLowerCase())
      .sort();
    const signedHeaders = signedHeaderKeys.join(';');

    const canonicalHeaders = signedHeaderKeys
      .map(k => `${k}:${config.headers[Object.keys(config.headers).find(h => h.toLowerCase() === k)!].trim()}`)
      .join('\n') + '\n';

    const canonicalRequest = [
      config.method.toUpperCase(),
      url.pathname || '/',
      url.searchParams.toString(),
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    // String to sign
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      scope,
      sha256Hex(canonicalRequest),
    ].join('\n');

    // Signing key
    const kDate = hmacSha256(`AWS4${credentials.secretAccessKey}`, dateStamp);
    const kRegion = hmacSha256(kDate, region);
    const kService = hmacSha256(kRegion, service);
    const kSigning = hmacSha256(kService, 'aws4_request');

    const signature = hmacSha256Hex(kSigning, stringToSign);

    config.headers['authorization'] =
      `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${scope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return config;
  }
}

function sha256Hex(data: string): string {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}

function hmacSha256(key: string | Buffer, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}

function hmacSha256Hex(key: Buffer, data: string): string {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest('hex');
}

function toAmzDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z/, 'Z');
}

function toDateStamp(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}
