// Denní rozbor: podklady pro toho, kdo jednou za den čte zpětnou vazbu a deník hraní a navrhuje,
// co ve hře změnit, a úložiště jeho rozborů. Rozbor nepíše server: přichází zvenčí (naplánovaná
// úloha s heslem správce), server ho jen zkontroluje, uloží a ukáže na stránce správce.
//
//   GET  /api/sprava?co=podklady[&den=RRRR-MM-DD]   co se ten den dělo (výchozí: včerejšek)
//   POST /api/sprava?co=rozbor                      uloží rozbor dne (`RozborDne` bez `vytvoreno`)
//   GET  /api/sprava?co=rozbory                     seznam rozborů od nejnovějšího
//   GET  /api/sprava?co=rozbor&den=RRRR-MM-DD       jeden rozbor celý
//
// V podkladech nejsou kontakty hráčů, přiložené mosty ani události: rozbor má stát na číslech
// a na tom, co hráči napsali, a nic z toho nemá opustit server víc, než je potřeba.

import type { SouhrnDeniku } from "../denik/souhrn";
import { chyba, DEN, denZ, jeVazba, odpoved, prectiVse, souhrnObdobi, teloJson, type ProstrediServeru } from "./obsluha";
import { poctyZebricku, type PoctyZebricku } from "./zebricek";

/** Největší tělo žádosti s rozborem. */
export const NEJVETSI_ROZBOR = 200 * 1024;
export const NEJDELSI_SHRNUTI = 1200;
export const NEJDELSI_TEXT_ROZBORU = 60_000;
export const NEJVIC_NAVRHU = 12;
/** Nejvíc zpětných vazeb v podkladech jednoho dne a nejdelší text jedné z nich. */
export const NEJVIC_VAZEB_V_PODKLADECH = 100;
const NEJDELSI_TEXT_VAZBY = 4000;
/** Kolik posledních rozborů podklady připomenou (aby nový neopakoval totéž). */
const PRIPOMENUTYCH_ROZBORU = 5;
/** Kolik rozborů vrátí seznam. */
const NEJVIC_ROZBORU_V_SEZNAMU = 90;

export const NAROCNOSTI = ["mala", "stredni", "velka"] as const;

/** Návrh, co ve hře změnit, a proč. */
export interface NavrhRozboru {
  nazev: string;
  /** Co v datech nebo ve zprávách hráčů k návrhu vede. */
  duvod: string;
  /** Co přesně udělat. */
  popis: string;
  narocnost: (typeof NAROCNOSTI)[number];
  /** 1 nejdřív, 3 až bude čas. */
  priorita: 1 | 2 | 3;
}

/** Rozbor jednoho dne. */
export interface RozborDne {
  den: string;
  /** Kdy ho server přijal. */
  vytvoreno: string;
  /** Dvě tři věty: co je ten den nejdůležitější. */
  shrnuti: string;
  /** Celý rozbor prostým textem (odstavce, odrážky pomlčkou). */
  text: string;
  navrhy: NavrhRozboru[];
}

/** Zpětná vazba v podkladech: co hráč napsal, bez kontaktu a příloh. */
export interface VazbaVPodkladech {
  id: string;
  prijato: string;
  druh: string;
  uroven: string | null;
  hodnoceni: number | null;
  stav: string;
  /** Verze hry a jazyk hráče („cs/cs-CZ“). */
  hra: string;
  jazyk: string;
  dotyk: boolean;
  text: string;
}

export interface PodkladyRozboru {
  den: string;
  /** Souhrn deníku hraní za den a za sedm dní končících tím dnem. */
  souhrnDne: SouhrnDeniku;
  souhrnTydne: SouhrnDeniku;
  /** Souhrn není celý: server nestihl přečíst všechny dávky na jednu žádost; opakováním se dopočítá. */
  neuplne: boolean;
  vazby: VazbaVPodkladech[];
  /** Kolik zpráv ten den přišlo (i těch, které se do podkladů nevešly). */
  vazebCelkem: number;
  zebricky: PoctyZebricku;
  /** Poslední rozbory: den, shrnutí a názvy návrhů. */
  predchozi: { den: string; shrnuti: string; navrhy: string[] }[];
}

const klicRozboru = (den: string): string => `rozbor/${den}.json`;

function denPred(den: string, dni: number): string {
  return denZ(new Date(Date.parse(`${den}T00:00:00Z`) - dni * 86_400_000));
}

function jeRozbor(h: unknown): h is RozborDne {
  if (typeof h !== "object" || h === null) return false;
  const r = h as Partial<RozborDne>;
  return typeof r.den === "string" && typeof r.vytvoreno === "string" && typeof r.shrnuti === "string" && typeof r.text === "string" && Array.isArray(r.navrhy);
}

/** Text bez řídicích znaků (kromě nového řádku a tabulátoru), oříznutý na kraje. */
function cistyText(h: unknown, nejdelsi: number): string | null {
  if (typeof h !== "string") return null;
  const text = h.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim();
  return text.length > 0 && text.length <= nejdelsi ? text : null;
}

/** Přečte rozbor z těla žádosti; při chybě vrátí větu, co je špatně. */
export function nactiRozbor(data: unknown): Omit<RozborDne, "vytvoreno"> | string {
  if (typeof data !== "object" || data === null) return "rozbor musí být objekt";
  const r = data as Record<string, unknown>;
  if (typeof r.den !== "string" || !DEN.test(r.den) || Number.isNaN(Date.parse(`${r.den}T00:00:00Z`))) return "chybí den ve tvaru RRRR-MM-DD";
  const shrnuti = cistyText(r.shrnuti, NEJDELSI_SHRNUTI);
  if (shrnuti === null) return `shrnutí musí být text do ${NEJDELSI_SHRNUTI} znaků`;
  const text = cistyText(r.text, NEJDELSI_TEXT_ROZBORU);
  if (text === null) return `text rozboru musí mít do ${NEJDELSI_TEXT_ROZBORU} znaků`;
  if (!Array.isArray(r.navrhy) || r.navrhy.length > NEJVIC_NAVRHU) return `návrhů smí být nejvýš ${NEJVIC_NAVRHU}`;
  const navrhy: NavrhRozboru[] = [];
  for (const [i, h] of r.navrhy.entries()) {
    if (typeof h !== "object" || h === null) return `návrh ${i + 1} musí být objekt`;
    const n = h as Record<string, unknown>;
    const nazev = cistyText(n.nazev, 200);
    const duvod = cistyText(n.duvod, 3000);
    const popis = cistyText(n.popis, 3000);
    if (nazev === null || duvod === null || popis === null) return `návrh ${i + 1} musí mít název (do 200 znaků), důvod a popis (do 3000 znaků)`;
    if (!(NAROCNOSTI as readonly unknown[]).includes(n.narocnost)) return `návrh ${i + 1}: náročnost je mala, stredni nebo velka`;
    if (n.priorita !== 1 && n.priorita !== 2 && n.priorita !== 3) return `návrh ${i + 1}: priorita je 1, 2 nebo 3`;
    navrhy.push({ nazev, duvod, popis, narocnost: n.narocnost as NavrhRozboru["narocnost"], priorita: n.priorita });
  }
  return { den: r.den, shrnuti, text, navrhy };
}

/** Podklady jednoho dne. */
export async function podkladyDne(p: ProstrediServeru, den: string): Promise<PodkladyRozboru> {
  const dne = await souhrnObdobi(p, den, den);
  const tydne = await souhrnObdobi(p, denPred(den, 6), den);
  // Čísla zpětných vazeb začínají dnem příjmu (RRRRMMDDT…), takže den jde vybrat předponou.
  const kliceVazeb = await p.sklad.klice(`vazba/${den.replace(/-/g, "")}T`);
  const vazby: VazbaVPodkladech[] = (await prectiVse(p.sklad, kliceVazeb.slice(0, NEJVIC_VAZEB_V_PODKLADECH))).filter(jeVazba).map((v) => ({
    id: v.id,
    prijato: v.prijato,
    druh: v.druh,
    uroven: v.uroven ?? null,
    hodnoceni: v.hodnoceni ?? null,
    stav: v.stav,
    hra: v.hlavicka.hra,
    jazyk: v.hlavicka.jazyk,
    dotyk: v.hlavicka.dotyk,
    text: v.text.length > NEJDELSI_TEXT_VAZBY ? `${v.text.slice(0, NEJDELSI_TEXT_VAZBY)}…` : v.text,
  }));
  const kliceRozboru = (await p.sklad.klice("rozbor/")).filter((k) => k < klicRozboru(den)).reverse().slice(0, PRIPOMENUTYCH_ROZBORU);
  const predchozi = (await prectiVse(p.sklad, kliceRozboru)).filter(jeRozbor).map((r) => ({ den: r.den, shrnuti: r.shrnuti, navrhy: r.navrhy.map((n) => n.nazev) }));
  return {
    den,
    souhrnDne: dne.souhrn,
    souhrnTydne: tydne.souhrn,
    neuplne: dne.neuplne || tydne.neuplne,
    vazby,
    vazebCelkem: kliceVazeb.length,
    zebricky: await poctyZebricku(p.sklad, den),
    predchozi,
  };
}

/**
 * Obsluha adres rozboru ve správě. Volá se až po ověření hesla správce; vrací null, když
 * žádost patří jinam.
 */
export async function spravujRozbor(zadost: Request, p: ProstrediServeru): Promise<Response | null> {
  const dotaz = new URL(zadost.url).searchParams;
  const co = dotaz.get("co") ?? "";
  if (co === "podklady" && zadost.method === "GET") {
    // Výchozí je včerejšek: den, který už skončil a má všechny dávky.
    const den = dotaz.get("den") ?? denPred(denZ(p.ted()), 1);
    if (!DEN.test(den) || Number.isNaN(Date.parse(`${den}T00:00:00Z`))) return chyba(400, "chybí den ve tvaru RRRR-MM-DD");
    return odpoved(200, await podkladyDne(p, den));
  }
  if (co === "rozbor" && zadost.method === "POST") {
    const telo = await teloJson(zadost, NEJVETSI_ROZBOR);
    if (telo instanceof Response) return telo;
    const rozbor = nactiRozbor(telo.data);
    if (typeof rozbor === "string") return chyba(400, rozbor);
    // Rozbor dne, který ještě nenastal, nedává smysl; týž den podruhé přepíše první (oprava).
    if (rozbor.den > denZ(p.ted())) return chyba(400, "rozbor je na den, který ještě nenastal");
    const zaznam: RozborDne = { ...rozbor, vytvoreno: p.ted().toISOString() };
    await p.sklad.zapis(klicRozboru(rozbor.den), zaznam);
    return odpoved(201, { den: zaznam.den, vytvoreno: zaznam.vytvoreno, navrhu: zaznam.navrhy.length });
  }
  if (co === "rozbory" && zadost.method === "GET") {
    const klice = (await p.sklad.klice("rozbor/")).reverse().slice(0, NEJVIC_ROZBORU_V_SEZNAMU);
    const rozbory = (await prectiVse(p.sklad, klice)).filter(jeRozbor).map((r) => ({ den: r.den, vytvoreno: r.vytvoreno, shrnuti: r.shrnuti, navrhu: r.navrhy.length }));
    return odpoved(200, { rozbory });
  }
  if (co === "rozbor" && zadost.method === "GET") {
    const den = dotaz.get("den") ?? "";
    if (!DEN.test(den)) return chyba(400, "chybí den ve tvaru RRRR-MM-DD");
    const rozbor = await p.sklad.cti(klicRozboru(den));
    return jeRozbor(rozbor) ? odpoved(200, { rozbor }) : chyba(404, "rozbor toho dne není");
  }
  return null;
}
