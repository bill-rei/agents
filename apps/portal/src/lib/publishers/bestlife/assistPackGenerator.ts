/**
 * Best Life – Publish Assist Pack Generator
 *
 * Generates a structured JSON payload + human-readable Markdown summary
 * for channels that don't support direct API publish in Phase 1.
 */

import fs from "fs";
import path from "path";
import { getAllChannels, truncateForChannel } from "./channelRegistry";
import type { SocialArtifact } from "./directPublisher";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AssistPackEntry {
  channelKey: string;
  channelLabel: string;
  profileUrl: string;
  postText: string;
  characterCount: number;
  charLimit: number;
  withinLimit: boolean;
  hashtags: string[];
  mediaFilenames: string[];  // filenames only (not full paths) for manual upload
  mediaUrls: string[];       // full URLs if available
  scheduleSuggestion: string | null;
  postingInstructions: string;
  notes: string;
}

export interface AssistPack {
  version: "1.0";
  generatedAt: string;
  brand: "bestlife";
  artifactId: string;
  artifactTitle: string;
  channels: AssistPackEntry[];
}

// ── Human-readable posting instructions per channel ───────────────────────────

const POSTING_INSTRUCTIONS: Record<string, string> = {
  instagram_profile:
    "1. Open Instagram (mobile app or Creator Studio).\n" +
    "2. Tap '+' → Post.\n" +
    "3. Select the image/video from your device.\n" +
    "4. Paste the post copy into the caption field.\n" +
    "5. Add hashtags at the end of the caption.\n" +
    "6. Tag location if applicable, then tap Share.",

  threads_profile:
    "1. Open Threads app or threads.net.\n" +
    "2. Tap the compose icon.\n" +
    "3. Paste the post copy.\n" +
    "4. Attach any images by tapping the image icon.\n" +
    "5. Tap Post (or schedule via Meta Business Suite if available).",

  bluesky_profile:
    "1. Go to bsky.app and log into @getbestlifeapp.bsky.social.\n" +
    "2. Click 'New Post'.\n" +
    "3. Paste the post copy (max 300 chars — copy is pre-trimmed).\n" +
    "4. Attach images via the image icon (up to 4).\n" +
    "5. Click Post.",

  reddit_community:
    "1. Go to reddit.com/r/bestlifeapp and log in with the moderator account.\n" +
    "2. Click 'Create Post'.\n" +
    "3. Choose 'Text' or 'Link' post type.\n" +
    "4. Paste the post title (use the article title) and body copy.\n" +
    "5. Add appropriate post flair, then click Post.",

  youtube_channel:
    "1. Log into YouTube Studio at studio.youtube.com.\n" +
    "2. For a Community Post: click 'Create' → 'Create post'.\n" +
    "3. Paste the post copy into the text field.\n" +
    "4. Attach an image if desired.\n" +
    "5. For a video: click 'Upload videos' and follow the upload wizard.\n" +
    "6. Set visibility to Public and publish.",

  tiktok_business_profile:
    "1. Log into TikTok Studio at studio.tiktok.com.\n" +
    "2. Click 'Upload' and select your video file.\n" +
    "3. Add the post copy as the caption (max 2200 chars).\n" +
    "4. Add hashtags at the end of the caption.\n" +
    "5. Set privacy to Everyone, then click Post.",
};

function getPostingInstructions(channelKey: string): string {
  return (
    POSTING_INSTRUCTIONS[channelKey] ||
    `1. Log into the platform using the @getbestlifeapp account.\n2. Create a new post.\n3. Paste the provided copy.\n4. Add any media files.\n5. Publish or schedule.`
  );
}

// ── Builder ───────────────────────────────────────────────────────────────────

export function buildAssistPack(
  artifact: SocialArtifact,
  assistChannelKeys: string[],
  scheduledAt?: string
): AssistPack {
  const allChannels = getAllChannels();

  const channels: AssistPackEntry[] = assistChannelKeys.map((key) => {
    const config = allChannels.find((c) => c.key === key);
    if (!config) throw new Error(`Unknown channel key: ${key}`);

    const postText = truncateForChannel(artifact.body, key);
    const hashtagStr =
      artifact.hashtags.length > 0
        ? artifact.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")
        : "";

    // Combine body + hashtags, re-truncate if needed
    const combined = hashtagStr
      ? `${postText}\n\n${hashtagStr}`
      : postText;
    const finalText =
      combined.length <= config.charLimit
        ? combined
        : truncateForChannel(combined, key);

    const mediaFilenames = artifact.mediaUrls.map((u) => {
      try {
        return decodeURIComponent(new URL(u).pathname.split("/").pop() || u);
      } catch {
        return u;
      }
    });

    return {
      channelKey: key,
      channelLabel: config.label,
      profileUrl: config.profileUrl,
      postText: finalText,
      characterCount: finalText.length,
      charLimit: config.charLimit,
      withinLimit: finalText.length <= config.charLimit,
      hashtags: artifact.hashtags,
      mediaFilenames,
      mediaUrls: artifact.mediaUrls,
      scheduleSuggestion: scheduledAt || null,
      postingInstructions: getPostingInstructions(key),
      notes: config.notes || "",
    };
  });

  return {
    version: "1.0",
    generatedAt: new Date().toISOString(),
    brand: "bestlife",
    artifactId: artifact.id,
    artifactTitle: artifact.title,
    channels,
  };
}

/** Render a human-readable Markdown summary of the assist pack. */
export function buildAssistPackMarkdown(pack: AssistPack): string {
  const lines: string[] = [
    `# Best Life – Publish Assist Pack`,
    ``,
    `**Generated:** ${pack.generatedAt}`,
    `**Artifact:** ${pack.artifactTitle} (\`${pack.artifactId}\`)`,
    ``,
    `---`,
    ``,
  ];

  for (const ch of pack.channels) {
    lines.push(`## ${ch.channelLabel}`);
    lines.push(``);
    lines.push(`**Profile:** ${ch.profileUrl}`);
    if (ch.scheduleSuggestion) {
      lines.push(`**Suggested schedule:** ${ch.scheduleSuggestion}`);
    }
    lines.push(`**Character count:** ${ch.characterCount} / ${ch.charLimit} ${ch.withinLimit ? "✓" : "⚠ OVER LIMIT"}`);
    lines.push(``);
    lines.push(`### Post Copy`);
    lines.push(``);
    lines.push("```");
    lines.push(ch.postText);
    lines.push("```");
    lines.push(``);
    if (ch.hashtags.length > 0) {
      lines.push(`**Hashtags:** ${ch.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}`);
      lines.push(``);
    }
    if (ch.mediaFilenames.length > 0) {
      lines.push(`**Media files to upload:**`);
      for (const f of ch.mediaFilenames) {
        lines.push(`- ${f}`);
      }
      lines.push(``);
    }
    lines.push(`### Posting Instructions`);
    lines.push(``);
    lines.push(ch.postingInstructions);
    lines.push(``);
    if (ch.notes) {
      lines.push(`> **Note:** ${ch.notes}`);
      lines.push(``);
    }
    lines.push(`---`);
    lines.push(``);
  }

  return lines.join("\n");
}

// ── File I/O ──────────────────────────────────────────────────────────────────

export function writeAssistPack(
  pack: AssistPack,
  projectSlug: string,
  jobId: string,
  uploadDir: string
): { jsonPath: string; mdPath: string; storagePath: string; mdStoragePath: string } {
  const dir = path.join(uploadDir, projectSlug, "_publish_jobs");
  fs.mkdirSync(dir, { recursive: true });

  const jsonPath = path.join(dir, `${jobId}.json`);
  const mdPath = path.join(dir, `${jobId}.md`);

  fs.writeFileSync(jsonPath, JSON.stringify(pack, null, 2), "utf8");
  fs.writeFileSync(mdPath, buildAssistPackMarkdown(pack), "utf8");

  return {
    jsonPath,
    mdPath,
    storagePath: path.join(projectSlug, "_publish_jobs", `${jobId}.json`),
    mdStoragePath: path.join(projectSlug, "_publish_jobs", `${jobId}.md`),
  };
}
