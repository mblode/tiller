// Shared pixel-arcade UI primitives for the game's 2D surfaces (menu, level
// select, overlays, HUD). Keeps the "weathered sea-chart meets handheld arcade"
// look in one place; the visual tokens themselves live in app/globals.css
// (.pixel-panel / .pixel-inset / .chart-grid / .btn-brass).

import { StarIcon } from "blode-icons-react";
import type { ReactNode } from "react";

/** Translucent beveled HUD chip — shared class list for in-game status pills.
 *  Opaque enough to stay legible over the busy dithered sea. */
export const CHIP =
  "rounded-lg border border-white/15 bg-[#08303d]/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_2px_6px_rgba(0,0,0,0.35)] backdrop-blur-md";

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
export function Stars({
  count,
  total = 3,
  className = "size-4",
}: {
  count: number;
  total?: number;
  className?: string;
}) {
  return (
    <span className="inline-flex items-center gap-0.5 align-middle">
      {Array.from({ length: total }, (_, i) => (
        <StarIcon
          aria-hidden
          className={
            i < count
              ? `${className} fill-amber-300 text-amber-300 drop-shadow-[0_1px_0_rgba(0,0,0,0.4)]`
              : `${className} fill-sky-100/10 text-sky-100/15`
          }
          key={`star-${i}`}
        />
      ))}
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
