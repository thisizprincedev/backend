-- CreateTable for new backend tables only
-- This migration adds tables needed for the backend without affecting existing tables

-- Database Providers table
CREATE TABLE IF NOT EXISTS "database_providers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "provider_type" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "tenant_id" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "database_providers_pkey" PRIMARY KEY ("id")
);

-- Applications table (App Builder)
CREATE TABLE IF NOT EXISTS "app_builder_apps" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" BIGINT,
    "owner_id" TEXT NOT NULL,
    "firebase_uid" TEXT NOT NULL,
    "app_name" TEXT NOT NULL,
    "package_name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "db_provider_type" TEXT NOT NULL,
    "database_provider_id" UUID,
    "encrypted_config" TEXT,
    "universal_realtime" BOOLEAN DEFAULT false,
    "build_status" TEXT DEFAULT 'queued',
    "build_started_at" TIMESTAMPTZ(6),
    "build_completed_at" TIMESTAMPTZ(6),
    "build_error" TEXT,
    "apk_url" TEXT,
    "icon_bucket" TEXT,
    "icon_path" TEXT,
    "is_default" BOOLEAN DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_builder_apps_pkey" PRIMARY KEY ("id")
);

-- Command Queue table
CREATE TABLE IF NOT EXISTS "command_queue" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "device_id" TEXT NOT NULL,
    "command_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "max_retries" INTEGER NOT NULL DEFAULT 3,
    "scheduled_at" TIMESTAMPTZ(6),
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "command_queue_pkey" PRIMARY KEY ("id")
);

-- WebSocket Sessions table
CREATE TABLE IF NOT EXISTS "websocket_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "socket_id" TEXT NOT NULL UNIQUE,
    "device_id" TEXT,
    "user_id" TEXT,
    "connected_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_ping" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "websocket_sessions_pkey" PRIMARY KEY ("id")
);

-- Rate Limits table
CREATE TABLE IF NOT EXISTS "rate_limits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "identifier" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "window_start" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("id")
);

-- Audit Logs table
CREATE TABLE IF NOT EXISTS "user_action_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resource_type" TEXT,
    "resource_id" TEXT,
    "details" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_action_logs_pkey" PRIMARY KEY ("id")
);

-- Device App Assignments table
CREATE TABLE IF NOT EXISTS "device_app_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "device_id" TEXT NOT NULL,
    "app_id" UUID NOT NULL,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_by" TEXT NOT NULL,

    CONSTRAINT "device_app_assignments_pkey" PRIMARY KEY ("id")
);

-- Two Factor Codes table
CREATE TABLE IF NOT EXISTS "two_factor_codes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "firebase_uid" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "two_factor_codes_pkey" PRIMARY KEY ("id")
);

-- User Profiles table
CREATE TABLE IF NOT EXISTS "user_profiles" (
    "id" BIGSERIAL PRIMARY KEY,
    "supabase_user_id" TEXT NOT NULL UNIQUE,
    "role" TEXT DEFAULT 'viewer',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- User Settings table
CREATE TABLE IF NOT EXISTS "user_settings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL UNIQUE,
    "universal_firebase_config" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("id")
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS "idx_database_providers_tenant" ON "database_providers"("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_database_providers_type" ON "database_providers"("provider_type");

CREATE INDEX IF NOT EXISTS "idx_app_builder_owner" ON "app_builder_apps"("owner_id");
CREATE INDEX IF NOT EXISTS "idx_app_builder_status" ON "app_builder_apps"("build_status");

CREATE INDEX IF NOT EXISTS "idx_command_queue_device" ON "command_queue"("device_id");
CREATE INDEX IF NOT EXISTS "idx_command_queue_status" ON "command_queue"("status");
CREATE INDEX IF NOT EXISTS "idx_command_queue_priority" ON "command_queue"("priority" DESC);

CREATE INDEX IF NOT EXISTS "idx_websocket_device" ON "websocket_sessions"("device_id");
CREATE INDEX IF NOT EXISTS "idx_websocket_user" ON "websocket_sessions"("user_id");

CREATE INDEX IF NOT EXISTS "idx_rate_limits_identifier" ON "rate_limits"("identifier", "endpoint");

CREATE INDEX IF NOT EXISTS "idx_audit_user" ON "user_action_logs"("user_id");
CREATE INDEX IF NOT EXISTS "idx_audit_created" ON "user_action_logs"("created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_device_app_device" ON "device_app_assignments"("device_id");
CREATE INDEX IF NOT EXISTS "idx_device_app_app" ON "device_app_assignments"("app_id");

CREATE INDEX IF NOT EXISTS "idx_2fa_uid" ON "two_factor_codes"("firebase_uid");
CREATE INDEX IF NOT EXISTS "idx_2fa_code" ON "two_factor_codes"("code");
