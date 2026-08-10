/*
 * blode.co and blode.co/projects are this same origin behind a rewrite, so both
 * are internal links: same tab, and no rel="noopener noreferrer", which only
 * means something cross-origin. The projects link is the edge back to the hub,
 * without which this zone is a dead end for crawlers and readers. See
 * blode-co/apps/web/.claude/knowledge/zone-conventions.md.
 */
export function CraftedBy() {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2">
      <a
        href="https://blode.co"
        rel="author"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <span>Crafted by</span>
        {/* Decorative: the link's own text already reads "Matthew Blode", so
            any alt makes the accessible name say it twice. */}
        <img
          src="/tiller/avatar-sm.png"
          alt=""
          width={20}
          height={20}
          loading="lazy"
          className="rounded-full"
        />
        <span>Matthew Blode</span>
      </a>
    </span>
  );
}
