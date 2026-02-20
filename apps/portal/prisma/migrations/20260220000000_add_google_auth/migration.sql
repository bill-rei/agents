-- Migration: add_google_auth
-- Changes:
--   1. Add image and last_login_at columns to users
--   2. Make password_hash nullable
--   3. Replace Role enum (editor → approver, viewer → publisher)

-- Step 1: Add new nullable columns
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "image" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_login_at" TIMESTAMP(3);

-- Step 2: Make password_hash nullable
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;

-- Step 3: Rename enum — requires a round-trip through TEXT in Postgres
-- 3a. Drop the column default first (it references the enum type)
ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;

-- 3b. Cast column to TEXT
ALTER TABLE "users" ALTER COLUMN "role" TYPE TEXT;

-- 3c. Drop old enum
DROP TYPE "Role";

-- 3d. Create new enum
CREATE TYPE "Role" AS ENUM ('admin', 'approver', 'publisher');

-- 3e. Map old values to new
UPDATE "users" SET "role" = 'admin'     WHERE "role" = 'admin';
UPDATE "users" SET "role" = 'approver'  WHERE "role" = 'editor';
UPDATE "users" SET "role" = 'publisher' WHERE "role" = 'viewer';

-- 3f. Cast column back to new enum
ALTER TABLE "users" ALTER COLUMN "role" TYPE "Role" USING "role"::"Role";

-- 3g. Restore default
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'publisher'::"Role";
