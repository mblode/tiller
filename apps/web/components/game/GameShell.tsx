"use client";

import {
  AnchorIcon,
  ArrowLeftRightIcon,
  ArrowRightIcon,
  LockIcon,
  PauseFilledIcon,
  PlayIcon,
  RotateCcwIcon,
  XIcon,
} from "blode-icons-react";
import Image from "next/image";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { Spinner } from "@/components/ui/spinner";
import { GameBridge, initialHud } from "@/game/bridge";
import { LAST_LEVEL_ID, LEVELS, levelById } from "@/game/levels";
import type { RaceResult } from "@/game/types";

import { GLOSSARY, HOW_TO_STEPS, TACK_VS_GYBE } from "./content";
import { Controls } from "./Controls";
import { Hud } from "./Hud";
import { ThreeCanvas } from "./ThreeCanvas";
import { CHIP, PixelButton, PixelPanel, Stars } from "./ui";

type Screen = "menu" | "levels" | "play";
type Modal = "howto" | "glossary" | null;

interface Progress {
  unlocked: number; // highest unlocked level id
  stars: Record<number, number>; // best stars per level id
}

const PROGRESS_KEY = "tiller.progress.v1";
const DEFAULT_PROGRESS: Progress = { stars: {}, unlocked: 1 };

function loadProgress(): Progress {
  if (typeof window === "undefined") {
    return DEFAULT_PROGRESS;
  }
  try {
    const raw = window.localStorage.getItem(PROGRESS_KEY);
    if (!raw) {
      return DEFAULT_PROGRESS;
    }
    const parsed = JSON.parse(raw) as Partial<Progress>;
    return {
      stars: parsed.stars ?? {},
      unlocked: Math.max(1, parsed.unlocked ?? 1),
    };
  } catch {
    return DEFAULT_PROGRESS;
  }
}

function saveProgress(p: Progress) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
  } catch {
    // best-effort; ignore quota / privacy-mode failures
  }
}

export function GameShell() {
  const bridgeRef = useRef<GameBridge | null>(null);
  if (!bridgeRef.current) {
    bridgeRef.current = new GameBridge();
  }
  const bridge = bridgeRef.current;

  const [screen, setScreen] = useState<Screen>("menu");
  const [modal, setModal] = useState<Modal>(null);
  const [paused, setPaused] = useState(false);
  const [booting, setBooting] = useState(false);
  const [levelId, setLevelId] = useState(1);
  const [briefId, setBriefId] = useState<number | null>(null);

  // Lazy initializer reads saved progress synchronously on the client (no
  // first-render flash of locked levels). Hydration-safe because the initial
  // render is the menu — no progress-dependent DOM until the player opens Levels.
  const [progress, setProgress] = useState<Progress>(loadProgress);

  const serverHud = useMemo(() => initialHud(), []);
  const hud = useSyncExternalStore(
    bridge.subscribe,
    bridge.getSnapshot,
    () => serverHud
  );

  // Record a finished level once: bank best stars and unlock the next level.
  const processedResult = useRef<RaceResult | null>(null);
  useEffect(() => {
    const r = hud.result;
    if (!(r && r.finished) || processedResult.current === r) {
      return;
    }
    processedResult.current = r;
    setProgress((p) => {
      const best = Math.max(p.stars[r.levelId] ?? 0, r.stars);
      const next: Progress = {
        stars: { ...p.stars, [r.levelId]: best },
        unlocked: Math.max(p.unlocked, Math.min(LAST_LEVEL_ID, r.levelId + 1)),
      };
      saveProgress(next);
      return next;
    });
  }, [hud.result]);

  // The Three canvas mounts once and stays mounted across level changes, so its
  // onReady only fires the first time. Show the boot spinner only until then.
  const sceneReady = useRef(false);
  const launch = (id: number) => {
    processedResult.current = null;
    setLevelId(id);
    setBriefId(null);
    setModal(null);
    bridge.requestStart(id);
    bridge.setInput({ paused: false });
    setPaused(false);
    setBooting(!sceneReady.current);
    setScreen("play");
  };

  const togglePause = () => {
    const next = !paused;
    setPaused(next);
    bridge.setInput({ paused: next });
  };

  const toLevels = () => {
    setPaused(false);
    bridge.setInput({ paused: false });
    setScreen("levels");
  };

  // Esc closes an open sheet, otherwise toggles pause while playing. Scoped to
  // the state it reads so it isn't re-bound on every (frequent) HUD publish.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") {
        return;
      }
      if (modal) {
        setModal(null);
      } else if (briefId !== null) {
        setBriefId(null);
      } else if (screen === "play" && !hud.result) {
        setPaused((p) => {
          const next = !p;
          bridge.setInput({ paused: next });
          return next;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal, briefId, screen, hud.result, bridge]);

  const nextId = hud.result ? hud.result.levelId + 1 : 0;
  const nextUnlocked = nextId <= LAST_LEVEL_ID;
  // A cross is only "wanted" mid-maneuver or when you're caught on the wrong
  // rail; the swipe is ignored otherwise so a stray drag can't capsize you.
  const crossable =
    hud.sailState === "TACKING" ||
    hud.sailState === "GYBING" ||
    hud.sailState === "CRASH_GYBE" ||
    hud.needCross;

  return (
    <div className="flex min-h-dvh w-full items-center justify-center bg-zinc-950">
      <div className="relative h-dvh w-full max-w-[480px] overflow-hidden bg-[#0b3a4a] shadow-2xl">
        {screen === "play" ? (
          <>
            <ThreeCanvas
              bridge={bridge}
              onReady={() => {
                sceneReady.current = true;
                setBooting(false);
              }}
            />
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(120% 80% at 50% 42%, transparent 58%, rgba(2,18,26,0.45) 100%)",
              }}
            />
            <Hud hud={hud} />
            <CrossSwipe active={crossable} bridge={bridge} />
            {hud.needCross ? <SwipeHint /> : null}
            <Controls
              bridge={bridge}
              needCross={hud.needCross}
              optSheet={hud.optSheet}
            />

            <button
              aria-label="Pause game"
              className="absolute top-[4.75rem] left-2 z-30 flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-sky-100 backdrop-blur-sm"
              onClick={togglePause}
              type="button"
            >
              <PauseFilledIcon aria-hidden className="size-5" />
            </button>

            {booting ? (
              <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-[#0b3a4a] text-sky-100">
                <Spinner className="size-6" />
                <span className="font-pixel text-xs">Hoisting the sail…</span>
              </div>
            ) : null}

            {paused && !hud.result ? (
              <Overlay label="Game paused">
                <PixelPanel className="w-full max-w-xs">
                  <h2 className="text-center font-pixel text-lg text-amber-200">
                    Paused
                  </h2>
                  <div className="mt-4 flex flex-col gap-2.5">
                    <PixelButton onClick={togglePause}>
                      <PlayIcon aria-hidden className="size-4" />
                      Resume
                    </PixelButton>
                    <PixelButton
                      onClick={() => launch(levelId)}
                      variant="secondary"
                    >
                      Restart level
                    </PixelButton>
                    <PixelButton onClick={toLevels} variant="ghost">
                      Levels
                    </PixelButton>
                  </div>
                </PixelPanel>
              </Overlay>
            ) : null}

            {hud.result ? (
              <Overlay label="Level results">
                <PixelPanel className="w-full max-w-sm">
                  <div className="text-center">
                    <div className="font-pixel text-[10px] uppercase tracking-wide text-sky-300/80">
                      {levelById(hud.result.levelId).name}
                    </div>
                    <h2 className="mt-1 font-pixel text-xl text-amber-200 drop-shadow-[2px_2px_0_rgba(0,0,0,0.5)]">
                      {hud.result.finished ? "Level Clear!" : "Race Over"}
                    </h2>
                    <div className="mt-2">
                      <Stars className="size-7" count={hud.result.stars} />
                    </div>
                    <div className="mt-2 font-pixel text-3xl text-sky-50">
                      {hud.result.total}
                    </div>
                    <div className="font-pixel text-[9px] uppercase tracking-wide text-amber-300/70">
                      score
                    </div>
                  </div>

                  <dl className="pixel-inset mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-xl px-4 py-3 text-sm text-sky-100">
                    <dt className="text-sky-300/80">Time</dt>
                    <dd className="text-right font-medium">
                      {hud.result.elapsed.toFixed(1)} s
                    </dd>
                    <dt className="text-sky-300/80">Time bonus</dt>
                    <dd className="text-right font-medium text-amber-200">
                      +{hud.result.timeBonus}
                    </dd>
                    <dt className="text-sky-300/80">Tacks / gybes</dt>
                    <dd className="text-right font-medium">
                      {hud.result.cleanTacks} / {hud.result.cleanGybes}
                    </dd>
                    {hud.result.crashGybes > 0 ? (
                      <>
                        <dt className="text-rose-300/80">Crash gybes</dt>
                        <dd className="text-right font-medium text-rose-300">
                          {hud.result.crashGybes}
                        </dd>
                      </>
                    ) : null}
                  </dl>

                  <ul className="mt-3 space-y-1 text-center text-sm text-sky-200">
                    {hud.result.lines.map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>

                  <div className="mt-4 flex flex-col gap-2.5">
                    {nextUnlocked ? (
                      <PixelButton onClick={() => launch(nextId)}>
                        <span className="truncate">
                          Next: {levelById(nextId).name}
                        </span>
                        <ArrowRightIcon
                          aria-hidden
                          className="size-4 shrink-0"
                        />
                      </PixelButton>
                    ) : (
                      <div className="rounded-xl bg-emerald-500/15 px-3 py-2 text-center text-sm text-emerald-100">
                        Every level cleared — master sailor!
                      </div>
                    )}
                    <PixelButton
                      onClick={() => launch(hud.result?.levelId ?? 1)}
                      variant="secondary"
                    >
                      <RotateCcwIcon aria-hidden className="size-4" />
                      Replay
                    </PixelButton>
                    <PixelButton onClick={toLevels} variant="ghost">
                      Levels
                    </PixelButton>
                  </div>
                </PixelPanel>
              </Overlay>
            ) : null}
          </>
        ) : null}

        {screen === "menu" ? (
          <Menu onModal={setModal} onPlay={toLevels} />
        ) : null}

        {screen === "levels" ? (
          <LevelSelect
            onBack={() => setScreen("menu")}
            onPick={setBriefId}
            progress={progress}
          />
        ) : null}

        {briefId === null ? null : (
          <LevelBrief
            id={briefId}
            onClose={() => setBriefId(null)}
            onStart={() => launch(briefId)}
          />
        )}

        {modal === "howto" ? <HowTo onClose={() => setModal(null)} /> : null}
        {modal === "glossary" ? (
          <Glossary onClose={() => setModal(null)} />
        ) : null}
      </div>
    </div>
  );
}

// A modal overlay: moves focus inside on open, traps Tab, restores focus to the
// trigger on close, and scrolls when its content is taller than the viewport so
// action buttons can never be clipped off-screen on a short phone.
// Crossing the boat = a swipe across the open water (duck under the boom), the
// real dinghy move. Pointer Events drive it, so a finger drag (touch) and a
// mouse drag (desktop) both work; the C key and CROSS button are the no-touch /
// fallback paths. Sits over the sea, below the bottom controls and pause button,
// so the tiller/sheet still take their own input. Only honored when a cross is
// actually wanted (`active`), so a stray drag can't capsize the boat.
function CrossSwipe({
  bridge,
  active,
}: {
  bridge: GameBridge;
  active: boolean;
}) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const reset = () => {
    start.current = null;
    fired.current = false;
  };
  return (
    <div
      aria-hidden
      className="absolute inset-x-0 top-16 bottom-[calc(11rem+env(safe-area-inset-bottom))] z-10 touch-none"
      onPointerCancel={reset}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { x: e.clientX, y: e.clientY };
        fired.current = false;
      }}
      onPointerMove={(e) => {
        const s = start.current;
        if (!(s && active) || fired.current) {
          return;
        }
        const dx = e.clientX - s.x;
        const dy = e.clientY - s.y;
        // threshold scales with screen width so it feels the same on phone & desktop
        const vw = typeof window === "undefined" ? 375 : window.innerWidth;
        const threshold = Math.max(48, vw * 0.12);
        if (Math.abs(dx) > threshold && Math.abs(dx) > Math.abs(dy) * 1.4) {
          fired.current = true;
          bridge.requestCrossSide();
        }
      }}
      onPointerUp={reset}
    />
  );
}

// Contextual cue shown only while the crew is on the wrong rail: teaches the
// gesture at the moment it matters, with copy matched to the input device.
function SwipeHint() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[42%] z-10 flex justify-center px-4">
      <div
        className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] text-amber-100 ${CHIP}`}
      >
        <ArrowLeftRightIcon aria-hidden className="size-4 anim-hint" />
        <span className="hidden pointer-coarse:inline">
          Swipe across to cross sides
        </span>
        <span className="inline pointer-coarse:hidden">
          Drag across or press C to cross
        </span>
      </div>
    </div>
  );
}

function Overlay({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }
    const prevFocus = document.activeElement as HTMLElement | null;
    const focusable = () =>
      [
        ...node.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        ),
      ].filter((el) => !el.hasAttribute("disabled"));
    focusable()[0]?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") {
        return;
      }
      const els = focusable();
      if (els.length === 0) {
        return;
      }
      const [first] = els;
      const last = els.at(-1) as HTMLElement;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    node.addEventListener("keydown", onKey);
    return () => {
      node.removeEventListener("keydown", onKey);
      prevFocus?.focus?.();
    };
  }, []);

  return (
    <div
      aria-label={label}
      aria-modal="true"
      className="absolute inset-0 z-40 overflow-y-auto bg-black/70 backdrop-blur-sm"
      ref={ref}
      role="dialog"
    >
      <div className="flex min-h-full flex-col items-center justify-center gap-4 px-6 py-8">
        {children}
      </div>
    </div>
  );
}

function Menu({
  onPlay,
  onModal,
}: {
  onPlay: () => void;
  onModal: (m: Modal) => void;
}) {
  return (
    <div className="chart-grid absolute inset-0 flex flex-col">
      <div className="relative w-full">
        <Image
          alt="A little dinghy sailing on blue water"
          className="h-auto w-full"
          height={393}
          priority
          src="/sprites/title.png"
          style={{ imageRendering: "pixelated" }}
          width={720}
        />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#0b3a4a] to-transparent pb-2 pt-10 text-center">
          <h1 className="font-pixel text-3xl text-sky-50 drop-shadow-[3px_3px_0_rgba(0,0,0,0.6)]">
            TILLER
          </h1>
          <div className="mx-auto mt-2 h-0.5 w-16 bg-amber-300/70" />
          <p className="mt-2 text-sm text-sky-200">
            Learn to sail, one lesson at a time
          </p>
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-center gap-3 px-8">
        <PixelButton className="w-full text-base" onClick={onPlay}>
          <PlayIcon aria-hidden className="size-5" />
          Play
        </PixelButton>
        <div className="flex gap-3">
          <PixelButton
            className="flex-1"
            onClick={() => onModal("howto")}
            variant="secondary"
          >
            How to sail
          </PixelButton>
          <PixelButton
            className="flex-1"
            onClick={() => onModal("glossary")}
            variant="secondary"
          >
            Glossary
          </PixelButton>
        </div>
        <p className="mt-2 text-center text-xs text-sky-300/70">
          Phone: drag the tiller &amp; sheet, swipe across to cross sides.
          Desktop: A-D steer, W-S trim, C to cross.
        </p>
      </div>
    </div>
  );
}

function LevelSelect({
  progress,
  onPick,
  onBack,
}: {
  progress: Progress;
  onPick: (id: number) => void;
  onBack: () => void;
}) {
  return (
    <div className="chart-grid absolute inset-0 flex flex-col bg-[#08303d]">
      <div className="flex items-center justify-between border-white/10 border-b px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <h2 className="flex items-center gap-2 font-pixel text-base text-sky-50">
          <AnchorIcon aria-hidden className="size-4 text-amber-300" />
          Voyage
        </h2>
        <button
          aria-label="Back to menu"
          className="flex h-10 w-10 items-center justify-center rounded-md bg-white/10 text-sky-100 active:translate-y-px motion-reduce:active:translate-y-0"
          onClick={onBack}
          type="button"
        >
          <XIcon aria-hidden className="size-4" />
        </button>
      </div>
      <ul className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {LEVELS.map((lvl) => {
          const unlocked = lvl.id <= progress.unlocked;
          const stars = progress.stars[lvl.id] ?? 0;
          const isNext =
            unlocked && lvl.id === progress.unlocked && stars === 0;
          return (
            <li key={lvl.id}>
              <button
                className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-transform motion-reduce:transition-none ${
                  unlocked
                    ? "pixel-panel active:translate-y-px motion-reduce:active:translate-y-0"
                    : "border-2 border-white/5 bg-black/25 opacity-70"
                } ${isNext ? "ring-2 ring-amber-300/70" : ""}`}
                disabled={!unlocked}
                onClick={() => onPick(lvl.id)}
                type="button"
              >
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl font-pixel text-sm ${
                    unlocked
                      ? "bg-sky-500/25 text-sky-50 shadow-[inset_0_2px_0_rgba(255,255,255,0.12),inset_0_-2px_0_rgba(0,0,0,0.3)]"
                      : "bg-white/10 text-sky-300/60"
                  }`}
                >
                  {unlocked ? (
                    lvl.id
                  ) : (
                    <LockIcon aria-hidden className="size-4" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-pixel text-[13px] text-sky-50">
                      {lvl.name}
                    </span>
                    {isNext ? (
                      <span className="shrink-0 rounded bg-amber-300 px-1.5 py-0.5 font-pixel text-[8px] uppercase tracking-wide text-amber-950">
                        Next
                      </span>
                    ) : null}
                  </div>
                  <div className="truncate text-[11px] text-sky-300/80">
                    {unlocked
                      ? lvl.teaches
                      : `Finish "${levelById(lvl.id - 1).name}" to unlock`}
                  </div>
                </div>
                {unlocked ? (
                  <div className="shrink-0 text-sm">
                    <Stars count={stars} />
                  </div>
                ) : (
                  <LockIcon
                    aria-hidden
                    className="size-4 shrink-0 text-sky-300/40"
                  />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function LevelBrief({
  id,
  onStart,
  onClose,
}: {
  id: number;
  onStart: () => void;
  onClose: () => void;
}) {
  const lvl = levelById(id);
  return (
    <Overlay label={`Level ${lvl.id}: ${lvl.name}`}>
      <PixelPanel className="w-full max-w-sm">
        <div className="font-pixel text-[10px] uppercase tracking-wide text-sky-300/80">
          Level {lvl.id}
        </div>
        <h2 className="font-pixel text-xl text-amber-200 drop-shadow-[2px_2px_0_rgba(0,0,0,0.5)]">
          {lvl.name}
        </h2>
        <p className="mt-1 text-sm text-sky-200">{lvl.teaches}</p>
        <ul className="pixel-inset mt-3 space-y-2 rounded-xl px-4 py-3">
          {lvl.brief.map((b) => (
            <li className="flex gap-2 text-sm text-sky-100" key={b}>
              <span aria-hidden className="text-amber-300">
                ›
              </span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
        <div className="mt-5 flex flex-col gap-2.5">
          <PixelButton onClick={onStart}>
            <AnchorIcon aria-hidden className="size-4" />
            Set sail
          </PixelButton>
          <PixelButton onClick={onClose} variant="ghost">
            Back
          </PixelButton>
        </div>
      </PixelPanel>
    </Overlay>
  );
}

function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      aria-label={title}
      aria-modal="true"
      className="absolute inset-0 z-50 flex flex-col bg-[#08303d]"
      role="dialog"
    >
      <div className="flex items-center justify-between border-white/10 border-b px-4 py-3">
        <h2 className="font-pixel text-base text-sky-50">{title}</h2>
        <button
          aria-label="Close"
          autoFocus
          className="flex h-10 w-10 items-center justify-center rounded-md bg-white/10 text-sky-100"
          onClick={onClose}
          type="button"
        >
          <XIcon aria-hidden className="size-4" />
        </button>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {children}
      </div>
    </div>
  );
}

function HowTo({ onClose }: { onClose: () => void }) {
  return (
    <Sheet onClose={onClose} title="How to sail">
      {HOW_TO_STEPS.map((s, i) => (
        <div className="rounded-lg bg-white/5 p-3" key={s.title}>
          <h3 className="font-pixel text-sm text-amber-200">
            {i + 1}. {s.title}
          </h3>
          <p className="mt-1 text-sm text-sky-100">{s.body}</p>
        </div>
      ))}
      <div className="rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-100">
        <strong className="font-pixel text-xs">Tack vs gybe: </strong>
        {TACK_VS_GYBE}
      </div>
    </Sheet>
  );
}

function Glossary({ onClose }: { onClose: () => void }) {
  return (
    <Sheet onClose={onClose} title="Glossary">
      {GLOSSARY.map((g) => (
        <div className="border-white/5 border-b pb-2" key={g.term}>
          <dt className="font-pixel text-[13px] text-sky-50">{g.term}</dt>
          <dd className="mt-0.5 text-sm text-sky-200/90">{g.def}</dd>
        </div>
      ))}
    </Sheet>
  );
}
