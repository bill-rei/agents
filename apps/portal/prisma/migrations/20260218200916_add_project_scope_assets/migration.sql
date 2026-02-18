-- DropForeignKey
ALTER TABLE "assets" DROP CONSTRAINT "assets_run_id_fkey";

-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "scope" TEXT NOT NULL DEFAULT 'run',
ALTER COLUMN "run_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "assets_project_id_scope_idx" ON "assets"("project_id", "scope");

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
