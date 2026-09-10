import type { Household } from "@/lib/types";

const BASE = "https://www.stromauskunft.de";

const PROVIDER_SHOP: { match: RegExp; url: string; label: string }[] = [
  { match: /eprimo/i, url: "https://www.eprimo.de/privatkunden/strom", label: "Bei eprimo öffnen" },
  { match: /lichtblick/i, url: "https://www.lichtblick.de/oekostrom/", label: "Bei LichtBlick öffnen" },
  { match: /e\.?\s*on/i, url: "https://www.eon.de/de/pk/strom.html", label: "Bei E.ON öffnen" },
  { match: /entega/i, url: "https://www.entega.de/oekostrom/oekostrom-tarife/", label: "Bei ENTEGA öffnen" },
  { match: /\bnew\b|new-energie|new energie/i, url: "https://www.new-energie.de/", label: "Bei NEW öffnen" },
  { match: /stadtwerke|nahe/i, url: "https://www.kreuznacherstadtwerke.de/energie-fuer-ihr-zuhause/nahestrom-natur", label: "Stadtwerke-Rechner öffnen" },
];

export function absoluteStromauskunftUrl(href: string | null | undefined): string | undefined {
  if (!href) return undefined;
  if (href.startsWith("http://") || href.startsWith("https://")) return href;
  if (href.startsWith("/")) return `${BASE}${href}`;
  return undefined;
}

export function providerListingHref(chunkHtml: string): string | undefined {
  const m = chunkHtml.match(/href="(\/de\/stromanbieter\/[a-z0-9-]+\.html)"/i);
  return absoluteStromauskunftUrl(m?.[1]);
}

export function signupForProvider(
  provider: string,
  household: Household,
  listingUrl?: string,
): { signupUrl: string; signupLabel: string; sourceUrl: string } {
  const shop = PROVIDER_SHOP.find((item) => item.match.test(provider));
  const listing =
    listingUrl ??
    `https://www.stromauskunft.de/de/stadt/stromanbieter-in-bad-kreuznach.html`;
  if (shop) {
    return { signupUrl: shop.url, signupLabel: shop.label, sourceUrl: listing };
  }
  return {
    signupUrl: `https://www.verivox.de/stromvergleich/?plz=${encodeURIComponent(household.zip)}&kwh=${household.purchasedKwh}`,
    signupLabel: "Bei Verivox vergleichen",
    sourceUrl: listing,
  };
}

export function wechselserviceUrl() {
  return "https://www.stromauskunft.de/wechselservice-strom-und-gas/";
}
