export type ZohoChannelStatus = "enabled" | "disabled" | "hidden";

export interface ZohoChannel {
  key: string;
  label: string;
  status: ZohoChannelStatus;
}

export const ZOHO_CHANNELS: ZohoChannel[] = [
  { key: "facebook_page",           label: "Facebook Page",           status: "enabled" },
  { key: "x_profile",               label: "X (Twitter)",             status: "enabled" },
  { key: "linkedin_company_page",   label: "LinkedIn Company Page",   status: "enabled" },
  { key: "instagram_profile",       label: "Instagram",               status: "enabled" },
  { key: "youtube_channel",         label: "YouTube",                 status: "enabled" },
  { key: "google_business_profile", label: "Google Business Profile", status: "enabled" },
  { key: "bluesky_profile",         label: "Bluesky",                 status: "enabled" },
  { key: "pinterest_profile",       label: "Pinterest",               status: "disabled" },
  { key: "tiktok_business_profile", label: "TikTok Business",         status: "disabled" },
  { key: "threads_profile",         label: "Threads",                 status: "disabled" },
  // Not connected (hidden, not rendered):
  // { key: "linkedin_profile",     label: "LinkedIn Profile",        status: "hidden" },
  // { key: "mastodon_profile",     label: "Mastodon",                status: "hidden" },
];

export const ENABLED_CHANNEL_KEYS = ZOHO_CHANNELS
  .filter((c) => c.status === "enabled")
  .map((c) => c.key);

export function isLlifBrand(brand: string | null | undefined): boolean {
  if (!brand) return false;
  return brand.toLowerCase() === "llif";
}
