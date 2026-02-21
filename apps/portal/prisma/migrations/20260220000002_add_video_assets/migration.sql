-- CreateTable
CREATE TABLE "video_assets" (
    "id" TEXT NOT NULL,
    "artifact_id" TEXT NOT NULL,
    "agent_job_id" TEXT,
    "brand" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "aspect_ratio" TEXT NOT NULL,
    "duration_seconds" INTEGER NOT NULL,
    "storage_path" TEXT NOT NULL,
    "wp_url" TEXT,
    "wp_media_id" INTEGER,
    "wp_site" TEXT,
    "xai_job_id" TEXT,
    "mime_type" TEXT NOT NULL DEFAULT 'video/mp4',
    "meta" JSONB NOT NULL DEFAULT '{}',
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "video_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "video_assets_artifact_id_idx" ON "video_assets"("artifact_id");

-- AddForeignKey
ALTER TABLE "video_assets" ADD CONSTRAINT "video_assets_artifact_id_fkey" FOREIGN KEY ("artifact_id") REFERENCES "artifacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_assets" ADD CONSTRAINT "video_assets_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
