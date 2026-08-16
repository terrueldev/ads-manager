# Database Component

PostgreSQL database migrations, seeds, and management scripts. Deployed to local Kubernetes cluster.

## Prerequisites

- Local Kubernetes cluster (Docker Desktop, minikube, or kind)
- kubectl configured and connected
- Helm 3 installed
- psql client (for direct database access)

## Quick Start

Database operations are performed via SDD commands in your Claude Code session:

```
/sdd set up the database        # Deploy PostgreSQL to k8s
/sdd forward the database port  # Forward port (run in separate terminal)
/sdd run database migrations    # Run migrations
/sdd seed the database          # (Optional) Load seed data
```

## Schema

### `connected_accounts`

Google Ads accounts connected via OAuth (see the `google-ads-connection` change SPEC). One row per connected account/sub-account.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `UUID` | Primary key, `gen_random_uuid()` |
| `google_customer_id` | `VARCHAR(32)` | Google Ads Customer ID, unique |
| `account_name` | `VARCHAR(255)` | Account display name from Google Ads |
| `currency_code` | `VARCHAR(8)` | Account currency (e.g. `BRL`, `USD`) |
| `timezone` | `VARCHAR(64)` | Account timezone (e.g. `America/Sao_Paulo`) |
| `status` | `VARCHAR(32)` | `active` \| `suspended` \| `needs_reconnect` (default `active`) |
| `oauth_refresh_token_encrypted` | `TEXT` | Encrypted OAuth refresh token; never exposed via API |
| `granted_scopes` | `TEXT` | OAuth scopes granted at connection time |
| `connected_at` | `TIMESTAMPTZ` | When the account was connected |
| `updated_at` | `TIMESTAMPTZ` | Last update timestamp |

Indexes: `idx_connected_accounts_customer_id` (unique btree on `google_customer_id`).

## Available Operations

| Prompt | Description |
|--------|-------------|
| `/sdd set up the database` | Deploy PostgreSQL to local Kubernetes cluster |
| `/sdd tear down the database` | Remove PostgreSQL from cluster |
| `/sdd forward the database port` | Forward localhost:5432 to database pod |
| `/sdd connect to the database` | Connect to database via psql |
| `/sdd run database migrations` | Run all pending migrations |
| `/sdd seed the database` | Load seed data |
| `/sdd reset the database` | Drop, recreate, migrate, and seed |

## Adding Migrations

Create numbered SQL files in `migrations/`:

```
migrations/
├── 001_initial_schema.sql
├── 002_add_users.sql
└── 003_add_orders.sql
```

Migration files run in alphabetical order. Each migration should:
- Use a transaction (`BEGIN`/`COMMIT`)
- Be idempotent where possible
- Include rollback comments for reference

## Adding Seeds

Create numbered SQL files in `seeds/`:

```
seeds/
├── 001_reference_data.sql
└── 002_test_users.sql
```

Seed files should use `ON CONFLICT` for idempotency:

```sql
INSERT INTO users (id, email) VALUES (1, 'admin@example.com')
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
```

## Default Connection Settings

When using port-forward, connections default to:

| Setting | Value |
|---------|-------|
| Host | localhost |
| Port | 5432 |
| Database | ads-manager |
| Username | ads-manager |
| Password | ads-manager-local |

Override with environment variables:

```bash
export PGHOST=localhost
export PGPORT=5432
export PGDATABASE=ads-manager
export PGUSER=ads-manager
export PGPASSWORD=your_password
```

## Configuration

Customize deployment with environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_NAMESPACE` | default | Kubernetes namespace |
| `DB_RELEASE_NAME` | ads-manager-db | Helm release name |
| `DB_LOCAL_PORT` | 5432 | Local port for port-forward |
