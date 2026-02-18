-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "target_registry_keys" TEXT[] DEFAULT ARRAY[]::TEXT[];
