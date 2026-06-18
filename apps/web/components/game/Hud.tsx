import { ArrowUpIcon } from "blode-icons-react";

import type { HudState } from "@/game/types";

import { CHIP } from "./ui";
import { WindRose } from "./WindRose";

const POPUP_KEYFRAMES = `@keyframes tiller-popup {
  0% { opacity: 0; transform: translateY(8px) scale(0.9); }
  15% { opacity: 1; transform: translateY(0) scale(1); }
  75% { opacity: 1; transform: translateY(-10px) scale(1); }
  100% { opacity: 0; transform: translateY(-24px) scale(0.95); }
}
@media (prefers-reduced-motion: reduce) {
  [data-tiller-popup] { animation: none !important; opacity: 1 !important; transform: none !important; }
}`;

const CARDINALS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
function cardinal(deg: number) {
  return CARDINALS[Math.round((deg % 360) / 45) % 8];
}

function tackColor(tack: HudState["tack"]) {
  if (tack === "PORT") {
    return "text-rose-300";
  }
  if (tack === "STARBOARD") {
    return "text-emerald-300";
  }
  return "text-zinc-300";
}

function tackLabel(tack: HudState["tack"]) {
  if (tack === "PORT") {
    return "PORT";
  }
  if (tack === "STARBOARD") {
    return "STBD";
  }
  return "IN IRONS";
}

export function Hud({ hud }: { hud: HudState }) {
  const speedGood = hud.trimEff > 0.85 && !hud.inNoGo;

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col">
      <style>{POPUP_KEYFRAMES}</style>

      {/* floating +/- score chips, stacked at centre */}
      <div className="absolute inset-x-0 top-[38%] flex flex-col items-center gap-1">
        {hud.popups.map((p) => (
          <div
            className={`rounded-full px-3 py-1 font-pixel text-sm shadow-lg ${
              p.points >= 0
                ? "bg-emerald-500/85 text-emerald-50"
                : "bg-rose-600/85 text-rose-50"
            }`}
            data-tiller-popup
            key={p.id}
            style={{ animation: "tiller-popup 1.5s ease-out forwards" }}
          >
            {p.text} {p.points >= 0 ? `+${p.points}` : p.points}
          </div>
        ))}
      </div>
      {/* top bar */}
      <div className="flex items-stretch justify-between gap-2 pt-[max(0.5rem,env(safe-area-inset-top))] pr-[max(0.5rem,env(safe-area-inset-right))] pb-2 pl-[max(0.5rem,env(safe-area-inset-left))]">
        <div
          className={`flex min-w-0 shrink items-center gap-2 px-2 py-1.5 ${CHIP}`}
        >
          <WindRose
            headingDeg={hud.headingDeg}
            inNoGo={hud.inNoGo}
            windDir={hud.windDir}
          />
          <div className="min-w-0 leading-none">
            <div className="font-pixel text-sm text-sky-100">
              {hud.windSpeedKt.toFixed(0)} kn
            </div>
            <div className="mt-1 text-[9px] uppercase text-sky-300/70">
              wind {cardinal(hud.windDir)}
            </div>
          </div>
        </div>

        <div
          className={`relative flex shrink-0 flex-col items-center justify-center px-3 py-1.5 ${CHIP}`}
        >
          <div className="font-pixel text-lg leading-none text-amber-200 drop-shadow-[1px_1px_0_rgba(0,0,0,0.5)]">
            {hud.score}
          </div>
          <div className="mt-1 text-[9px] uppercase text-amber-300/70">
            score
          </div>
          {/* Secondary streak/rescue lines are absolutely positioned so the
              score chip's box never changes height when they toggle. */}
          <div className="pointer-events-none absolute inset-x-0 top-full flex flex-col items-center gap-0.5 pt-1">
            {hud.streakLabel ? (
              <span className="font-pixel text-[9px] text-emerald-300 drop-shadow-[1px_1px_0_rgba(0,0,0,0.5)]">
                {hud.streakLabel}
              </span>
            ) : null}
            {hud.rescueTotal > 0 ? (
              <span className="font-pixel text-[9px] uppercase text-sky-200 drop-shadow-[1px_1px_0_rgba(0,0,0,0.5)]">
                rescues {hud.rescuedCount}/{hud.rescueTotal}
              </span>
            ) : null}
          </div>
        </div>

        <div
          className={`flex min-w-0 shrink flex-col items-end justify-center px-2 py-1.5 ${CHIP}`}
        >
          <div
            className={`font-pixel text-sm leading-none ${speedGood ? "text-emerald-300" : "text-sky-100"}`}
          >
            {hud.speedKt.toFixed(1)} kn
          </div>
          <div className="mt-1 text-[9px] uppercase text-sky-300/70">speed</div>
        </div>
      </div>

      {/* coach + next mark */}
      <div className="flex flex-col items-center gap-1.5 px-3">
        {hud.levelName ? (
          <div
            className={`px-2.5 py-0.5 font-pixel text-[10px] text-sky-200 ${CHIP}`}
          >
            {hud.levelName}
            {hud.objectiveTotal > 0
              ? ` · ${hud.objectiveIndex}/${hud.objectiveTotal}`
              : ""}
          </div>
        ) : null}
        {hud.nextMarkLabel ? (
          <div className="flex items-center gap-1.5 rounded-lg border border-amber-300/30 bg-amber-500/15 px-2.5 py-1 text-amber-100 backdrop-blur-sm">
            <ArrowUpIcon
              aria-hidden
              className="size-3.5 shrink-0"
              style={{ transform: `rotate(${hud.nextMarkBearingDeg ?? 0}deg)` }}
            />
            <span className="text-[11px]">
              {hud.nextMarkLabel}
              {hud.nextMarkDistM === null
                ? ""
                : ` · ${Math.round(hud.nextMarkDistM)} m`}
            </span>
          </div>
        ) : null}
        {hud.coach ? (
          <div
            className={`max-w-[28rem] px-3 py-1.5 text-center text-[13px] leading-snug text-sky-50 ${CHIP}`}
            key={hud.coach}
          >
            {hud.coach}
          </div>
        ) : null}
      </div>

      <div className="flex-1" />

      {/* sub bar above the controls */}
      <div className="flex items-center justify-center gap-2 px-3 pb-[8.5rem] text-[11px]">
        <span
          className={`px-2 py-0.5 font-pixel ${tackColor(hud.tack)} ${CHIP}`}
        >
          {tackLabel(hud.tack)}
        </span>
        <span className={`px-2 py-0.5 text-sky-50 ${CHIP}`}>
          {hud.pointOfSail}
        </span>
        {hud.inNoGo ? (
          <span className="rounded-lg border border-rose-400/30 bg-rose-600/70 px-2 py-0.5 font-pixel text-rose-50">
            NO-GO
          </span>
        ) : null}
      </div>
    </div>
  );
}
