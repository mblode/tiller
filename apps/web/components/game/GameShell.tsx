"use client";

import Image from "next/image";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { GameBridge, initialHud } from "@/game/bridge";
import type { GameMode } from "@/game/types";

import { GLOSSARY, HOW_TO_STEPS, TACK_VS_GYBE } from "./content";
import { Controls } from "./Controls";
import { Hud } from "./Hud";
import { ThreeCanvas } from "./ThreeCanvas";

type Screen = "menu" | "play";
type Modal = "howto" | "glossary" | null;

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

  const serverHud = useMemo(() => initialHud("practice"), []);
  const hud = useSyncExternalStore(
    bridge.subscribe,
    bridge.getSnapshot,
    () => serverHud
  );

  const launch = (mode: GameMode) => {
    bridge.requestMode(mode);
    bridge.setInput({ paused: false });
    setPaused(false);
    setBooting(true);
    setScreen("play");
  };

  const togglePause = () => {
    const next = !paused;
    setPaused(next);
    bridge.setInput({ paused: next });
  };

  const toMenu = () => {
    setPaused(false);
    bridge.setInput({ paused: false });
    setScreen("menu");
  };

  // Esc closes an open sheet, otherwise toggles pause while playing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") {
        return;
      }
      if (modal) {
        setModal(null);
      } else if (screen === "play" && !hud.result) {
        togglePause();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="flex min-h-dvh w-full items-center justify-center bg-zinc-950">
      <div className="relative h-dvh w-full max-w-[480px] overflow-hidden bg-[#0b3a4a] shadow-2xl">
        {screen === "play" ? (
          <>
            <ThreeCanvas bridge={bridge} onReady={() => setBooting(false)} />
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(120% 80% at 50% 42%, transparent 58%, rgba(2,18,26,0.45) 100%)",
              }}
            />
            <Hud hud={hud} />
            <Controls
              bridge={bridge}
              needCross={hud.needCross}
              optSheet={hud.optSheet}
            />

            <button
              aria-label="Pause game"
              className="absolute top-[4.75rem] left-2 z-30 flex h-9 w-9 items-center justify-center rounded-full bg-black/45 font-pixel text-[10px] text-sky-100 backdrop-blur-sm"
              onClick={togglePause}
              type="button"
            >
              ❚❚
            </button>

            {booting ? (
              <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-[#0b3a4a] text-sky-100">
                <Spinner className="size-6" />
                <span className="font-pixel text-xs">Hoisting the sail…</span>
              </div>
            ) : null}

            {paused && !hud.result ? (
              <Overlay>
                <h2 className="font-pixel text-xl text-sky-100">Paused</h2>
                <div className="flex flex-col gap-2">
                  <Button onClick={togglePause}>Resume</Button>
                  <Button
                    onClick={() => bridge.requestRestart()}
                    variant="secondary"
                  >
                    Restart
                  </Button>
                  <Button onClick={toMenu} variant="outline">
                    Main menu
                  </Button>
                </div>
              </Overlay>
            ) : null}

            {hud.result ? (
              <Overlay>
                <div className="text-center">
                  <h2 className="font-pixel text-xl text-amber-200">
                    {hud.result.finished ? "Finished!" : "Race over"}
                  </h2>
                  <div className="mt-1 font-pixel text-3xl text-sky-50">
                    {hud.result.total}
                  </div>
                  <div className="text-sm text-amber-300">
                    {"★".repeat(hud.result.stars)}
                    {"☆".repeat(3 - hud.result.stars)}
                  </div>
                </div>
                <dl className="grid w-full grid-cols-2 gap-x-4 gap-y-1 text-sm text-sky-100">
                  <dt className="text-sky-300/80">Time</dt>
                  <dd className="text-right">
                    {hud.result.elapsed.toFixed(1)} s
                  </dd>
                  <dt className="text-sky-300/80">Time bonus</dt>
                  <dd className="text-right">+{hud.result.timeBonus}</dd>
                  <dt className="text-sky-300/80">Marks</dt>
                  <dd className="text-right">{hud.result.marksRounded}/2</dd>
                  <dt className="text-sky-300/80">Tacks / gybes</dt>
                  <dd className="text-right">
                    {hud.result.cleanTacks} / {hud.result.cleanGybes}
                  </dd>
                  {hud.result.crashGybes > 0 ? (
                    <>
                      <dt className="text-rose-300/80">Crash gybes</dt>
                      <dd className="text-right text-rose-300">
                        {hud.result.crashGybes}
                      </dd>
                    </>
                  ) : null}
                </dl>
                <ul className="space-y-1 text-center text-[13px] text-sky-200">
                  {hud.result.lines.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
                <div className="flex w-full flex-col gap-2">
                  <Button onClick={() => launch("race")}>Race again</Button>
                  <Button
                    onClick={() => launch("practice")}
                    variant="secondary"
                  >
                    Practice
                  </Button>
                  <Button onClick={toMenu} variant="outline">
                    Main menu
                  </Button>
                </div>
              </Overlay>
            ) : null}
          </>
        ) : (
          <Menu onLaunch={launch} onModal={setModal} />
        )}

        {modal === "howto" ? <HowTo onClose={() => setModal(null)} /> : null}
        {modal === "glossary" ? (
          <Glossary onClose={() => setModal(null)} />
        ) : null}
      </div>
    </div>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-black/70 px-6 backdrop-blur-sm">
      {children}
    </div>
  );
}

function Menu({
  onLaunch,
  onModal,
}: {
  onLaunch: (m: GameMode) => void;
  onModal: (m: Modal) => void;
}) {
  return (
    <div className="absolute inset-0 flex flex-col">
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
          <h1 className="font-pixel text-3xl text-sky-50 drop-shadow-[2px_2px_0_rgba(0,0,0,0.6)]">
            TILLER
          </h1>
          <p className="mt-1 text-sm text-sky-200">
            Learn to sail a little dinghy
          </p>
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-center gap-3 px-8">
        <Button className="h-12 text-base" onClick={() => onLaunch("race")}>
          ⛵ Race the course
        </Button>
        <Button
          className="h-12 text-base"
          onClick={() => onLaunch("practice")}
          variant="secondary"
        >
          Free practice
        </Button>
        <div className="flex gap-3">
          <Button
            className="flex-1"
            onClick={() => onModal("howto")}
            variant="outline"
          >
            How to sail
          </Button>
          <Button
            className="flex-1"
            onClick={() => onModal("glossary")}
            variant="outline"
          >
            Glossary
          </Button>
        </div>
        <p className="mt-2 text-center text-xs text-sky-300/70">
          Phone: drag the tiller &amp; sheet. Desktop: arrow keys / A-D steer,
          W-S trim.
        </p>
      </div>
    </div>
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
          className="rounded-md bg-white/10 px-3 py-1 text-sky-100"
          onClick={onClose}
          type="button"
        >
          ✕
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
