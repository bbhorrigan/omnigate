#!/usr/bin/env node

// Copyright (c) HashiCorp, Inc.
// SPDX-License-Identifier: MPL-2.0

import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as https from 'https';
import * as readline from 'readline';
import * as os from 'os';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const OMNIGATE_DIR = path.join(os.homedir(), '.omnigate');
const CREDENTIALS_FILE = path.join(OMNIGATE_DIR, 'credentials.json');

function getServerUrl(): string {
  return (process.env.OMNIGATE_URL || 'http://localhost:3000').replace(/\/+$/, '');
}

function ensureConfigDir(): void {
  if (!fs.existsSync(OMNIGATE_DIR)) {
    fs.mkdirSync(OMNIGATE_DIR, { recursive: true });
  }
}

function loadCredentials(): Record<string, string> {
  try {
    const raw = fs.readFileSync(CREDENTIALS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveCredentials(creds: Record<string, string>): void {
  ensureConfigDir();
  fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(creds, null, 2) + '\n', {
    mode: 0o600,
  });
}

function getAccessToken(): string | null {
  const creds = loadCredentials();
  return creds.accessToken || null;
}

// ---------------------------------------------------------------------------
// HTTP request helper (no external deps — uses Node built-ins)
// ---------------------------------------------------------------------------

interface RequestOptions {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

interface RequestResult {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

function request(opts: RequestOptions): Promise<RequestResult> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(opts.url);
    const isHttps = parsed.protocol === 'https:';
    const transport = isHttps ? https : http;

    const reqHeaders: Record<string, string> = { ...(opts.headers || {}) };
    if (opts.body && !reqHeaders['content-type']) {
      reqHeaders['content-type'] = 'application/json';
    }
    if (opts.body) {
      reqHeaders['content-length'] = Buffer.byteLength(opts.body).toString();
    }

    const req = transport.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: opts.method || 'GET',
        headers: reqHeaders,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf-8'),
          });
        });
      },
    );

    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

// Authenticated request helper
function authRequest(opts: RequestOptions): Promise<RequestResult> {
  const token = getAccessToken();
  if (!token) {
    console.error('Error: Not logged in. Run `omnigate login` first.');
    process.exit(1);
  }
  const headers = opts.headers || {};
  headers['authorization'] = `Bearer ${token}`;
  return request({ ...opts, headers });
}

// ---------------------------------------------------------------------------
// Pretty-print helpers
// ---------------------------------------------------------------------------

function prettyPrint(body: string): void {
  try {
    const obj = JSON.parse(body);
    console.log(JSON.stringify(obj, null, 2));
  } catch {
    console.log(body);
  }
}

function printError(status: number, body: string): void {
  console.error(`Error (HTTP ${status}):`);
  try {
    const obj = JSON.parse(body);
    if (obj.error) {
      console.error(`  ${obj.error}`);
      if (obj.hint) console.error(`  Hint: ${obj.hint}`);
      if (obj.detail) console.error(`  Detail: ${obj.detail}`);
    } else {
      console.error(JSON.stringify(obj, null, 2));
    }
  } catch {
    console.error(`  ${body}`);
  }
}

// ---------------------------------------------------------------------------
// Readline prompt helper
// ---------------------------------------------------------------------------

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function cmdLogin(): Promise<void> {
  const serverUrl = getServerUrl();
  const authUrl = `${serverUrl}/auth/github`;

  console.log('Open this URL in your browser to log in via GitHub:\n');
  console.log(`  ${authUrl}\n`);
  console.log(
    'After authenticating, you will be redirected with tokens in the URL.',
  );
  console.log(
    'Copy the accessToken and refreshToken from the redirect URL.\n',
  );

  const accessToken = await prompt('Paste your accessToken: ');
  if (!accessToken) {
    console.error('Error: No access token provided.');
    process.exit(1);
  }

  const refreshToken = await prompt('Paste your refreshToken (optional, press Enter to skip): ');

  const creds: Record<string, string> = { accessToken };
  if (refreshToken) creds.refreshToken = refreshToken;
  saveCredentials(creds);

  console.log(`\nCredentials saved to ${CREDENTIALS_FILE}`);

  // Verify by calling /auth/me
  try {
    const res = await request({
      url: `${serverUrl}/auth/me`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (res.status === 200) {
      const user = JSON.parse(res.body);
      console.log(`Logged in as: ${user.email}`);
    } else {
      console.warn('Warning: Could not verify token. The server may be unreachable.');
    }
  } catch {
    console.warn('Warning: Could not reach the server to verify the token.');
  }
}

async function cmdConnect(service: string): Promise<void> {
  if (!service) {
    console.error('Usage: omnigate connect <service>');
    console.error('Example: omnigate connect snowflake');
    process.exit(1);
  }

  const serverUrl = getServerUrl();

  console.log(`Connecting service: ${service}\n`);
  console.log('Enter the credentials for this service.');
  console.log('(Type each key=value pair, one per line. Enter an empty line when done.)\n');

  const credentials: Record<string, string> = {};
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  await new Promise<void>((resolve) => {
    const askLine = (): void => {
      rl.question('  credential (key=value): ', (line) => {
        const trimmed = line.trim();
        if (!trimmed) {
          rl.close();
          resolve();
          return;
        }
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) {
          console.error('  Invalid format. Use key=value (e.g. account=myaccount)');
          askLine();
          return;
        }
        const key = trimmed.slice(0, eqIdx).trim();
        const value = trimmed.slice(eqIdx + 1).trim();
        credentials[key] = value;
        askLine();
      });
    };
    askLine();
  });

  if (Object.keys(credentials).length === 0) {
    console.error('Error: No credentials provided.');
    process.exit(1);
  }

  console.log(`\nStoring credentials for ${service}...`);

  const res = await authRequest({
    url: `${serverUrl}/credentials`,
    method: 'POST',
    body: JSON.stringify({ service, credentials }),
  });

  if (res.status >= 200 && res.status < 300) {
    console.log(`Successfully stored credentials for ${service}.`);
  } else {
    printError(res.status, res.body);
    process.exit(1);
  }
}

async function cmdProxy(
  service: string,
  proxyPath: string,
  method: string,
  body: string | undefined,
  extraHeaders: Record<string, string>,
): Promise<void> {
  if (!service || !proxyPath) {
    console.error('Usage: omnigate proxy <service> <path> [--method METHOD] [--body JSON] [--header key:value]');
    process.exit(1);
  }

  const serverUrl = getServerUrl();
  const cleanPath = proxyPath.replace(/^\/+/, '');
  const url = `${serverUrl}/proxy/${service}/${cleanPath}`;

  const headers: Record<string, string> = { ...extraHeaders };
  if (body) {
    headers['content-type'] = headers['content-type'] || 'application/json';
  }

  const res = await authRequest({
    url,
    method,
    headers,
    body,
  });

  if (res.status >= 200 && res.status < 300) {
    prettyPrint(res.body);
  } else {
    printError(res.status, res.body);
    process.exit(1);
  }
}

async function cmdServices(): Promise<void> {
  const serverUrl = getServerUrl();

  const res = await authRequest({ url: `${serverUrl}/proxy` });

  if (res.status >= 200 && res.status < 300) {
    const data = JSON.parse(res.body);
    console.log('Available services:');
    if (Array.isArray(data.services)) {
      for (const svc of data.services) {
        console.log(`  - ${svc}`);
      }
    } else {
      prettyPrint(res.body);
    }
  } else {
    printError(res.status, res.body);
    process.exit(1);
  }
}

async function cmdStatus(): Promise<void> {
  const serverUrl = getServerUrl();

  // Health check (no auth needed)
  console.log(`Server: ${serverUrl}\n`);
  try {
    const healthRes = await request({ url: `${serverUrl}/health` });
    if (healthRes.status === 200) {
      const health = JSON.parse(healthRes.body);
      console.log('Health:');
      console.log(`  Status: ${health.status}`);
      console.log(`  Database: ${health.db ? 'connected' : 'disconnected'}`);
      console.log(`  Redis: ${health.redis ? 'connected' : 'disconnected'}`);
    } else {
      console.log(`Health: unreachable (HTTP ${healthRes.status})`);
    }
  } catch (err) {
    console.log('Health: server unreachable');
    console.error(`  ${err instanceof Error ? err.message : String(err)}`);
  }

  // Auth status
  const token = getAccessToken();
  if (!token) {
    console.log('\nAuth: not logged in');
    return;
  }

  try {
    const meRes = await request({
      url: `${serverUrl}/auth/me`,
      headers: { authorization: `Bearer ${token}` },
    });
    if (meRes.status === 200) {
      const me = JSON.parse(meRes.body);
      console.log(`\nAuth: logged in as ${me.email} (user ${me.userId})`);
    } else {
      console.log('\nAuth: token invalid or expired');
    }
  } catch {
    console.log('\nAuth: could not verify (server unreachable)');
  }

  // Connected services
  if (token) {
    try {
      const credRes = await request({
        url: `${serverUrl}/credentials`,
        headers: { authorization: `Bearer ${token}` },
      });
      if (credRes.status === 200) {
        const data = JSON.parse(credRes.body);
        if (Array.isArray(data.services) && data.services.length > 0) {
          console.log('\nConnected services:');
          for (const svc of data.services) {
            console.log(`  - ${svc.service} (updated ${svc.updatedAt})`);
          }
        } else {
          console.log('\nConnected services: none');
        }
      }
    } catch {
      // ignore
    }
  }
}

async function cmdQuery(service: string, sql: string): Promise<void> {
  if (!service || !sql) {
    console.error('Usage: omnigate query <service> "<SQL>"');
    console.error('Example: omnigate query snowflake "SELECT CURRENT_TIMESTAMP()"');
    process.exit(1);
  }

  const serverUrl = getServerUrl();

  // Snowflake SQL API endpoint
  let proxyPath: string;
  let body: string;

  if (service === 'snowflake') {
    proxyPath = 'api/v2/statements';
    body = JSON.stringify({ statement: sql, timeout: 60 });
  } else {
    // Generic — send as JSON body with a sql field
    proxyPath = 'query';
    body = JSON.stringify({ sql });
  }

  const url = `${serverUrl}/proxy/${service}/${proxyPath}`;

  const res = await authRequest({
    url,
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json' },
  });

  if (res.status >= 200 && res.status < 300) {
    prettyPrint(res.body);
  } else {
    printError(res.status, res.body);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): {
  command: string;
  positional: string[];
  flags: Record<string, string>;
} {
  const args = argv.slice(2); // skip node + script
  const command = args[0] || '';
  const positional: string[] = [];
  const flags: Record<string, string> = {};

  let i = 1;
  while (i < args.length) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next;
        i += 2;
      } else {
        flags[key] = 'true';
        i += 1;
      }
    } else {
      positional.push(arg);
      i += 1;
    }
  }

  return { command, positional, flags };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function printUsage(): void {
  console.log(`omnigate — CLI for the Omnigate proxy

Usage:
  omnigate <command> [arguments] [flags]

Commands:
  login                          Authenticate via GitHub OAuth
  connect <service>              Store credentials for a service (interactive)
  proxy <service> <path>         Make a proxied request (GET by default)
  services                       List available services
  status                         Check server health and auth status
  query <service> "<SQL>"        Run a SQL query (shorthand for Snowflake, etc.)

Proxy flags:
  --method METHOD                HTTP method (default: GET)
  --body JSON                    Request body (JSON string)
  --header key:value             Extra header (can be repeated)

Environment:
  OMNIGATE_URL                   Server URL (default: http://localhost:3000)

Examples:
  omnigate login
  omnigate connect snowflake
  omnigate services
  omnigate status
  omnigate proxy snowflake api/v2/statements --method POST --body '{"statement":"SELECT 1"}'
  omnigate query snowflake "SELECT CURRENT_TIMESTAMP()"
`);
}

async function main(): Promise<void> {
  const { command, positional, flags } = parseArgs(process.argv);

  // Collect --header flags (multiple allowed via repeated parsing)
  const extraHeaders: Record<string, string> = {};
  // Re-scan argv for all --header occurrences
  const rawArgs = process.argv.slice(2);
  for (let i = 0; i < rawArgs.length; i++) {
    if (rawArgs[i] === '--header' && rawArgs[i + 1]) {
      const val = rawArgs[i + 1];
      const colonIdx = val.indexOf(':');
      if (colonIdx > 0) {
        extraHeaders[val.slice(0, colonIdx).trim().toLowerCase()] = val.slice(colonIdx + 1).trim();
      }
      i++;
    }
  }

  switch (command) {
    case 'login':
      await cmdLogin();
      break;

    case 'connect':
      await cmdConnect(positional[0]);
      break;

    case 'proxy':
      await cmdProxy(
        positional[0],
        positional[1],
        (flags.method || 'GET').toUpperCase(),
        flags.body,
        extraHeaders,
      );
      break;

    case 'services':
      await cmdServices();
      break;

    case 'status':
      await cmdStatus();
      break;

    case 'query':
      await cmdQuery(positional[0], positional.slice(1).join(' '));
      break;

    case 'help':
    case '--help':
    case '-h':
      printUsage();
      break;

    default:
      if (command) {
        console.error(`Unknown command: ${command}\n`);
      }
      printUsage();
      process.exit(command ? 1 : 0);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
