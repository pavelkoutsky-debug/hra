// Měření výkonu jádra na referenčních mostech. Běží v prohlížeči (v pracovním vlákně)
// i v Node; nezávisí na ničem z prohlížeče kromě hodin.

import { krok, spoctiSily, TIHOVE_ZRYCHLENI, type NastaveniKroku } from "../src/jadro/integrator";
import { najdiRovnovahu, nejvyssiFrekvence, vlastniTvarySoustavy } from "../src/jadro/matice";
import { sestavSoustavu, type Soustava } from "../src/jadro/soustava";
import { betaProUtlum, mezKroku, REZERVA_KROKU, zvolKrok } from "../src/jadro/stabilita";
import { volneStupne } from "../src/jadro/stupne";
import { vytvorModalniTlumeni } from "../src/jadro/tlumeni";
import { krokKol, vytvorKola } from "./kola";
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
  /** Most s koly, tlumením vlastních tvarů a tlumením nejvyšších frekvencí. */
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

  // S provozem: táž konstrukce s tlumením nejvyšších frekvencí, koly a tlumením vlastních tvarů.
  const dt = zvolKrok(omegaMax);
  const beta = betaProUtlum(omegaMax);
  const tlumeny = sestavSoustavu({
    stycniky: most.popis.stycniky,
    prvky: most.popis.prvky.map((p) => ({ ...p, beta })),
  });
  if (najdiRovnovahu(tlumeny, stupne, nulove, TIHOVE_ZRYCHLENI) < 0) {
    throw new Error(`Referenční most „${zadani.nazev}“ nemá rovnováhu.`);
  }
  const kola = vytvorKola(tlumeny, most.mostovka, zadani.kol);
  const sProvozem: NastaveniKroku = {
    dt,
    tiha: TIHOVE_ZRYCHLENI,
    alfa: 0,
    modalni: vytvorModalniTlumeni(tlumeny, stupne, tvary, UTLUM, dt),
    dalsiSily: (soustava) => krokKol(soustava, kola, dt, TIHOVE_ZRYCHLENI),
  };
  spoctiSily(tlumeny, sProvozem.tiha, 0);
  const mikroProvoz = zmerKrok(hodiny, () => krok(tlumeny, sProvozem), trvaniMs);
  zkontroluj(tlumeny, zadani.nazev);

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
