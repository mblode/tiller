import { ImageResponse } from "next/og";

export const alt = "Tiller: learn to sail a dinghy";
export const contentType = "image/png";
export const size = { height: 630, width: 1200 };

// Sea palette taken from the viewport theme colour in layout.tsx.
const DEEP_SEA = "#0b3a4a";
const SHALLOWS = "#12657d";
const FOAM = "#e9f6f9";

// GeistPixelSquare is a local font that next/og (Satori) cannot decode, so we
// fall back to the bundled default font.
export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        alignItems: "center",
        background: `linear-gradient(180deg, ${SHALLOWS} 0%, ${DEEP_SEA} 100%)`,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        justifyContent: "center",
        padding: "80px",
        width: "100%",
      }}
    >
      <div
        style={{
          color: FOAM,
          display: "flex",
          fontSize: 156,
          fontWeight: 700,
          letterSpacing: "-0.05em",
          lineHeight: 1,
        }}
      >
        Tiller
      </div>
      <div
        style={{
          color: "rgba(233, 246, 249, 0.85)",
          display: "flex",
          fontSize: 46,
          marginTop: 28,
        }}
      >
        A tiny pixel-art sailing game.
      </div>
      <div
        style={{
          color: "rgba(233, 246, 249, 0.7)",
          display: "flex",
          fontSize: 30,
          marginTop: 20,
          textAlign: "center",
        }}
      >
        Learn the wind, the no-go zone, tacking and gybing.
      </div>
    </div>,
    { ...size }
  );
}
