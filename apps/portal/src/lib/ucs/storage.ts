import { db } from "../db";
import type {
  UCSMessage,
  UCSCanonical,
  UCSOverrides,
  UCSBrandMode,
  UCSStatus,
  CreateUCSPayload,
  UpdateUCSPayload,
} from "./schema";

function mapRow(row: {
  id: string;
  brandMode: string;
  title: string;
  canonicalJson: unknown;
  overridesJson: unknown;
  rendersJson: unknown;
  status: string;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}): UCSMessage {
  return {
    id: row.id,
    brandMode: row.brandMode as UCSBrandMode,
    title: row.title,
    canonical: row.canonicalJson as UCSCanonical,
    overrides: (row.overridesJson ?? {}) as UCSOverrides,
    renders: (row.rendersJson ?? {}) as Record<string, string>,
    status: row.status as UCSStatus,
    createdById: row.createdById,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listUCSMessages(opts?: {
  createdById?: string;
  brandMode?: UCSBrandMode;
  status?: UCSStatus;
}): Promise<UCSMessage[]> {
  const rows = await db.ucsMessage.findMany({
    where: {
      ...(opts?.createdById ? { createdById: opts.createdById } : {}),
      ...(opts?.brandMode ? { brandMode: opts.brandMode as any } : {}),
      ...(opts?.status ? { status: opts.status as any } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(mapRow);
}

export async function getUCSMessage(id: string): Promise<UCSMessage | null> {
  const row = await db.ucsMessage.findUnique({ where: { id } });
  return row ? mapRow(row) : null;
}

export async function createUCSMessage(
  payload: CreateUCSPayload,
  createdById: string
): Promise<UCSMessage> {
  const row = await db.ucsMessage.create({
    data: {
      brandMode: payload.brandMode as any,
      title: payload.title,
      canonicalJson: payload.canonical as any,
      overridesJson: {},
      rendersJson: {},
      status: "draft" as any,
      createdById,
    },
  });
  return mapRow(row);
}

export async function updateUCSMessage(
  id: string,
  payload: UpdateUCSPayload
): Promise<UCSMessage | null> {
  const existing = await db.ucsMessage.findUnique({ where: { id } });
  if (!existing) return null;

  const updatedCanonical = payload.canonical
    ? { ...(existing.canonicalJson as object), ...payload.canonical }
    : existing.canonicalJson;

  const updatedOverrides = payload.overrides
    ? { ...(existing.overridesJson as object), ...payload.overrides }
    : existing.overridesJson;

  const row = await db.ucsMessage.update({
    where: { id },
    data: {
      ...(payload.title !== undefined ? { title: payload.title } : {}),
      ...(payload.canonical !== undefined ? { canonicalJson: updatedCanonical as any } : {}),
      ...(payload.overrides !== undefined ? { overridesJson: updatedOverrides as any } : {}),
      ...(payload.status !== undefined ? { status: payload.status as any } : {}),
    },
  });
  return mapRow(row);
}

export async function saveRenders(
  id: string,
  renders: Record<string, string>
): Promise<void> {
  await db.ucsMessage.update({
    where: { id },
    data: { rendersJson: renders as any },
  });
}
