import { NO_GO_HALF } from "@/game/constants";

const R = 25;
const C = 30;

function pt(bearingDeg: number, radius: number) {
  const r = (bearingDeg * Math.PI) / 180;
  return { x: C + radius * Math.sin(r), y: C - radius * Math.cos(r) };
}

/** North-up wind rose. Wind blows FROM `windDir` (the red no-go wedge sits there);
 *  the brass-tipped triangle is the boat's heading. */
export function WindRose({
  windDir,
  headingDeg,
  inNoGo,
}: {
  windDir: number;
  headingDeg: number;
  inNoGo: boolean;
}) {
  const a0 = windDir - NO_GO_HALF;
  const a1 = windDir + NO_GO_HALF;
  const p0 = pt(a0, R);
  const p1 = pt(a1, R);
  // Straight-edged wedge with an arc rim — a clean, instrument-like no-go zone.
  const wedge = `M ${C} ${C} L ${p0.x.toFixed(1)} ${p0.y.toFixed(1)} A ${R} ${R} 0 0 1 ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} Z`;

  // Cardinal tick marks (N, E, S, W) for north-up orientation.
  const ticks = [0, 90, 180, 270].map((deg) => {
    const inner = pt(deg, R - 4);
    const outer = pt(deg, R);
    return { deg, inner, outer };
  });

  return (
    <svg
      aria-hidden
      height="60"
      viewBox="0 0 60 60"
      width="60"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Recessed dial face with a beveled rim for depth against the chip. */}
      <circle
        cx={C}
        cy={C}
        fill="#08303d"
        r={R + 3}
        stroke="#02141a"
        strokeWidth="2"
      />
      <circle
        cx={C}
        cy={C}
        fill="none"
        r={R + 1.5}
        stroke="#1d5366"
        strokeWidth="1"
      />

      {/* No-go wedge — clean straight edges; brightens when pinching. */}
      <path
        d={wedge}
        fill={inNoGo ? "#ff3b30" : "#ff3b3055"}
        stroke={inNoGo ? "#ff7a73" : "#ff3b3088"}
        strokeLinejoin="round"
        strokeWidth="1"
      />

      {/* Cardinal ticks; north is brass to anchor orientation. */}
      {ticks.map(({ deg, inner, outer }) => (
        <line
          key={deg}
          stroke={deg === 0 ? "#ffd27a" : "#3a7387"}
          strokeLinecap="round"
          strokeWidth={deg === 0 ? 2 : 1.25}
          x1={inner.x}
          x2={outer.x}
          y1={inner.y}
          y2={outer.y}
        />
      ))}

      {/* Boat heading — confident brass-tipped arrow with a teal core. */}
      <g transform={`rotate(${headingDeg} ${C} ${C})`}>
        <polygon
          fill="#ffd27a"
          points={`${C},${C - 12} ${C - 5.5},${C + 7} ${C},${C + 3.5} ${C + 5.5},${C + 7}`}
          stroke="#3a2406"
          strokeLinejoin="round"
          strokeWidth="1"
        />
      </g>
      {/* Center hub caps the needle cleanly. */}
      <circle
        cx={C}
        cy={C}
        fill="#08303d"
        r="2.5"
        stroke="#1d5366"
        strokeWidth="1"
      />
    </svg>
  );
}
