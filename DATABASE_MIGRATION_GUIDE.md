# Database Migration Guide for Existing Database

## Problem
You have an existing database with 8 tables, and Prisma wants to reset it (which would delete all your data).

## Solution: Baseline Migration

### Step 1: Create Initial Migration Directory
```bash
mkdir -p prisma/migrations/0_init
```

### Step 2: Mark Existing Tables as Migrated
```bash
npx prisma migrate resolve --applied "0_init"
```

This tells Prisma: "These 8 tables already exist, don't try to create them."

### Step 3: Update Schema with New Tables

Add these new models to your `prisma/schema.prisma` (after the existing models):

```prisma
// New tables for backend functionality

model database_providers {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name          String
  provider_type String
  config        Json
  is_active     Boolean  @default(true)
  tenant_id     String?
  created_by    String
  created_at    DateTime @default(now()) @db.Timestamptz(6)
  updated_at    DateTime @default(now()) @db.Timestamptz(6)

  @@index([tenant_id])
  @@index([provider_type])
}

model app_builder_apps {
  id                   String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  user_id              BigInt?
  owner_id             String
  firebase_uid         String
  app_name             String
  package_name         String
  version              String
  db_provider_type     String
  database_provider_id String?   @db.Uuid
  encrypted_config     String?
  universal_realtime   Boolean?  @default(false)
  build_status         String?   @default("queued")
  build_started_at     DateTime? @db.Timestamptz(6)
  build_completed_at   DateTime? @db.Timestamptz(6)
  build_error          String?
  apk_url              String?
  icon_bucket          String?
  icon_path            String?
  is_default           Boolean?  @default(false)
  created_at           DateTime  @default(now()) @db.Timestamptz(6)
  updated_at           DateTime  @default(now()) @db.Timestamptz(6)

  @@index([owner_id])
  @@index([build_status])
}

model command_queue {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  device_id      String
  command_type   String
  payload        Json
  status         String    @default("pending")
  priority       Int       @default(0)
  retry_count    Int       @default(0)
  max_retries    Int       @default(3)
  scheduled_at   DateTime? @db.Timestamptz(6)
  started_at     DateTime? @db.Timestamptz(6)
  completed_at   DateTime? @db.Timestamptz(6)
  error_message  String?
  created_at     DateTime  @default(now()) @db.Timestamptz(6)
  updated_at     DateTime  @default(now()) @db.Timestamptz(6)

  @@index([device_id])
  @@index([status])
  @@index([priority(sort: Desc)])
}

model websocket_sessions {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  socket_id    String   @unique
  device_id    String?
  user_id      String?
  connected_at DateTime @default(now()) @db.Timestamptz(6)
  last_ping    DateTime @default(now()) @db.Timestamptz(6)
  metadata     Json?

  @@index([device_id])
  @@index([user_id])
}

model rate_limits {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  identifier   String
  endpoint     String
  count        Int      @default(1)
  window_start DateTime @default(now()) @db.Timestamptz(6)
  created_at   DateTime @default(now()) @db.Timestamptz(6)

  @@index([identifier, endpoint])
}

model user_action_logs {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  user_id       String
  action        String
  resource_type String?
  resource_id   String?
  details       Json?
  ip_address    String?
  user_agent    String?
  created_at    DateTime @default(now()) @db.Timestamptz(6)

  @@index([user_id])
  @@index([created_at(sort: Desc)])
}

model device_app_assignments {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  device_id   String
  app_id      String   @db.Uuid
  assigned_at DateTime @default(now()) @db.Timestamptz(6)
  assigned_by String

  @@index([device_id])
  @@index([app_id])
}

model two_factor_codes {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  firebase_uid String
  code         String
  expires_at   DateTime @db.Timestamptz(6)
  used         Boolean  @default(false)
  created_at   DateTime @default(now()) @db.Timestamptz(6)

  @@index([firebase_uid])
  @@index([code])
}

model user_profiles {
  id               BigInt   @id @default(autoincrement())
  supabase_user_id String   @unique
  role             String?  @default("viewer")
  created_at       DateTime @default(now()) @db.Timestamptz(6)
  updated_at       DateTime @default(now()) @db.Timestamptz(6)
}

model user_settings {
  id                       String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  user_id                  String   @unique
  universal_firebase_config Json?
  created_at               DateTime @default(now()) @db.Timestamptz(6)
  updated_at               DateTime @default(now()) @db.Timestamptz(6)
}
```

### Step 4: Create Migration for New Tables
```bash
npx prisma migrate dev --name add_backend_tables
```

This will only create the NEW tables, not touch your existing ones.

### Step 5: Generate Prisma Client
```bash
npx prisma generate
```

---

## Quick Commands (Run in order)

```bash
# 1. Baseline existing tables
mkdir -p prisma/migrations/0_init
npx prisma migrate resolve --applied "0_init"

# 2. Add new tables (after updating schema.prisma)
npx prisma migrate dev --name add_backend_tables

# 3. Generate client
npx prisma generate
```

---

## Alternative: Skip Database Tables

Your backend works WITHOUT these tables! You only need them for:
- App Builder
- Command Queue
- Audit logs

Everything else works fine (Firebase, GeeLark, 2FA, etc.)
