-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "description" TEXT;

-- CreateTable
CREATE TABLE "artifact_assets" (
    "id" TEXT NOT NULL,
    "artifact_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "placement" TEXT NOT NULL DEFAULT 'below',
    "alignment" TEXT,
    "size" TEXT,
    "intent" TEXT NOT NULL DEFAULT 'section',
    "order" INTEGER NOT NULL DEFAULT 0,
    "alt" TEXT NOT NULL DEFAULT '',
    "caption" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "artifact_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "artifact_assets_artifact_id_idx" ON "artifact_assets"("artifact_id");

-- CreateIndex
CREATE INDEX "artifact_assets_asset_id_idx" ON "artifact_assets"("asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "artifact_assets_asset_id_artifact_id_key" ON "artifact_assets"("asset_id", "artifact_id");

-- AddForeignKey
ALTER TABLE "artifact_assets" ADD CONSTRAINT "artifact_assets_artifact_id_fkey" FOREIGN KEY ("artifact_id") REFERENCES "artifacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artifact_assets" ADD CONSTRAINT "artifact_assets_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
