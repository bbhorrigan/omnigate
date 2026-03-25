# Omnigate

Authenticate once, access everything.

Omnigate is a proxy-layer authentication gateway that lets users connect their SaaS accounts once and then access them through a unified proxy — without managing individual credentials per service.

## How it works

1. **Authenticate** with GitHub OAuth or any OIDC provider
2. **Connect** your SaaS accounts (Snowflake, AWS, etc.) — Omnigate handles the OAuth/STS flow
3. **Proxy** all requests through Omnigate using your short-lived JWT — no per-service credentials needed

## Architecture

```
User → GitHub/OIDC OAuth → Omnigate (JWT) → /proxy/snowflake/* → Snowflake
                                           → /proxy/aws/*       → AWS (SigV4)
                                           → /proxy/bearer/*    → Any Bearer token service
```

### Core components

| Directory | Purpose |
|---|---|
| `connectors/` | OAuth/STS flows for downstream services (Snowflake OAuth, AWS STS AssumeRole) |
| `connectors/refresh.service.ts` | Auto-refreshes expired credentials before forwarding |
| `proxy/` | Request routing and forwarding |
| `proxy/adapters/` | Credential injection — signs AWS requests, injects Bearer tokens, etc. |
| `jwt.ts` | Short-lived access tokens (15 min) + long-lived refresh tokens (7 days) |
| `auth.service.ts` | User management and credential storage |
| `cache.ts` / `db.ts` | Redis (sessions, OAuth state, token cache) + PostgreSQL (users, credentials) |

### Supported connectors

| Service | Flow | Refresh |
|---|---|---|
| Snowflake | OAuth 2.0 (browser redirect) | Yes |
| AWS | STS AssumeRole (form POST) | Yes |
| Generic Bearer | Store `token` + `baseUrl` via API | No |

### Supported proxy adapters

| Service | Auth mechanism |
|---|---|
| `snowflake` | `Authorization: Bearer <token>` |
| `aws` | AWS Signature V4 |
| `bearer` | `Authorization: Bearer <token>` |

## Setup

### 1. Start infrastructure

```sh
docker-compose up -d
```

Requires PostgreSQL 14+ and Redis 7+.

### 2. Install dependencies

```sh
npm install
```

### 3. Configure environment

```sh
cp .env .env.local
# Edit .env.local with your values
```

Required variables:

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=auth_middleware

# Redis
REDIS_URL=redis://localhost:6379

# GitHub OAuth (https://github.com/settings/developers)
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret

# JWT secret (generate with: openssl rand -hex 32)
JWT_SECRET=your_secret

# App
PORT=3000
BASE_URL=http://localhost:3000
```

Optional OIDC provider (Okta, Auth0, Azure AD, etc.):

```env
OIDC_ISSUER=https://your-tenant.okta.com
OIDC_CLIENT_ID=your_client_id
OIDC_CLIENT_SECRET=your_client_secret
OIDC_CALLBACK_URL=http://localhost:3000/auth/oidc/callback
```

Optional Snowflake connector:

```env
SNOWFLAKE_ACCOUNT=your_account
SNOWFLAKE_OAUTH_CLIENT_ID=your_client_id
SNOWFLAKE_OAUTH_CLIENT_SECRET=your_client_secret
SNOWFLAKE_ROLE=PUBLIC
```

Optional AWS connector (server-side credentials with `sts:AssumeRole` permission):

```env
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
```

### 4. Run migrations

```sh
npm run migration:run
```

### 5. Start the server

```sh
npm run dev     # Development (ts-node)
npm run build && npm start   # Production
```

## API reference

### Authentication

| Method | Path | Description |
|---|---|---|
| `GET` | `/auth/github` | Initiate GitHub OAuth |
| `GET` | `/auth/github/callback` | OAuth callback — returns JWTs |
| `GET` | `/auth/oidc` | Initiate OIDC flow |
| `POST` | `/auth/refresh` | Exchange refresh token for new access token |
| `GET` | `/auth/me` | Get current user (requires `Authorization: Bearer <token>`) |

### Credentials

| Method | Path | Description |
|---|---|---|
| `POST` | `/credentials` | Store credentials for a service |
| `GET` | `/credentials` | List connected services for current user |

### Connectors

| Method | Path | Description |
|---|---|---|
| `GET` | `/connect` | List available connectors |
| `GET` | `/connect/:service` | Initiate OAuth flow (Snowflake) |
| `GET` | `/connect/:service/callback` | OAuth callback |
| `POST` | `/connect/:service` | Form-based connect (AWS) |

### Proxy

| Method | Path | Description |
|---|---|---|
| `GET` | `/proxy` | List available proxy services |
| `*` | `/proxy/:service/*` | Forward request to downstream service |

### Health

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check (DB + Redis status) |

## Adding a new connector

1. Create a class implementing `Connector` in `connectors/`:

```ts
// connectors/my-service.connector.ts
import { Connector, TokenResult } from './types';

export class MyServiceConnector implements Connector {
  readonly serviceType = 'myservice';
  readonly displayName = 'My Service';
  readonly flowType = 'oauth'; // or 'form'
  readonly supportsRefresh = true;

  getAuthorizationUrl(state: string, redirectUri: string): string { ... }
  async handleCallback(params: Record<string, string>, redirectUri: string): Promise<TokenResult> { ... }
  async refreshCredentials(credentials: Record<string, any>): Promise<TokenResult | null> { ... }
}
```

2. Register it in `connectors/index.ts`:

```ts
register(new MyServiceConnector());
```

3. (Optional) Add a proxy adapter in `proxy/adapters/` if the service needs special auth handling (e.g., AWS SigV4), then register it in `proxy/adapters/index.ts`.

## Adding a new proxy adapter

1. Create a class implementing `CredentialAdapter` in `proxy/adapters/`:

```ts
// proxy/adapters/my-adapter.ts
import { CredentialAdapter, ProxyRequestConfig } from './types';

export class MyAdapter implements CredentialAdapter {
  readonly serviceType = 'myservice';

  resolveTargetUrl(remainingPath: string, credentials: Record<string, any>): string { ... }
  apply(config: ProxyRequestConfig, credentials: Record<string, any>): ProxyRequestConfig { ... }
}
```

2. Register it in `proxy/adapters/index.ts`:

```ts
register(new MyAdapter());
```

## Credential flow examples

### Snowflake via OAuth

```
1. GET /connect/snowflake     → Redirects to Snowflake OAuth
2. User approves in Snowflake  → Callback to /connect/snowflake/callback
3. Omnigate exchanges code    → Stores OAuth token in Postgres
4. POST /proxy/snowflake/statements  → Adds Bearer token, forwards to Snowflake SQL API
```

### AWS via STS AssumeRole

```
1. POST /connect/aws          → Body: { roleArn: "arn:aws:iam::...", region: "us-east-1" }
2. Omnigate calls STS         → Stores temp credentials (1hr TTL)
3. POST /proxy/aws/s3/bucket  → Signs request with SigV4, forwards to S3
4. Auto-refresh               → 5 min before expiry, re-assumes role
```

## Development

```sh
npm run build      # Compile TypeScript
npm run dev       # Run with ts-node
npm run test      # Run tests
npm run lint      # Lint
npm run typecheck # TypeScript check
```

## Project status

Actively developed. The core proxy + connector architecture is in place. Snowflake OAuth and AWS STS connectors are functional. Refresh flows are wired up.
