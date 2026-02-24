-- CreateTable: run_steps
-- Per-step agent output storage with Markdown contract validation results.

CREATE TABLE "run_steps" (
    "id"                  TEXT         NOT NULL,
    "run_id"              TEXT         NOT NULL,
    "step"                TEXT         NOT NULL,
    "agent_execution_id"  TEXT,
    "status"              TEXT         NOT NULL DEFAULT 'pending',
    "markdown_output"     TEXT,
    "json_payload"        JSONB        NOT NULL DEFAULT '{}',
    "validation_errors"   TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
    "validation_warnings" TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
    "input_step_id"       TEXT,
    "hash"                TEXT,
    "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "run_steps_pkey" PRIMARY KEY ("id")
);

-- Unique: one RunStep per AgentExecution
CREATE UNIQUE INDEX "run_steps_agent_execution_id_key" ON "run_steps"("agent_execution_id");

-- Indexes
CREATE INDEX "run_steps_run_id_idx"  ON "run_steps"("run_id");
CREATE INDEX "run_steps_step_idx"    ON "run_steps"("step");

-- FK: run_steps -> runs
ALTER TABLE "run_steps" ADD CONSTRAINT "run_steps_run_id_fkey"
    FOREIGN KEY ("run_id") REFERENCES "runs"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- FK: run_steps -> agent_executions (optional 1:1)
ALTER TABLE "run_steps" ADD CONSTRAINT "run_steps_agent_execution_id_fkey"
    FOREIGN KEY ("agent_execution_id") REFERENCES "agent_executions"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- FK: run_steps -> run_steps (self-referential chain)
ALTER TABLE "run_steps" ADD CONSTRAINT "run_steps_input_step_id_fkey"
    FOREIGN KEY ("input_step_id") REFERENCES "run_steps"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
