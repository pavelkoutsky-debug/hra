import type { ArchetypeId, Attributes, AttributeId, GameState } from "./types";

/** Model vypravěče/rozhodčího hry. */
export const GM_MODEL = "claude-opus-4-8";
/** Model NPC dialogů. */
export const NPC_MODEL = "claude-haiku-4-5";

/** Rabi se vrací za 24 herních hodin. */
export const TIME_LIMIT_MIN = 24 * 60;

/** Kolik posledních tahů se posílá GM doslovně. */
export const HISTORY_WINDOW = 10;

/** Obtížnosti testů. */
export const DIFFICULTY = { snadna: 8, stredni: 12, tezka: 16, extremni: 20 } as const;

export const ATTRIBUTE_NAMES: Record<AttributeId, string> = {
  vedeni: "Vědění",
  hbitost: "Hbitost",
  vymluvnost: "Výmluvnost",
  odvaha: "Odvaha",
};

export interface ArchetypeDef {
  id: ArchetypeId;
  name: string;
  description: string;
  attributes: Attributes;
  inventory: string[];
}

export const ARCHETYPES: ArchetypeDef[] = [
  {
    id: "ucenec",
    name: "Učenec",
    description:
      "Nejnadanější žák ješivy. Čteš hebrejsky i latinsky, znáš kabalu a rabín ti svěřuje opisy vzácných textů. Zámky a střechy ale nech jiným.",
    attributes: { vedeni: 3, hbitost: 0, vymluvnost: 2, odvaha: 1 },
    inventory: ["modlitební kniha", "rabínův doporučující dopis", "svíce a křesadlo"],
  },
  {
    id: "sikula",
    name: "Šikula",
    description:
      "Vyrostl jsi v uličkách ghetta. Umíš otevřít zámek vlásenkou, přelézt zeď a zmizet v davu. Učené řeči ti moc neříkají.",
    attributes: { vedeni: 1, hbitost: 3, vymluvnost: 1, odvaha: 1 },
    inventory: ["paklíče", "nůž", "smotané lano"],
  },
  {
    id: "presvedcivy",
    name: "Přesvědčivý",
    description:
      "Syn obchodníka — znáš cenu slov i grošů. Domluvíš se s krčmářkou, strážným i písařem a víš, komu lichotit a komu zaplatit.",
    attributes: { vedeni: 1, hbitost: 1, vymluvnost: 3, odvaha: 1 },
    inventory: ["měšec s groši", "stříbrný prsten", "seznam dlužníků otce"],
  },
];

export function getArchetype(id: ArchetypeId): ArchetypeDef {
  const a = ARCHETYPES.find((x) => x.id === id);
  if (!a) throw new Error(`Neznámý archetyp: ${id}`);
  return a;
}

/** Vyhodnocení testu atributu: d20 + atribut×3 ≥ obtížnost. Atribut 0 = automatické selhání. */
export function evaluateCheck(attribute: number, roll: number, difficulty: number): {
  bonus: number;
  total: number;
  success: boolean;
} {
  const bonus = attribute * 3;
  const total = roll + bonus;
  const success = attribute > 0 && total >= difficulty;
  return { bonus, total, success };
}

/** Založení nového stavu hry pro zvolený archetyp. */
export function newGameState(archetypeId: ArchetypeId): GameState {
  const a = getArchetype(archetypeId);
  return {
    version: 1,
    archetype: a.id,
    attributes: { ...a.attributes },
    maxHp: 10 + a.attributes.odvaha * 2,
    hp: 10 + a.attributes.odvaha * 2,
    location: "rabinuv-dum",
    timeMinutes: 0,
    inventory: [...a.inventory],
    flags: {},
    npcAttitudes: {},
    chronicle: "",
    axes: { povest: 0, golem: 0, odhaleni: 0, pogrom: 2 },
    combat: null,
    ending: null,
    turn: 0,
  };
}

/** Kanonické názvy předmětů — GM je preferuje, klient na ně mapuje pixel art ikony. */
export const CANONICAL_ITEM_NAMES = [
  "modlitební kniha", "rabínův doporučující dopis", "svíce a křesadlo", "paklíče", "nůž",
  "smotané lano", "měšec s groši", "stříbrný prsten", "seznam dlužníků otce", "šém",
  "mosazný knoflík", "dlužní úpis", "láhev vína", "dopis s lobkowiczkou pečetí", "propustka",
  "klíč od synagogy", "klíč od skříňky", "stříbrná spona", "glejt posla", "hebrejské opisy",
  "hřbitovní hlína a vltavská voda",
];

/** Zbývající čas do návratu rabiho, formátovaný pro UI. */
export function remainingTime(state: GameState): { minutes: number; label: string } {
  const minutes = Math.max(0, TIME_LIMIT_MIN - state.timeMinutes);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return { minutes, label: `${h} h ${m.toString().padStart(2, "0")} min` };
}
