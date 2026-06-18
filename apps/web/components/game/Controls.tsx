"use client";

import {
  AnchorIcon,
  ArrowLeftRightIcon,
  ArrowUpRightIcon,
} from "blode-icons-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { GameBridge } from "@/game/bridge";

const DEAD = 0.05;

export function Controls({
  bridge,
  optSheet,
  needCross,
}: {
  bridge: GameBridge;
  optSheet: number;
  needCross: boolean;
}) {
  const [tiller, setTiller] = useState(0);
  const [sheet, setSheet] = useState(0.5);
  const [hiking, setHiking] = useState(false);
  const [dragging, setDragging] = useState(false);
  const tillerTrack = useRef<HTMLDivElement>(null);
  const sheetTrack = useRef<HTMLDivElement>(null);

  // push state to the game
  useEffect(() => bridge.setInput({ tiller }), [tiller, bridge]);
  useEffect(() => bridge.setInput({ sheet }), [sheet, bridge]);
  useEffect(() => bridge.setInput({ hike: hiking }), [hiking, bridge]);

  // keyboard (desktop): ←/→ or A/D steer; ↑/↓ or W/S trim the sheet
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "arrowleft" || k === "a") {
        setTiller(-1);
      } else if (k === "arrowright" || k === "d") {
        setTiller(1);
      } else if (k === "arrowup" || k === "w") {
        setSheet((s) => Math.min(1, s + 0.08));
      } else if (k === "arrowdown" || k === "s") {
        setSheet((s) => Math.max(0, s - 0.08));
      } else if (k === "shift" || k === "h") {
        setHiking(true);
      } else if (k === "c") {
        if (!e.repeat) {
          bridge.requestCrossSide();
        }
      } else {
        return;
      }
      e.preventDefault();
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "arrowleft" || k === "a" || k === "arrowright" || k === "d") {
        setTiller(0);
      } else if (k === "shift" || k === "h") {
        setHiking(false);
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [bridge]);

  const onTillerMove = useCallback((clientX: number) => {
    const el = tillerTrack.current;
    if (!el) {
      return;
    }
    const r = el.getBoundingClientRect();
    const half = (r.width - 56) / 2;
    const norm = Math.max(
      -1,
      Math.min(1, (clientX - (r.left + r.width / 2)) / half)
    );
    const t =
      Math.abs(norm) < DEAD
        ? 0
        : Math.sign(norm) * ((Math.abs(norm) - DEAD) / (1 - DEAD));
    setTiller(t);
  }, []);

  const onSheetMove = useCallback((clientY: number) => {
    const el = sheetTrack.current;
    if (!el) {
      return;
    }
    const r = el.getBoundingClientRect();
    const s = Math.max(0, Math.min(1, (clientY - r.top) / r.height));
    setSheet(s);
  }, []);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-between gap-2 px-[max(0.5rem,env(safe-area-inset-left))] pt-3 pr-[max(0.5rem,env(safe-area-inset-right))] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {/* Tiller (inverted) */}
      <div className="pointer-events-auto min-w-0 flex-1">
        <div className="mb-1 flex justify-between gap-1 px-1 font-pixel text-[9px] text-sky-200/80">
          <span className="shrink-0 text-rose-300">◄ bow R</span>
          <span className="shrink-0">TILLER</span>
          <span className="shrink-0 text-emerald-300">bow L ►</span>
        </div>
        <div
          className="relative h-14 touch-none select-none rounded-full border-2 border-[#06222b]/70 bg-gradient-to-r from-rose-500/30 via-[#06222b]/85 to-emerald-500/30 shadow-[inset_0_2px_8px_rgba(0,0,0,0.55)]"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            setDragging(true);
            onTillerMove(e.clientX);
          }}
          onPointerMove={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
              onTillerMove(e.clientX);
            }
          }}
          onPointerUp={(e) => {
            e.currentTarget.releasePointerCapture(e.pointerId);
            setDragging(false);
            setTiller(0);
          }}
          ref={tillerTrack}
        >
          <div className="-translate-x-1/2 -translate-y-1/2 pointer-events-none absolute top-1/2 left-1/2 h-8 w-px bg-white/25" />
          <div
            className="knob -translate-y-1/2 absolute top-1/2 flex h-12 w-12 items-center justify-center rounded-full"
            style={{
              left: `calc(${((tiller + 1) / 2) * 100}% )`,
              transform: "translate(-50%, -50%)",
              transition: dragging
                ? "none"
                : "left 220ms cubic-bezier(.22,1,.36,1)",
            }}
          >
            <ArrowLeftRightIcon aria-hidden className="size-5" />
          </div>
        </div>
      </div>

      {/* Cross sides + Hike out */}
      <div className="pointer-events-auto flex shrink-0 flex-col items-center gap-2 pb-1">
        <button
          className={`pixel-panel flex h-14 w-14 flex-col items-center justify-center gap-0.5 rounded-xl font-pixel text-[8px] leading-tight active:translate-y-px motion-reduce:active:translate-y-0 ${
            needCross
              ? "animate-pulse text-amber-100 ring-2 ring-amber-300/80"
              : "text-sky-100"
          }`}
          onPointerDown={(e) => {
            e.preventDefault();
            bridge.requestCrossSide();
          }}
          type="button"
        >
          <ArrowLeftRightIcon aria-hidden className="size-4" />
          CROSS
        </button>
        <button
          className={`pixel-panel flex h-16 w-14 flex-col items-center justify-center gap-0.5 rounded-xl font-pixel text-[8px] leading-tight active:translate-y-px motion-reduce:active:translate-y-0 ${
            hiking
              ? "text-emerald-50 ring-2 ring-emerald-300/80"
              : "text-sky-100"
          }`}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            setHiking(true);
          }}
          onPointerLeave={() => setHiking(false)}
          onPointerUp={() => setHiking(false)}
          type="button"
        >
          <ArrowUpRightIcon aria-hidden className="size-4" />
          HIKE
        </button>
      </div>

      {/* Mainsheet */}
      <div className="pointer-events-auto flex shrink-0 flex-col items-center">
        <span className="mb-1 font-pixel text-[9px] text-sky-200/80">
          SHEET
        </span>
        <div
          className="pixel-inset relative h-40 w-14 touch-none select-none rounded-xl"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            onSheetMove(e.clientY);
          }}
          onPointerMove={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
              onSheetMove(e.clientY);
            }
          }}
          onPointerUp={(e) =>
            e.currentTarget.releasePointerCapture(e.pointerId)
          }
          ref={sheetTrack}
        >
          {/* optimal groove — mapped to the same clamped travel as the handle */}
          <div
            className="absolute inset-x-1 h-5 rounded-md border-2 border-emerald-300/70 bg-emerald-400/30 shadow-[0_0_8px_rgba(52,211,153,0.4)]"
            style={{ top: `calc(0.75rem + ${optSheet} * 7.25rem)` }}
          />
          {/* labels */}
          <span className="absolute top-1 right-1 font-pixel text-[8px] text-sky-300/70">
            OUT
          </span>
          <span className="absolute right-1 bottom-1 font-pixel text-[8px] text-sky-300/70">
            IN
          </span>
          {/* handle — clamped to stay fully inside the track (44px tall in a
              160px track → centre travels 22px‥138px) */}
          <div
            className="pixel-handle -translate-x-1/2 -translate-y-1/2 absolute left-1/2 flex h-11 w-11 items-center justify-center rounded-full"
            style={{
              backgroundColor:
                Math.abs(sheet - optSheet) < 0.1 ? "#10b981" : "#1f6b86",
              top: `calc(1.375rem + ${sheet} * 7.25rem)`,
            }}
          >
            <AnchorIcon aria-hidden className="size-4 text-white" />
          </div>
        </div>
      </div>
    </div>
  );
}
