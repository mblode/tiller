import { renderZoneOgImage } from "@/app/og-image-shared";
import { OgLogo } from "@/app/og-logo";
import { siteTitle } from "@/lib/site";

export {
  OG_CONTENT_TYPE as contentType,
  OG_SIZE as size,
} from "@/app/og-image-shared";

export { siteTitle as alt } from "@/lib/site";

/**
 * The house card (Rule 12). The sea-gradient card this replaces was one of the
 * eighteen unrelated designs the rule was written against: 156px type, its own
 * palette, and no byline, so a share of this zone said nothing about who made
 * it.
 *
 * The pixel art direction stays where it belongs, on the game itself. A social
 * card is a row in someone else's feed, and there it has to read as one of
 * thirty-three things by the same person.
 */
export default function OpengraphImage() {
  return renderZoneOgImage({
    background: "#0c4a6e",
    color: "#f0f9ff",
    logo: <OgLogo />,
    title: siteTitle,
  });
}
