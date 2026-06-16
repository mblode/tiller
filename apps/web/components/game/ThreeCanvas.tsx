"use client";

import { useEffect, useRef } from "react";

import type { GameBridge } from "@/game/bridge";

/** Mounts the Three.js scene once, client-side. Three is dynamically imported
 *  so it never touches `window` during SSR. */
export function ThreeCanvas({
  bridge,
  onReady,
}: {
  bridge: GameBridge;
  onReady?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    let destroyed = false;
    let dispose: (() => void) | null = null;

    (async () => {
      const { createScene } = await import("@/game/three/scene");
      if (destroyed || !ref.current) {
        return;
      }
      dispose = createScene(ref.current, bridge, () => onReadyRef.current?.());
    })();

    return () => {
      destroyed = true;
      dispose?.();
    };
  }, [bridge]);

  return <div className="absolute inset-0 touch-none" ref={ref} />;
}
