export function CraftedBy() {
  return (
    <a
      href="https://matthewblode.com"
      target="_blank"
      rel="author noreferrer"
      className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <span>Crafted by</span>
      <img
        src="https://matthewblode.com/avatar-sm.png"
        alt="Matthew Blode"
        width={20}
        height={20}
        loading="lazy"
        className="rounded-full"
      />
      <span>Matthew Blode</span>
    </a>
  );
}
