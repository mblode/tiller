/**
 * Shared by `app/layout.tsx` (metadata) and `app/page.tsx` (JSON-LD), which
 * have to agree: Google reads a mismatch between the two as a markup error.
 *
 * They live here rather than as exports from `layout.tsx` because the App
 * Router type-checks a layout's exports against the fields it knows about.
 */
export const siteUrl = "https://blode.co/tiller";

export const siteTitle = "Tiller: learn to sail a dinghy";

export const siteDescription =
  "A tiny pixel-art sailing game. Learn the wind, the no-go zone, tacking and gybing by sailing a little dinghy.";
