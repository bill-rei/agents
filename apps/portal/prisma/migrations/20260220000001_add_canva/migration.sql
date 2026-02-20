-- Migration: add_canva
-- Adds: integrations, agent_jobs, canva_assets tables

-- integrations: stores OAuth tokens per provider (one row per provider)
CREATE TABLE "integrations" (
    "id"                    TEXT         NOT NULL,
    "provider"              TEXT         NOT NULL,
    "access_token"          TEXT         NOT NULL,
    "refresh_token"         TEXT,
    "expires_at"            TIMESTAMP(3),
    "connected_by_user_id"  TEXT         NOT NULL,
    "scopes"                TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
    "meta"                  JSONB        NOT NULL DEFAULT '{}',
    "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "integrations_provider_key" ON "integrations"("provider");

ALTER TABLE "integrations"
    ADD CONSTRAINT "integrations_connected_by_user_id_fkey"
    FOREIGN KEY ("connected_by_user_id")
    REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- agent_jobs: generic job tracking for async agent operations
CREATE TABLE "agent_jobs" (
    "id"                    TEXT         NOT NULL,
    "type"                  TEXT         NOT NULL,
    "status"                TEXT         NOT NULL DEFAULT 'pending',
    "input"                 JSONB        NOT NULL DEFAULT '{}',
    "output"                JSONB        NOT NULL DEFAULT '{}',
    "error"                 TEXT,
    "created_by_user_id"    TEXT         NOT NULL,
    "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "agent_jobs_type_status_idx" ON "agent_jobs"("type", "status");

ALTER TABLE "agent_jobs"
    ADD CONSTRAINT "agent_jobs_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id")
    REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- canva_assets: Canva-generated media attached to artifacts + stored in WP
CREATE TABLE "canva_assets" (
    "id"                    TEXT         NOT NULL,
    "artifact_id"           TEXT         NOT NULL,
    "agent_job_id"          TEXT,
    "type"                  TEXT         NOT NULL DEFAULT 'image',
    "provider"              TEXT         NOT NULL DEFAULT 'canva',
    "wp_site"               TEXT         NOT NULL,
    "wp_media_id"           INTEGER      NOT NULL,
    "wp_url"                TEXT         NOT NULL,
    "meta"                  JSONB        NOT NULL DEFAULT '{}',
    "created_by_user_id"    TEXT         NOT NULL,
    "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "canva_assets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "canva_assets_artifact_id_idx" ON "canva_assets"("artifact_id");

ALTER TABLE "canva_assets"
    ADD CONSTRAINT "canva_assets_artifact_id_fkey"
    FOREIGN KEY ("artifact_id")
    REFERENCES "artifacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "canva_assets"
    ADD CONSTRAINT "canva_assets_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id")
    REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
