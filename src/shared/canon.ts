/**
 * Kanonické (pevně napsané) texty hry: úvody archetypů, první popisy lokací,
 * představení NPC. Jediný přístupový bod pro klienta, worker i playtest harness.
 */
import locationsJson from "../../content/locations.json";
import introsJson from "../../content/intros.json";
import npcIntrosJson from "../../content/npc-intros.json";
import type { ArchetypeId } from "./types";

interface LocationEntry {
  name: string;
  district: string;
  image: string;
  blurb: string;
  firstVisit: string;
}

const LOCATIONS = locationsJson as Record<string, LocationEntry>;
const NPC_INTROS = npcIntrosJson as Record<string, string>;

/** Platná id lokací — guard proti vymyšleným id od GM. */
export const LOCATION_IDS: string[] = Object.keys(LOCATIONS);

/** Výchozí kronika nové hry: premisa přežije i vypadnutí úvodu z okna historie. */
export const CHRONICLE_SEED: string = introsJson.chronicleSeed;

/** Pevný úvod hry pro archetyp + úvodní rychlé akce. */
export function archetypeIntro(id: ArchetypeId): { intro: string; quickActions: string[] } {
  const intro = (introsJson.intros as Record<string, string>)[id];
  if (!intro) throw new Error(`Chybí úvod pro archetyp: ${id}`);
  return { intro, quickActions: introsJson.quickActions };
}

/** Kanonický popis první návštěvy lokace (null pro neznámé id). */
export function firstVisitText(locId: string): string | null {
  return LOCATIONS[locId]?.firstVisit ?? null;
}

/** Kanonické představení NPC při prvním setkání (null pro neznámé id). */
export function npcIntro(npcId: string): string | null {
  return NPC_INTROS[npcId] ?? null;
}

/** Příloha do GM system promptu: kanonické popisy, kterých se GM musí držet. */
export function locationCanonAppendix(): string {
  const entries = Object.entries(LOCATIONS)
    .map(([id, l]) => `### ${id} — ${l.name}\n${l.firstVisit}`)
    .join("\n\n");
  return [
    "\n\n## Příloha: Kanonické popisy lokací",
    "Tyto texty hra zobrazí hráči SAMA při jeho první návštěvě lokace.",
    "Ty je NIKDY neopakuj ani neparafrázuj — ale drž se jejich detailů, kdykoli na lokaci odkazuješ.",
    "",
    entries,
  ].join("\n");
}
