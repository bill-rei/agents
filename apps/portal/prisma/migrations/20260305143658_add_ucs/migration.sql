-- CreateEnum
CREATE TYPE "UcsBrandMode" AS ENUM ('LLIF', 'BestLife');

-- CreateEnum
CREATE TYPE "UcsStatus" AS ENUM ('draft', 'in_review', 'approved');

-- AlterTable
ALTER TABLE "agent_jobs" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "integrations" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "social_approvals" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateTable
CREATE TABLE "ucs_messages" (
    "id" TEXT NOT NULL,
    "brand_mode" "UcsBrandMode" NOT NULL,
    "title" TEXT NOT NULL,
    "canonical_json" JSONB NOT NULL,
    "overrides_json" JSONB NOT NULL DEFAULT '{}',
    "renders_json" JSONB NOT NULL DEFAULT '{}',
    "status" "UcsStatus" NOT NULL DEFAULT 'draft',
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ucs_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ucs_messages_brand_mode_idx" ON "ucs_messages"("brand_mode");

-- CreateIndex
CREATE INDEX "ucs_messages_status_idx" ON "ucs_messages"("status");

-- AddForeignKey
ALTER TABLE "ucs_messages" ADD CONSTRAINT "ucs_messages_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
