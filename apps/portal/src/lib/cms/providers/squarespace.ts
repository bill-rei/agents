/**
 * Squarespace CMS provider — stub only.
 *
 * TODO: Implement when Squarespace integration is ready.
 * Squarespace uses a private Content API (OAuth 2.0 required).
 * Relevant docs: https://developers.squarespace.com/content-api
 *
 * Required future work:
 *  1. OAuth 2.0 client credentials flow (client_id + client_secret)
 *  2. GET /api/1/content/pages endpoint (Squarespace Commerce API)
 *  3. Map response to CmsPage[] normalizing id, title, slug, url
 */

import type { CmsPage } from "../pageDiscovery";

export function listSquarespacePages(): Promise<CmsPage[]> {
  throw new Error(
    "Squarespace page discovery is not implemented yet. " +
      "TODO: add Squarespace OAuth + Content API integration."
  );
}
