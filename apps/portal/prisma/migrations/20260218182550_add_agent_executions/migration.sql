-- CreateEnum
CREATE TYPE "AgentExecStatus" AS ENUM ('pending', 'running', 'completed', 'failed');

-- CreateTable
CREATE TABLE "agent_executions" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "agent_key" TEXT NOT NULL,
    "status" "AgentExecStatus" NOT NULL DEFAULT 'pending',
    "inputs" JSONB NOT NULL DEFAULT '{}',
    "inputFiles" JSONB NOT NULL DEFAULT '[]',
    "output" TEXT NOT NULL DEFAULT '',
    "outputMeta" JSONB NOT NULL DEFAULT '{}',
    "error" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "duration_ms" INTEGER,
    "parent_exec_id" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_executions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_executions_run_id_idx" ON "agent_executions"("run_id");

-- CreateIndex
CREATE INDEX "agent_executions_agent_key_idx" ON "agent_executions"("agent_key");

-- CreateIndex
CREATE INDEX "agent_executions_parent_exec_id_idx" ON "agent_executions"("parent_exec_id");

-- AddForeignKey
ALTER TABLE "agent_executions" ADD CONSTRAINT "agent_executions_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_executions" ADD CONSTRAINT "agent_executions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_executions" ADD CONSTRAINT "agent_executions_parent_exec_id_fkey" FOREIGN KEY ("parent_exec_id") REFERENCES "agent_executions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
