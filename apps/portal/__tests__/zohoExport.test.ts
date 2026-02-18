import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

// Import using relative paths since we're outside the @/ alias scope
import { csvEscape, formatZohoDate, formatZohoTime, buildCsvContent } from "../src/lib/zohoExport";
import { isLlifBrand, ENABLED_CHANNEL_KEYS, ZOHO_CHANNELS } from "../src/lib/zohoSocialConfig";

// ── Brand boundary ──

describe("isLlifBrand", () => {
  it("returns true for 'LLIF'", () => {
    assert.ok(isLlifBrand("LLIF"));
  });

  it("returns true for 'llif' (case-insensitive)", () => {
    assert.ok(isLlifBrand("llif"));
  });

  it("returns false for 'BestLife'", () => {
    assert.ok(!isLlifBrand("BestLife"));
  });

  it("returns false for null", () => {
    assert.ok(!isLlifBrand(null));
  });

  it("returns false for undefined", () => {
    assert.ok(!isLlifBrand(undefined));
  });

  it("returns false for empty string", () => {
    assert.ok(!isLlifBrand(""));
  });
});

// ── Channel validation ──

describe("channel validation", () => {
  it("has exactly 7 enabled channels", () => {
    assert.strictEqual(ENABLED_CHANNEL_KEYS.length, 7);
  });

  it("includes expected enabled channels", () => {
    assert.ok(ENABLED_CHANNEL_KEYS.includes("facebook_page"));
    assert.ok(ENABLED_CHANNEL_KEYS.includes("x_profile"));
    assert.ok(ENABLED_CHANNEL_KEYS.includes("linkedin_company_page"));
    assert.ok(ENABLED_CHANNEL_KEYS.includes("instagram_profile"));
    assert.ok(ENABLED_CHANNEL_KEYS.includes("youtube_channel"));
    assert.ok(ENABLED_CHANNEL_KEYS.includes("google_business_profile"));
    assert.ok(ENABLED_CHANNEL_KEYS.includes("bluesky_profile"));
  });

  it("excludes disabled channels from enabled list", () => {
    assert.ok(!ENABLED_CHANNEL_KEYS.includes("pinterest_profile"));
    assert.ok(!ENABLED_CHANNEL_KEYS.includes("tiktok_business_profile"));
    assert.ok(!ENABLED_CHANNEL_KEYS.includes("threads_profile"));
  });

  it("has 3 disabled channels in full list", () => {
    const disabled = ZOHO_CHANNELS.filter((c) => c.status === "disabled");
    assert.strictEqual(disabled.length, 3);
  });
});

// ── CSV formatting: date/time ──

describe("formatZohoDate", () => {
  it("formats as MM/DD/YYYY", () => {
    const d = new Date(2026, 2, 5); // March 5, 2026 (month is 0-indexed)
    assert.strictEqual(formatZohoDate(d), "03/05/2026");
  });

  it("pads single-digit month and day", () => {
    const d = new Date(2026, 0, 7); // Jan 7, 2026
    assert.strictEqual(formatZohoDate(d), "01/07/2026");
  });
});

describe("formatZohoTime", () => {
  it("formats PM time correctly", () => {
    const d = new Date(2026, 0, 1, 14, 30); // 2:30 PM
    assert.strictEqual(formatZohoTime(d), "02:30 PM");
  });

  it("formats AM time correctly", () => {
    const d = new Date(2026, 0, 1, 9, 5); // 9:05 AM
    assert.strictEqual(formatZohoTime(d), "09:05 AM");
  });

  it("formats 12 noon as 12:00 PM", () => {
    const d = new Date(2026, 0, 1, 12, 0);
    assert.strictEqual(formatZohoTime(d), "12:00 PM");
  });

  it("formats midnight as 12:00 AM", () => {
    const d = new Date(2026, 0, 1, 0, 0);
    assert.strictEqual(formatZohoTime(d), "12:00 AM");
  });
});

// ── CSV escaping ──

describe("csvEscape", () => {
  it("returns plain string when no special chars", () => {
    assert.strictEqual(csvEscape("hello"), "hello");
  });

  it("wraps fields containing commas in quotes", () => {
    assert.strictEqual(csvEscape("hello, world"), '"hello, world"');
  });

  it("escapes double quotes by doubling them", () => {
    assert.strictEqual(csvEscape('say "hi"'), '"say ""hi"""');
  });

  it("wraps fields containing newlines", () => {
    assert.strictEqual(csvEscape("line1\nline2"), '"line1\nline2"');
  });
});

// ── CSV content building ──

describe("buildCsvContent", () => {
  it("produces header + data rows with CRLF", () => {
    const csv = buildCsvContent([
      {
        date: "03/05/2026",
        time: "10:30 AM",
        message: "Test post",
        linkUrl: "https://example.com",
        imageUrls: ["https://img1.com/a.jpg"],
      },
    ]);
    const lines = csv.trim().split("\r\n");
    assert.strictEqual(lines.length, 2);
    assert.ok(lines[0].startsWith("Date,Time,Message"));
    assert.ok(lines[0].includes("Image URL 10"));
  });

  it("pads image URLs to 10 columns", () => {
    const csv = buildCsvContent([
      { date: "01/01/2026", time: "09:00 AM", message: "Hi", linkUrl: "", imageUrls: [] },
    ]);
    const dataRow = csv.trim().split("\r\n")[1];
    const fields = dataRow.split(",");
    // 4 base fields + 10 image columns = 14
    assert.strictEqual(fields.length, 14);
  });

  it("handles empty rows array (header only)", () => {
    const csv = buildCsvContent([]);
    const lines = csv.trim().split("\r\n");
    assert.strictEqual(lines.length, 1);
    assert.ok(lines[0].startsWith("Date,Time,Message"));
  });

  it("escapes commas in message field", () => {
    const csv = buildCsvContent([
      { date: "01/01/2026", time: "09:00 AM", message: "Hello, world!", linkUrl: "", imageUrls: [] },
    ]);
    assert.ok(csv.includes('"Hello, world!"'));
  });
});

// ── ContentItem JSONL store ──

describe("contentItemStore", () => {
  const testDir = path.join(process.cwd(), "data");
  const testFile = path.join(testDir, "content-items.jsonl");
  let originalContent: string | null = null;

  before(() => {
    // Back up existing file if present
    if (fs.existsSync(testFile)) {
      originalContent = fs.readFileSync(testFile, "utf-8");
    }
    // Clear for test
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    fs.writeFileSync(testFile, "", "utf-8");
  });

  after(() => {
    // Restore original file
    if (originalContent !== null) {
      fs.writeFileSync(testFile, originalContent, "utf-8");
    } else if (fs.existsSync(testFile)) {
      fs.unlinkSync(testFile);
    }
  });

  it("creates a content item and reads it back by id", async () => {
    const { createContentItem, getContentItemById } = await import("../src/lib/contentItemStore");

    const item = createContentItem({
      brand: "LLIF",
      socialCaption: "Check out this article!",
      canonicalUrl: "https://example.com/article",
      imageUrls: ["https://example.com/img1.jpg"],
    });

    assert.ok(item.id);
    assert.strictEqual(item.brand, "LLIF");
    assert.strictEqual(item.socialCaption, "Check out this article!");
    assert.ok(item.createdAt);

    const found = getContentItemById(item.id);
    assert.ok(found);
    assert.strictEqual(found!.id, item.id);
    assert.strictEqual(found!.brand, "LLIF");
    assert.deepStrictEqual(found!.imageUrls, ["https://example.com/img1.jpg"]);
  });

  it("returns null for unknown id", async () => {
    const { getContentItemById } = await import("../src/lib/contentItemStore");
    const found = getContentItemById("nonexistent-id");
    assert.strictEqual(found, null);
  });

  it("last-match-wins for duplicate ids", async () => {
    const { getContentItemById } = await import("../src/lib/contentItemStore");
    const id = "test-dup-id";
    fs.appendFileSync(testFile, JSON.stringify({ id, brand: "LLIF", socialCaption: "first", imageUrls: [], createdAt: new Date().toISOString() }) + "\n");
    fs.appendFileSync(testFile, JSON.stringify({ id, brand: "LLIF", socialCaption: "second", imageUrls: [], createdAt: new Date().toISOString() }) + "\n");

    const found = getContentItemById(id);
    assert.ok(found);
    assert.strictEqual(found!.socialCaption, "second");
  });
});
