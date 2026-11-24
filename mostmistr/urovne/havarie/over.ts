// Kontrola případu Havarijní komise zkouškou: spadlý most neprojde, oprava komise projde a je
// od něj nejvýš tři změny, slepé opravy neprojdou. Používá ji `test/havarie.test.ts` i autoři
// případů při návrhu (vrací zprávu, ne jen ano/ne).

import { cenaNavrhu } from "../../src/data/cena";
import { NEJVIC_ZMEN_OPRAVY, stavOpravy, type PripadHavarie } from "../../src/data/havarie";
import { zkontrolujNavrh, type NavrhMostu } from "../../src/data/navrh";
import type { Uroven } from "../../src/data/uroven";
import type { VysledekZkousky } from "../../src/zkouska/protokol";
import { Zkouska } from "../../src/zkouska/zkouska";
import { nasadaUrovne } from "../index";

export interface ZkouskaPripadu {
  problemy: string[];
  vysledek: VysledekZkousky | null;
  /** Čas prvního porušení, s; null, když se nic neporušilo. */
  prvniPoruseni: number | null;
}

/** Pustí most zkouškou úrovně případu (stejně jako hra); most proti pravidlům úrovně nezkouší. */
export function zkousejPripad(uroven: Uroven, navrh: NavrhMostu): ZkouskaPripadu {
  const problemy = zkontrolujNavrh(navrh, uroven).map((p) => p.druh);
  if (problemy.length > 0) return { problemy, vysledek: null, prvniPoruseni: null };
  const zkouska = new Zkouska(uroven, navrh, nasadaUrovne(uroven));
  let pojistka = 0;
  while (!zkouska.hotovo) {
    zkouska.pokracuj(1);
    if (pojistka++ > 600) throw new Error(`zkouška případu ${uroven.id} neskončila`);
  }
  return { problemy: [], vysledek: zkouska.vysledek(), prvniPoruseni: zkouska.simulace.udalosti[0]?.cas ?? null };
}

export interface PosudekPripadu {
  /** Co je na případu špatně; prázdné, když je v pořádku. */
  vady: string[];
  /** Čitelný souhrn pro autora: ceny, změny, jak mosty dopadly. */
  zprava: string[];
}

function shrn(nazev: string, z: ZkouskaPripadu, navrh: NavrhMostu): string {
  if (!z.vysledek) return `${nazev}: proti pravidlům úrovně (${z.problemy.join(", ")})`;
  const v = z.vysledek;
  const kmitani = v.komfort ? `, kmitání ${v.komfort.zrychleni.toFixed(2)} m/s²` : "";
  const prvni = z.prvniPoruseni === null ? "" : `, první porušení v ${z.prvniPoruseni.toFixed(2)} s`;
  return `${nazev}: ${v.pruchod ? "PROŠEL" : "neprošel"}, přešlo ${v.prejelo}/${v.ucastniku}, spadlo ${v.spadlo}, porušení ${v.poruseni}${prvni}${kmitani}, neporušený ${v.neporuseny}, cena ${Math.round(cenaNavrhu(navrh))} Kč`;
}

/** Posoudí případ: spadlý most, opravu komise a slepé opravy. */
export function posudPripad(pripad: PripadHavarie): PosudekPripadu {
  const vady: string[] = [];
  const zprava: string[] = [];
  const { uroven } = pripad;
  if (pripad.most.uroven !== uroven.id || pripad.oprava.uroven !== uroven.id) vady.push("most nebo oprava patří jiné úrovni než případ");

  const spadly = zkousejPripad(uroven, pripad.most);
  zprava.push(shrn("spadlý most", spadly, pripad.most));
  // Spadlý most musí jít postavit (jinak by ho hra ani nepustila ke zkoušce) a zkouškou neprojít.
  if (!spadly.vysledek) vady.push(`spadlý most je proti pravidlům úrovně: ${spadly.problemy.join(", ")}`);
  else if (spadly.vysledek.pruchod) vady.push("spadlý most zkouškou prošel");

  const stav = stavOpravy(pripad, pripad.oprava);
  zprava.push(`oprava komise: ${stav.zmeny.length} změn (${stav.zmeny.map((z) => z.druh).join(", ")})`);
  if (stav.zmeny.length === 0) vady.push("oprava komise se od spadlého mostu neliší");
  if (stav.zmeny.length > NEJVIC_ZMEN_OPRAVY) vady.push(`oprava komise má ${stav.zmeny.length} změn, smí mít nejvýš ${NEJVIC_ZMEN_OPRAVY}`);
  const opraveny = zkousejPripad(uroven, pripad.oprava);
  zprava.push(shrn("oprava komise", opraveny, pripad.oprava));
  if (!opraveny.vysledek) vady.push(`oprava komise je proti pravidlům úrovně: ${opraveny.problemy.join(", ")}`);
  else {
    if (!opraveny.vysledek.pruchod) vady.push("oprava komise zkouškou neprošla");
    // Komise neodevzdává most, na kterém něco povolilo: oprava má být bez porušení.
    else if (!opraveny.vysledek.neporuseny) vady.push("oprava komise prošla, ale něco se na ní porušilo nebo přetížilo");
  }

  for (const slepa of pripad.slepe ?? []) {
    const zmen = stavOpravy(pripad, slepa.navrh).zmeny.length;
    const z = zkousejPripad(uroven, slepa.navrh);
    zprava.push(`${shrn(`slepá oprava „${slepa.nazev}“ (${zmen} změn)`, z, slepa.navrh)}`);
    if (zmen > NEJVIC_ZMEN_OPRAVY) vady.push(`slepá oprava „${slepa.nazev}“ má ${zmen} změn: hráč by ji ani nesměl zkusit`);
    if (z.vysledek?.pruchod) vady.push(`slepá oprava „${slepa.nazev}“ zkouškou prošla`);
  }
  return { vady, zprava };
}
