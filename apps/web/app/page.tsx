import { GameShell } from "@/components/game/GameShell";

export default function Home() {
  return (
    <>
      <GameShell />

      {/*
        A server component below the game, on purpose. GameShell is a client
        component whose copy lives in menus and in the how-to and glossary
        modals, all of which need a click before they exist. This is the prose
        that is in the HTML before any of that happens.
      */}
      <section className="mx-auto max-w-[70ch] space-y-4 px-6 py-10 text-sm leading-relaxed opacity-80">
        <h2 className="font-medium text-base">What the game teaches</h2>

        <p>
          Tiller is a pixel-art sailing game about the two or three things that
          quietly defeat every beginner. The first is that the tiller is
          backwards: push it left and the bow swings right. You can read that
          sentence and still get it wrong under pressure, which is why the game
          makes you steer with a real tiller rather than with a wheel or a pair
          of arrow keys pointed at the boat.
        </p>

        <p>
          The second is the no-go zone. There is a wedge 43 degrees either side
          of straight upwind where a sailing boat simply cannot go: point at it
          and the sail flaps and you stop. Getting somewhere upwind means
          zig-zagging across that wedge in a series of tacks, and level four
          exists entirely to make you do it. Turning the bow through the wind is
          a tack, turning the stern through it is a gybe, and the difference
          matters because a gybe throws the boom across hard.
        </p>

        <p>
          Seven levels, one new idea each, and the next hazard only switches on
          once you have earned it, so the full physics is not live until the
          finale. By the last two, crew weight is real: lean the wrong way and
          she goes over. You only ever touch two controls, the tiller to steer
          and the mainsheet to trim, and everything else is reading where the
          wind is. It plays with a thumb on a phone or on the keyboard, and each
          level has a par time worth three stars.
        </p>
      </section>
    </>
  );
}
