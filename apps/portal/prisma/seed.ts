import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // 1. Admin user
  const passwordHash = await bcrypt.hash("admin123", 10);
  const admin = await prisma.user.upsert({
    where: { email: "admin@portal.local" },
    update: {},
    create: {
      email: "admin@portal.local",
      name: "Admin",
      passwordHash,
      role: "admin",
    },
  });
  console.log(`  User: ${admin.email} (${admin.role})`);

  // 2. Example workspaces
  const ws1 = await prisma.workspace.upsert({
    where: { slug: "brand-alpha" },
    update: {},
    create: { name: "Brand Alpha", slug: "brand-alpha" },
  });

  const ws2 = await prisma.workspace.upsert({
    where: { slug: "brand-beta" },
    update: {},
    create: { name: "Brand Beta", slug: "brand-beta" },
  });
  console.log(`  Workspaces: ${ws1.name}, ${ws2.name}`);

  // 3. Example project with target registry key
  const targetRegistryKey = process.env.SEED_REGISTRY_KEY || "llif-staging";
  const proj = await prisma.project.upsert({
    where: { workspaceId_slug: { workspaceId: ws1.id, slug: "website-refresh" } },
    update: {},
    create: {
      workspaceId: ws1.id,
      name: "Website Refresh",
      slug: "website-refresh",
      targetRegistryKey,
    },
  });
  console.log(`  Project: ${proj.name} (registry: ${proj.targetRegistryKey})`);

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
