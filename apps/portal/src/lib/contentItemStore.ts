import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve(process.cwd(), "data");
const JSONL_PATH = path.join(DATA_DIR, "content-items.jsonl");

export interface ContentItem {
  id: string;
  brand: "LLIF" | "BestLife";
  socialCaption: string;
  canonicalUrl?: string;
  imageUrls: string[];
  createdAt: string;
}

export type ContentItemInput = Omit<ContentItem, "id" | "createdAt">;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function createContentItem(input: ContentItemInput): ContentItem {
  ensureDataDir();
  const item: ContentItem = {
    id: randomUUID(),
    brand: input.brand,
    socialCaption: input.socialCaption,
    canonicalUrl: input.canonicalUrl,
    imageUrls: input.imageUrls,
    createdAt: new Date().toISOString(),
  };
  fs.appendFileSync(JSONL_PATH, JSON.stringify(item) + "\n", "utf-8");
  return item;
}

export function getContentItemById(id: string): ContentItem | null {
  if (!fs.existsSync(JSONL_PATH)) return null;
  const lines = fs.readFileSync(JSONL_PATH, "utf-8").trim().split("\n").filter(Boolean);
  let match: ContentItem | null = null;
  for (const line of lines) {
    try {
      const item: ContentItem = JSON.parse(line);
      if (item.id === id) match = item;
    } catch {
      // skip malformed lines
    }
  }
  return match;
}

export function listContentItems(): ContentItem[] {
  if (!fs.existsSync(JSONL_PATH)) return [];
  const lines = fs.readFileSync(JSONL_PATH, "utf-8").trim().split("\n").filter(Boolean);
  const items: ContentItem[] = [];
  for (const line of lines) {
    try {
      items.push(JSON.parse(line));
    } catch {
      // skip malformed lines
    }
  }
  return items;
}
