-- CreateTable
CREATE TABLE "channel_connections" (
    "id" TEXT NOT NULL,
    "brand_mode" "UcsBrandMode" NOT NULL,
    "platform" TEXT NOT NULL,
    "external_account_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "access_token_ciphertext" TEXT NOT NULL,
    "refresh_token_ciphertext" TEXT,
    "expires_at" TIMESTAMP(3),
    "scopes_json" JSONB NOT NULL DEFAULT '[]',
    "connected_by_user_id" TEXT NOT NULL,
    "connected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ucs_publish_jobs" (
    "id" TEXT NOT NULL,
    "brand_mode" "UcsBrandMode" NOT NULL,
    "ucs_message_id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "scheduled_for" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ucs_publish_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ucs_job_events" (
    "id" TEXT NOT NULL,
    "publish_job_id" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "meta_json" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "ucs_job_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "channel_connections_brand_mode_idx" ON "channel_connections"("brand_mode");

-- CreateIndex
CREATE UNIQUE INDEX "channel_connections_brand_mode_platform_key" ON "channel_connections"("brand_mode", "platform");

-- CreateIndex
CREATE INDEX "ucs_publish_jobs_ucs_message_id_idx" ON "ucs_publish_jobs"("ucs_message_id");

-- CreateIndex
CREATE INDEX "ucs_publish_jobs_status_idx" ON "ucs_publish_jobs"("status");

-- CreateIndex
CREATE INDEX "ucs_job_events_publish_job_id_idx" ON "ucs_job_events"("publish_job_id");

-- AddForeignKey
ALTER TABLE "channel_connections" ADD CONSTRAINT "channel_connections_connected_by_user_id_fkey" FOREIGN KEY ("connected_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ucs_publish_jobs" ADD CONSTRAINT "ucs_publish_jobs_ucs_message_id_fkey" FOREIGN KEY ("ucs_message_id") REFERENCES "ucs_messages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ucs_publish_jobs" ADD CONSTRAINT "ucs_publish_jobs_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "channel_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ucs_job_events" ADD CONSTRAINT "ucs_job_events_publish_job_id_fkey" FOREIGN KEY ("publish_job_id") REFERENCES "ucs_publish_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
