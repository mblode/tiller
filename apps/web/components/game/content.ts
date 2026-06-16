export interface GlossaryEntry {
  term: string;
  def: string;
}

export const GLOSSARY: GlossaryEntry[] = [
  {
    def: "Where the wind blows FROM. Find it first — the arrow and the no-go wedge always point at it.",
    term: "Wind direction",
  },
  { def: "Speed at sea. 1 knot ≈ 1.15 mph.", term: "Knots" },
  { def: "The front (pointy) and back of the boat.", term: "Bow / Stern" },
  { def: "The LEFT side as you face the bow. Marked red.", term: "Port" },
  {
    def: "The RIGHT side as you face the bow. Marked green.",
    term: "Starboard",
  },
  {
    def: "The big sail on the boom — your engine. Trim it with the mainsheet.",
    term: "Main sail",
  },
  {
    def: "The smaller sail in front of the mast (glossary only in this game).",
    term: "Jib",
  },
  {
    def: "The ~43° wedge either side of straight upwind where you can't sail — the sail just flaps. Steer out of it.",
    term: "No-go zone",
  },
  {
    def: "Your angle to the wind: close-hauled (upwind), close / beam / broad reach (across), and run (downwind).",
    term: "Points of sail",
  },
  {
    def: "Wind on the side, ~90°. Usually the fastest and easiest point of sail.",
    term: "Beam reach",
  },
  {
    def: "Turning the BOW through the wind to switch sides. This is how you zig-zag upwind.",
    term: "Tacking",
  },
  {
    def: "Turning the STERN through the wind downwind. The boom swings hard and fast — sheet in first, then ease out.",
    term: "Gybing",
  },
  {
    def: "The steering arm. Push it AWAY from where you want to go — the bow turns the opposite way. That's the lesson.",
    term: "Tiller",
  },
  {
    def: "The rope that trims the main sail. Pull IN to tighten, ease OUT to depower.",
    term: "Mainsheet",
  },
];

export const HOW_TO_STEPS: { title: string; body: string }[] = [
  {
    body: "Drag the wide bar at the bottom. It's a real tiller: push it LEFT and the bow swings RIGHT. Feels backwards — aim the tiller, not the bow.",
    title: "Steer with the tiller",
  },
  {
    body: "Slide the rope on the right. Keep the handle in the green groove — that's the sail trimmed just right for your angle to the wind.",
    title: "Trim the mainsheet",
  },
  {
    body: "The red wedge points at the wind. Sail too close to it and the sail flaps and you stall. Bear away to fill it again.",
    title: "Mind the no-go zone",
  },
  {
    body: "To get upwind you must TACK (bow through the wind). To get downwind you GYBE (stern through the wind) — sheet in before you turn.",
    title: "Tack upwind, gybe downwind",
  },
];

export const TACK_VS_GYBE =
  "Tack = nose through the wind, going upwind. Gybe = tail through the wind, going downwind (boom swings hard — sheet in, cross, then ease out).";
