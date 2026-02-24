-- CreateTable: social_approvals
-- Per-run, per-channel social preview approval state for Phase 3.

CREATE TABLE "social_approvals" (
    "id"        TEXT         NOT NULL,
    "run_id"    TEXT         NOT NULL,
    "brand"     TEXT         NOT NULL DEFAULT '',
    "overall"   TEXT         NOT NULL DEFAULT 'pending',
    "channels"  JSONB        NOT NULL DEFAULT '{}',
    "history"   JSONB        NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_approvals_pkey" PRIMARY KEY ("id")
);

-- Unique: one SocialApproval per Run
CREATE UNIQUE INDEX "social_approvals_run_id_key" ON "social_approvals"("run_id");

-- FK: social_approvals -> runs
ALTER TABLE "social_approvals" ADD CONSTRAINT "social_approvals_run_id_fkey"
    FOREIGN KEY ("run_id") REFERENCES "runs"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
