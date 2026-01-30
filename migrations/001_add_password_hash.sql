-- Complete migration for JWT authentication support
-- Run this in Supabase SQL Editor

-- Add email column (REQUIRED for authentication)
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS email TEXT;

-- Add password_hash column for JWT authentication
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Add display_name column
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS display_name TEXT;

-- Add role column with default value
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'viewer';

-- Make firebase_uid nullable (support both Firebase and JWT auth)
ALTER TABLE user_profiles 
ALTER COLUMN firebase_uid DROP NOT NULL;

-- Add unique constraint on email
ALTER TABLE user_profiles 
ADD CONSTRAINT user_profiles_email_unique UNIQUE (email);

-- Add indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON user_profiles(role);

-- Verify the migration
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'user_profiles'
ORDER BY ordinal_position;
