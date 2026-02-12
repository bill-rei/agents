import 'dotenv/config';
import fetch from 'node-fetch';
import fs from 'fs/promises';

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function basicAuthHeader(username, appPassword) {
  const token = Buffer.from(`${username}:${appPassword}`).toString('base64');
  return `Basic ${token}`;
}

async function getPageIdBySlug(baseUrl, authHeader, slug) {
  const url = `${baseUrl}/wp-json/wp/v2/pages?slug=${encodeURIComponent(slug)}`;
  const res = await fetch(url, {
    headers: { Authorization: authHeader, Accept: 'application/json' },
  });

  if (!res.ok) throw new Error(`Failed to find slug "${slug}"`);

  const pages = await res.json();
  if (!pages.length) throw new Error(`No page found with slug "${slug}"`);

  return pages[0].id;
}

async function main() {
  const baseUrl = required('WP_BASE_URL').replace(/\/$/, '');
  const username = required('WP_USERNAME');
  const appPassword = required('WP_APP_PASSWORD');
  const defaultStatus = process.env.WP_STATUS || 'draft';

  const slug = process.argv[2];
  const inputPath = process.argv[3] || 'page.json';

  if (!slug) {
    console.error('Usage: node push-page.mjs <page-slug> <json-file>');
    process.exit(1);
  }

  const authHeader = basicAuthHeader(username, appPassword);

  const pageId = await getPageIdBySlug(baseUrl, authHeader, slug);

  const raw = await fs.readFile(inputPath, 'utf8');
  const payloadIn = JSON.parse(raw);

  if (!payloadIn.content) {
    throw new Error(`Input JSON must include "content"`);
  }

  const payload = {
    ...(payloadIn.title ? { title: payloadIn.title } : {}),
    content: payloadIn.content,
    status: payloadIn.status || defaultStatus,
  };

  const updateUrl = `${baseUrl}/wp-json/wp/v2/pages/${pageId}`;

  const res = await fetch(updateUrl, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error('❌ Update failed:', data);
    process.exit(1);
  }

  console.log('✅ Updated successfully');
  console.log('Page ID:', pageId);
  console.log('Preview:', data.link);
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
