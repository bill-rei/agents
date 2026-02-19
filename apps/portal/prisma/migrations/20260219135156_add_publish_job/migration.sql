-- CreateEnum
CREATE TYPE "PublishJobStatus" AS ENUM ('pending', 'running', 'partial', 'completed', 'failed');

-- CreateTable
CREATE TABLE "publish_jobs" (
    "id" TEXT NOT NULL,
    "artifact_id" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "selected_channels" TEXT[],
    "direct_channels" TEXT[],
    "assist_channels" TEXT[],
    "status" "PublishJobStatus" NOT NULL DEFAULT 'pending',
    "channel_results" JSONB NOT NULL DEFAULT '{}',
    "assist_pack_path" TEXT,
    "dry_run" BOOLEAN NOT NULL DEFAULT false,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "publish_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "publish_jobs_artifact_id_idx" ON "publish_jobs"("artifact_id");

-- AddForeignKey
ALTER TABLE "publish_jobs" ADD CONSTRAINT "publish_jobs_artifact_id_fkey" FOREIGN KEY ("artifact_id") REFERENCES "artifacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publish_jobs" ADD CONSTRAINT "publish_jobs_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
