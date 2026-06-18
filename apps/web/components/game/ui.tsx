// Shared pixel-arcade UI primitives for the game's 2D surfaces (menu, level
// select, overlays, HUD). Keeps the "weathered sea-chart meets handheld arcade"
// look in one place; the visual tokens themselves live in app/globals.css
// (.pixel-panel / .pixel-inset / .chart-grid / .btn-brass).

import type { ReactNode } from "react";

/** Translucent beveled HUD chip — shared class list for in-game status pills. */
export const CHIP =
  "rounded-lg border border-white/10 bg-[#08303d]/75 shadow-[inset_0_1px_0_rgba(255,255,255,0.07)] backdrop-blur-sm";

/** A raised arcade card — the body of the pause, result, and brief dialogs. */
export function PixelPanel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`pixel-panel rounded-2xl p-5 ${className}`}>{children}</div>
  );
}

/** Earned stars out of `total`; filled in brass, the rest dim. */
export function Stars({ count, total = 3 }: { count: number; total?: number }) {
  return (
    <span className="drop-shadow-[0_1px_0_rgba(0,0,0,0.4)]">
      <span className="text-amber-300">{"★".repeat(count)}</span>
      <span className="text-sky-100/15">{"★".repeat(total - count)}</span>
    </span>
  );
}

/** Chunky arcade button. One `primary` (brass) per surface; the rest secondary
 *  (beveled panel) or ghost (outline). 48px tall to clear the touch-target min. */
export function PixelButton({
  children,
  onClick,
  variant = "primary",
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
}) {
  let tone = "btn-brass";
  if (variant === "secondary") {
    tone =
      "pixel-panel text-sky-50 active:translate-y-px motion-reduce:active:translate-y-0";
  } else if (variant === "ghost") {
    tone =
      "border-2 border-white/10 text-sky-200 active:translate-y-px motion-reduce:active:translate-y-0";
  }
  return (
    <button
      className={`inline-flex h-12 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 disabled:opacity-50 motion-reduce:transition-none ${tone} ${className}`}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}
