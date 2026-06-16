import { NO_GO_HALF } from "@/game/constants";

const R = 25;
const C = 30;

function pt(bearingDeg: number, radius: number) {
  const r = (bearingDeg * Math.PI) / 180;
  return { x: C + radius * Math.sin(r), y: C - radius * Math.cos(r) };
}

/** North-up wind rose. Wind blows FROM `windDir` (the red no-go wedge sits there);
 *  the white triangle is the boat's heading. */
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
  const pMid = pt(windDir, R);
  const p1 = pt(a1, R);
  const wedge = `M ${C} ${C} L ${p0.x.toFixed(1)} ${p0.y.toFixed(1)} Q ${pMid.x.toFixed(1)} ${pMid.y.toFixed(1)} ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} Z`;

  // wind "from" arrow: sits at windDir on the rim, points inward
  const tail = pt(windDir, R + 3);
  const head = pt(windDir, R - 9);

  return (
    <svg
      aria-hidden
      height="60"
      viewBox="0 0 60 60"
      width="60"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        cx={C}
        cy={C}
        fill="#0a2e3b"
        r={R + 3}
        stroke="#1d5366"
        strokeWidth="2"
      />
      <path d={wedge} fill={inNoGo ? "#ff3b30" : "#ff3b3066"} />
      {/* cardinal ticks */}
      <circle
        cx={C}
        cy={C}
        fill="none"
        r={R}
        stroke="#1d5366"
        strokeWidth="1"
      />
      {/* wind from-arrow */}
      <line
        stroke="#9be1ff"
        strokeLinecap="round"
        strokeWidth="3"
        x1={tail.x}
        x2={head.x}
        y1={tail.y}
        y2={head.y}
      />
      <circle cx={head.x} cy={head.y} fill="#9be1ff" r="2.6" />
      {/* boat heading triangle */}
      <g transform={`rotate(${headingDeg} ${C} ${C})`}>
        <polygon
          fill="#ffffff"
          points={`${C},${C - 11} ${C - 6},${C + 8} ${C + 6},${C + 8}`}
          stroke="#0a2e3b"
          strokeWidth="1"
        />
      </g>
    </svg>
  );
}
