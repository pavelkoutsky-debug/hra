// Měření výkonu jádra na referenčních mostech. Běží v prohlížeči (v pracovním vlákně)
// i v Node; nezávisí na ničem z prohlížeče kromě hodin.

import { vytvorBremena, zatizeniBremeny } from "../src/jadro/bremena";
import { krok, spoctiSily, TIHOVE_ZRYCHLENI, type NastaveniKroku } from "../src/jadro/integrator";
import { najdiRovnovahu, nejvyssiFrekvence, vlastniTvarySoustavy } from "../src/jadro/matice";
import { Simulace } from "../src/jadro/simulace";
import { sestavSoustavu, type Soustava } from "../src/jadro/soustava";
import { mezKroku, REZERVA_KROKU } from "../src/jadro/stabilita";
import { volneStupne } from "../src/jadro/stupne";
import { vytvorTrasu } from "../src/jadro/trasa";
import { prihradovyMost, REFERENCNI_MOSTY } from "./mosty";

/** Kolik vlastních tvarů se tlumí. */
const TLUMENYCH_TVARU = 10;
const UTLUM = 0.005;

export interface VysledekMereni {
  nazev: string;
  svarene: boolean;
  stycniku: number;
  prutu: number;
  stupnu: number;
  kol: number;
  /** Kroků simulace potřebných na jednu sekundu děje, s tlumením nejvyšších frekvencí. */
  krokuNaSekundu: number;
  /** Nejnižší vlastní frekvence mostu v Hz. */
  prvniFrekvence: number;
  /** Jednorázová příprava před zkouškou, v milisekundách. */
  priprava: { nejvyssiFrekvence: number; rovnovaha: number; vlastniTvary: number };
  /** Samotný most bez provozu, s tlumením úměrným hmotě a krokem těsně pod holou mezí. */
  holeJadro: { mikrosekundNaKrok: number; nasobekRealnehoCasu: number };
  /**
   * Úplná zkouška: most s koly na pneumatikách, tlumením vlastních tvarů i nejvyšších
   * frekvencí a s průběžným posuzováním namáhání a porušení.
   */
  sProvozem: { mikrosekundNaKrok: number; nasobekRealnehoCasu: number };
}

type Hodiny = () => number;

/** Změří trvání jednoho kroku: medián přes dávky, po zahřátí překladače. */
function zmerKrok(hodiny: Hodiny, jedenKrok: () => void, trvaniMs: number): number {
  const DAVKA = 200;
  const zahrati = hodiny() + trvaniMs * 0.3;
  while (hodiny() < zahrati) for (let i = 0; i < DAVKA; i++) jedenKrok();
  const casy: number[] = [];
  const konec = hodiny() + trvaniMs;
  while (hodiny() < konec || casy.length < 5) {
    const zacatek = hodiny();
    for (let i = 0; i < DAVKA; i++) jedenKrok();
    casy.push(((hodiny() - zacatek) * 1000) / DAVKA);
  }
  casy.sort((a, b) => a - b);
  return casy[Math.floor(casy.length / 2)]!;
}

function zmerMost(
  zadani: (typeof REFERENCNI_MOSTY)[number],
  svarene: boolean,
  hodiny: Hodiny,
  trvaniMs: number,
): VysledekMereni {
  const most = prihradovyMost({ ...zadani, svarene });
  const s = sestavSoustavu(most.popis);
  const stupne = volneStupne(s);
  const nulove = new Float64Array(stupne.length);

  let t = hodiny();
  const omegaMax = nejvyssiFrekvence(s, stupne);
  const casFrekvence = hodiny() - t;

  t = hodiny();
  if (najdiRovnovahu(s, stupne, nulove, TIHOVE_ZRYCHLENI) < 0) {
    throw new Error(`Referenční most „${zadani.nazev}“ nemá rovnováhu.`);
  }
  const casRovnovahy = hodiny() - t;

  t = hodiny();
  const tvary = vlastniTvarySoustavy(s, stupne, TLUMENYCH_TVARU);
  const casTvaru = hodiny() - t;
  if (!tvary) throw new Error(`Referenční most „${zadani.nazev}“ nemá kladně definitní tuhost.`);

  // Jen most: tlumení úměrné hmotě, krok těsně pod holou mezí stability.
  const dtHole = REZERVA_KROKU * mezKroku(omegaMax);
  const hole: NastaveniKroku = { dt: dtHole, tiha: TIHOVE_ZRYCHLENI, alfa: 2 * UTLUM * tvary.omega[0]! };
  spoctiSily(s, hole.tiha, hole.alfa);
  const mikroHole = zmerKrok(hodiny, () => krok(s, hole), trvaniMs);
  zkontroluj(s, zadani.nazev);

  // Úplná zkouška tak, jak ji počítá hra: kola jsou hmoty na pneumatikách rozestavené
  // po mostě a pomalu jedoucí, aby na něm vydržela po celé měření.
  const HMOTA_KOLA = 500;
  const TUHOST_PNEUMATIKY = 1e6;
  const TLUMENI_PNEUMATIKY = 5e3;
  const rozpeti = zadani.poli * zadani.delkaPole;
  const stycnikuMostu = most.popis.stycniky.length;
  const sednuti = (HMOTA_KOLA * TIHOVE_ZRYCHLENI) / TUHOST_PNEUMATIKY;
  const sKoly = {
    stycniky: [...most.popis.stycniky],
    prvky: most.popis.prvky,
  };
  for (let i = 0; i < zadani.kol; i++) {
    sKoly.stycniky.push({ x: (rozpeti * (i + 0.25)) / zadani.kol, y: -sednuti, pevneX: true, hmota: HMOTA_KOLA });
  }
  const zkouseny = sestavSoustavu(sKoly);
  for (let i = 0; i < zadani.kol; i++) zkouseny.vx[stycnikuMostu + i] = 0.2;
  const stupneMostu = volneStupne(zkouseny).filter((kod) => kod < 3 * stycnikuMostu);
  if (najdiRovnovahu(zkouseny, stupneMostu, new Float64Array(stupneMostu.length), TIHOVE_ZRYCHLENI) < 0) {
    throw new Error(`Referenční most „${zadani.nazev}“ nemá rovnováhu.`);
  }
  const naMostovce = new Set(most.mostovka);
  const pruty: number[] = [];
  for (let e = 0; e < zkouseny.pocetPrvku; e++) {
    if (naMostovce.has(zkouseny.prvekA[e]!) && naMostovce.has(zkouseny.prvekB[e]!)) pruty.push(e);
  }
  const bremena = vytvorBremena(
    vytvorTrasu(zkouseny, pruty),
    Array.from({ length: zadani.kol }, (_, i) => ({
      stycnik: stycnikuMostu + i,
      tuhost: TUHOST_PNEUMATIKY,
      tlumeni: TLUMENI_PNEUMATIKY,
    })),
  );
  const simulace = new Simulace(zkouseny, {
    tiha: TIHOVE_ZRYCHLENI,
    utlum: UTLUM,
    zatizeni: zatizeniBremeny(bremena),
    tlumeneStupne: stupneMostu,
  });
  const dt = simulace.dt;
  const mikroProvoz = zmerKrok(hodiny, () => simulace.krok(), trvaniMs);
  zkontroluj(zkouseny, zadani.nazev);
  if (simulace.porusena || simulace.rozpadla) {
    throw new Error(`Referenční most „${zadani.nazev}“ se při měření porušil.`);
  }

  return {
    nazev: zadani.nazev,
    svarene,
    stycniku: s.pocetStycniku,
    prutu: s.pocetPrvku,
    stupnu: stupne.length,
    kol: zadani.kol,
    krokuNaSekundu: 1 / dt,
    prvniFrekvence: tvary.omega[0]! / (2 * Math.PI),
    priprava: { nejvyssiFrekvence: casFrekvence, rovnovaha: casRovnovahy, vlastniTvary: casTvaru },
    holeJadro: { mikrosekundNaKrok: mikroHole, nasobekRealnehoCasu: (dtHole * 1e6) / mikroHole },
    sProvozem: { mikrosekundNaKrok: mikroProvoz, nasobekRealnehoCasu: (dt * 1e6) / mikroProvoz },
  };
}

/** Pojistka: měření nemá smysl, když se výpočet rozpadl. */
function zkontroluj(s: Soustava, nazev: string): void {
  for (let i = 0; i < s.pocetStycniku; i++) {
    if (!Number.isFinite(s.y[i]!) || Math.abs(s.y[i]!) > 1e3) {
      throw new Error(`Výpočet mostu „${nazev}“ se při měření rozpadl.`);
    }
  }
}

/**
 * Změří všechny referenční mosty v kloubové i svařené variantě.
 * `prubeh` dostane každý výsledek hned, jak je hotový.
 */
export function zmerVykon(
  hodiny: Hodiny,
  prubeh: (vysledek: VysledekMereni) => void,
  trvaniMs = 400,
): VysledekMereni[] {
  const vysledky: VysledekMereni[] = [];
  for (const zadani of REFERENCNI_MOSTY) {
    for (const svarene of [false, true]) {
      const vysledek = zmerMost(zadani, svarene, hodiny, trvaniMs);
      vysledky.push(vysledek);
      prubeh(vysledek);
    }
  }
  return vysledky;
}
