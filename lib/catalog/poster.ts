/**
 * Poster art at the size we actually render it.
 *
 * OMDb hands back Amazon media URLs pinned to a thumbnail width (…_UX380_…),
 * which is fine in a rail but visibly soft blown up to a full-height hero
 * panel. Those URLs carry an image transform right before the extension, so
 * asking for a bigger render is a URL rewrite — no proxy, no re-fetch of
 * metadata, and it degrades to the original string for any other host.
 */

const AMAZON_MEDIA = "m.media-amazon.com"

/** Rewrite an Amazon media poster URL to render at `width` px. */
export function posterAtWidth(url: string, width = 900): string {
  if (!url || !url.includes(AMAZON_MEDIA)) return url
  // …/MV5B<id>._V1_QL75_UX380_CR0,1,380,562_.jpg → …/MV5B<id>._V1_SX900.jpg
  return url.replace(/\._V1_.*?\.(jpg|jpeg|png)$/i, `._V1_SX${width}.$1`)
}
