import { GameShell } from "@/components/game/GameShell";
import { ZoneBreadcrumb } from "@/components/zone-breadcrumb";
import { siteDescription, siteTitle, siteUrl } from "@/lib/site";

/**
 * One script holding one `@graph`. Separate blocks are separate, disconnected
 * nodes, and disconnected nodes cannot be merged into a single entity. See
 * blode-co/apps/web/.claude/knowledge/zone-conventions.md Rule 3.
 *
 * `WebPage` and nothing more, on purpose. Tiller is a browser toy, not software
 * you install, and it has no price: Google's Software App rich result wants
 * `offers` plus an `aggregateRating` or `review`, and its guidelines forbid a
 * rating you wrote about your own work. `SoftwareApplication` here could only
 * ever be a type that fails validation.
 *
 * The three identity nodes are referenced by `@id` and never redefined. A
 * zone-scoped `#person` would publish a second Matthew Blode on this domain.
 */
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@id": `${siteUrl}/#webpage`,
      "@type": "WebPage",
      author: { "@id": "https://blode.co/#person" },
      breadcrumb: { "@id": `${siteUrl}/#breadcrumb` },
      description: siteDescription,
      inLanguage: "en",
      isPartOf: { "@id": "https://blode.co/#website" },
      name: siteTitle,
      // `publisher` is the Organization and `author` is the Person: a Person
      // publisher shows up as a Search Console enhancement warning.
      publisher: { "@id": "https://blode.co/#organization" },
      url: siteUrl,
    },
    {
      "@id": `${siteUrl}/#breadcrumb`,
      "@type": "BreadcrumbList",
      // Word for word what <ZoneBreadcrumb> renders below: Google reads a
      // mismatch between the two as a markup error.
      itemListElement: [
        {
          "@type": "ListItem",
          item: "https://blode.co",
          name: "Matthew Blode",
          position: 1,
        },
        {
          "@type": "ListItem",
          item: "https://blode.co/projects",
          name: "Projects",
          position: 2,
        },
        { "@type": "ListItem", item: siteUrl, name: "Tiller", position: 3 },
      ],
    },
  ],
};

export default function Home() {
  return (
    <>
      {/* Static object literal, no user input. See oxlint.config.ts. */}
      <script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
        type="application/ld+json"
      />

      {/*
        The trail rides on the game's own dark field rather than the page
        background: the arcade art direction runs edge to edge and a pale strip
        above it would read as a browser chrome bar. `dark` flips the shadcn
        token block in globals.css, which is what lets the breadcrumb stay a
        verbatim copy of the reference implementation instead of growing a set
        of one-off colours. Width matches the game's 480px column.
      */}
      <header className="dark bg-zinc-950 px-4 py-2.5">
        <div className="mx-auto w-full max-w-[480px]">
          <ZoneBreadcrumb product="Tiller" />
        </div>
      </header>

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
