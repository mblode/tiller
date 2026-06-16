import type { HudState } from "@/game/types";

import { WindRose } from "./WindRose";

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

function tackLetter(tack: HudState["tack"]) {
  if (tack === "PORT") {
    return "P";
  }
  if (tack === "STARBOARD") {
    return "S";
  }
  return "—";
}

export function Hud({ hud }: { hud: HudState }) {
  const speedGood = hud.trimEff > 0.85 && !hud.inNoGo;

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col">
      {/* top bar */}
      <div className="flex items-start justify-between gap-2 p-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2 rounded-md bg-black/35 px-2 py-1 backdrop-blur-sm">
          <WindRose
            headingDeg={hud.headingDeg}
            inNoGo={hud.inNoGo}
            windDir={hud.windDir}
          />
          <div className="leading-tight">
            <div className="font-pixel text-sm text-sky-100">
              {hud.windSpeedKt.toFixed(0)} kn
            </div>
            <div className="text-[10px] uppercase tracking-wide text-sky-300/80">
              wind {cardinal(hud.windDir)}
            </div>
          </div>
        </div>

        <div className="rounded-md bg-black/35 px-3 py-1 text-center backdrop-blur-sm">
          {hud.mode === "race" ? (
            <>
              <div className="font-pixel text-lg text-amber-200">
                {hud.score}
              </div>
              <div className="text-[10px] uppercase tracking-wide text-amber-300/70">
                score
              </div>
            </>
          ) : (
            <div className="font-pixel text-xs text-sky-200">PRACTICE</div>
          )}
          {hud.streakLabel ? (
            <div className="font-pixel text-[10px] text-emerald-300">
              {hud.streakLabel}
            </div>
          ) : null}
        </div>

        <div className="rounded-md bg-black/35 px-2 py-1 text-right backdrop-blur-sm">
          <div
            className={`font-pixel text-sm ${speedGood ? "text-emerald-300" : "text-sky-100"}`}
          >
            {hud.speedKt.toFixed(1)} kn
          </div>
          <div className="text-[10px] uppercase tracking-wide text-sky-300/80">
            speed
          </div>
        </div>
      </div>

      {/* coach + next mark */}
      <div className="flex flex-col items-center gap-1.5 px-3">
        {hud.mode === "race" && hud.nextMarkLabel ? (
          <div className="flex items-center gap-1.5 rounded-full bg-amber-500/20 px-2.5 py-0.5 text-amber-100">
            <span
              className="inline-block font-pixel text-xs"
              style={{ transform: `rotate(${hud.nextMarkBearingDeg ?? 0}deg)` }}
            >
              ↑
            </span>
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
            className="max-w-[28rem] rounded-lg bg-black/55 px-3 py-1.5 text-center text-[13px] leading-snug text-sky-50 shadow-lg backdrop-blur-sm"
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
          className={`rounded bg-black/40 px-2 py-0.5 font-pixel ${tackColor(hud.tack)}`}
        >
          {tackLetter(hud.tack)}
        </span>
        <span className="rounded bg-black/40 px-2 py-0.5 text-sky-50">
          {hud.pointOfSail}
        </span>
        {hud.inNoGo ? (
          <span className="rounded bg-rose-600/70 px-2 py-0.5 font-pixel text-rose-50">
            NO-GO
          </span>
        ) : null}
      </div>
    </div>
  );
}
