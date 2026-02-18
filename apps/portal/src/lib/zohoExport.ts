import JSZip from "jszip";

export function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function formatZohoDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

export function formatZohoTime(d: Date): string {
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${String(hours).padStart(2, "0")}:${minutes} ${ampm}`;
}

const CSV_HEADER = [
  "Date", "Time", "Message", "Link URL",
  ...Array.from({ length: 10 }, (_, i) => `Image URL ${i + 1}`),
].map(csvEscape).join(",");

export interface ZohoRow {
  date: string;
  time: string;
  message: string;
  linkUrl: string;
  imageUrls: string[];
}

export function buildCsvContent(rows: ZohoRow[]): string {
  const lines = [CSV_HEADER];
  for (const row of rows) {
    const images = [...row.imageUrls];
    while (images.length < 10) images.push("");
    const fields = [row.date, row.time, row.message, row.linkUrl, ...images];
    lines.push(fields.map(csvEscape).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}

export async function buildZipBuffer(
  csvFiles: { filename: string; content: string }[]
): Promise<Buffer> {
  const zip = new JSZip();
  for (const f of csvFiles) {
    zip.file(f.filename, f.content);
  }
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }) as Promise<Buffer>;
}
