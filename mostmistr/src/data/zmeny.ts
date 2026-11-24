// Změny mezi dvěma návrhy téhož mostu: čím se opravený most liší od původního. Havarijní
// komise (`urovne/havarie/`) dovoluje opravit spadlý most nejvýš několika změnami; tady se
// počítají. Bez prohlížeče.
//
// Změna je jedna věc, která je na mostě jinak: přidaný prut, odebraný prut, prut z jiného
// materiálu, prut jinak nastavený (zdvih pístu, tlumič), posunutý styčník (se všemi svými
// pruty dohromady), svar, zámek, závaží nebo laděný tlumič ve styčníku. Napínáky lan se počítají
// dohromady jako jedna změna: tlačítko Dopnout lana je přenastaví všechny naráz.
//
// Počítá se výsledek, ne cesta k němu: stejný opravený most má stejný počet změn, ať k němu
// hráč došel jakkoli. Porovnává se proto jen tvar (místa styčníků a co je mezi nimi), nikdy id:
// ta přiděluje editor podle toho, v jakém pořadí hráč kreslil a mazal. Prut smazaný a nakreslený
// znovu na stejné místo změna není. Posunutý styčník se pozná podle prutů: styčník, který zmizel
// z jednoho místa, a styčník na jiném místě, který má aspoň jeden prut ke stejnému sousedovi.
// Z možných výkladů (posunul se, nebo ho hráč smazal a postavil jiný?) se bere ten s nejmenším
// počtem změn, takže dva styčníky posunuté po sobě (druhý na místo prvního) jsou dvě změny.

import { KATALOG, zdvihPistu } from "./katalog";
import type { NavrhMostu, PrutNavrhu, StycnikNavrhu } from "./navrh";

export type ZmenaMostu =
  /** Prut, který v původním mostě nebyl (id v novém návrhu). */
  | { druh: "prut-pridan"; prut: number }
  /** Prut původního mostu, který v novém chybí (id v původním návrhu). */
  | { druh: "prut-odebran"; prut: number }
  /** Prut na stejném místě z jiného prvku (id v novém návrhu). */
  | { druh: "prvek"; prut: number }
  /** Jiné nastavení prutu: zdvih pístu, tlumení, tuhost (id v novém návrhu). */
  | { druh: "nastaveni"; prut: number }
  /** Přenastavené napínáky lan: všechny dohromady jedna změna; `lan` říká, kolika lan se týká. */
  | { druh: "napinaky"; lan: number }
  /** Styčník posunutý na jiné místo (id v novém návrhu). */
  | { druh: "stycnik-posunut"; stycnik: number }
  /** Jiný svar, zámek, závaží nebo laděný tlumič ve styčníku (id v novém návrhu, jinak v původním). */
  | { druh: "svar" | "zamek" | "zavazi" | "tlumic"; stycnik: number };

const klicBodu = (s: { x: number; y: number }): string => `${s.x};${s.y}`;
const klicPrutu = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);
/** Napínák nebo nastavení se liší, když ho hráč opravdu změnil; zaokrouhlení zápisu se nepočítá. */
const STEJNE = 1e-9;
/** Kolik posunutých styčníků hledání nejvýš zkusí složit do jednoho výkladu. */
const NEJVIC_POSUNU = 6;
/** Kolik výkladů hledání nejvýš ohodnotí; víc jich má jen most přestavěný od základu. */
const NEJVIC_VYKLADU = 4000;

/** Prut s místy svých konců a s délkou (kvůli výchozímu zdvihu pístu). */
interface PrutNaMiste {
  prut: PrutNavrhu;
  a: string;
  b: string;
  delka: number;
}

interface Most {
  /** Styčník podle místa. */
  stycniky: Map<string, StycnikNavrhu>;
  pruty: PrutNaMiste[];
  /** Pruty, kterým chybí styčník (poškozený zápis): do tvaru nepatří. */
  bezKoncu: PrutNavrhu[];
}

function rozloz(navrh: NavrhMostu): Most {
  const podleId = new Map(navrh.stycniky.map((s) => [s.id, s]));
  const stycniky = new Map<string, StycnikNavrhu>();
  for (const s of navrh.stycniky) if (!stycniky.has(klicBodu(s))) stycniky.set(klicBodu(s), s);
  const pruty: PrutNaMiste[] = [];
  const bezKoncu: PrutNavrhu[] = [];
  for (const prut of navrh.pruty) {
    const a = podleId.get(prut.a);
    const b = podleId.get(prut.b);
    if (!a || !b) bezKoncu.push(prut);
    else pruty.push({ prut, a: klicBodu(a), b: klicBodu(b), delka: Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y)) });
  }
  return { stycniky, pruty, bezKoncu };
}

/** Nastavení prutu, jak ho zkouška opravdu použije: nezapsaná hodnota je výchozí hodnota prvku. */
function liseSeNastavenim(stary: PrutNaMiste, novy: PrutNaMiste): boolean {
  const a = stary.prut;
  const b = novy.prut;
  const ruzne = (x: number, y: number): boolean => Math.abs(x - y) > STEJNE;
  // Píst, kterému hráč zdvih nenastavil, má výchozí podle délky: že se po posunutí styčníku
  // změní, není hráčovo nastavení. Zdvih nastavený přesně na výchozí hodnotu změna taky není.
  if (a.zdvih !== b.zdvih) {
    const ucinny = (p: PrutNaMiste): number => (p.prut.prvek === "pist" ? zdvihPistu(p.prut.zdvih, p.delka) : (p.prut.zdvih ?? 0));
    if (a.zdvih !== undefined && b.zdvih !== undefined ? ruzne(a.zdvih, b.zdvih) : ruzne(ucinny(stary), ucinny(novy))) return true;
  }
  const tlumeni = (p: PrutNavrhu): number => p.tlumeni ?? KATALOG[p.prvek].tlumeni?.vychozi ?? 0;
  return ruzne(tlumeni(a), tlumeni(b)) || ruzne(a.tuhost ?? 0, b.tuhost ?? 0);
}

function stejnyTlumic(a: StycnikNavrhu | undefined, b: StycnikNavrhu | undefined): boolean {
  const ta = a?.tlumic;
  const tb = b?.tlumic;
  if (!ta || !tb) return !ta && !tb;
  return ta.hmota === tb.hmota && ta.frekvence === tb.frekvence;
}

/** Co se liší na styčníku (svar, zámek, závaží, tlumič); chybějící styčník nemá nic. */
function zmenyStycniku(stary: StycnikNavrhu | undefined, novy: StycnikNavrhu | undefined): ZmenaMostu[] {
  const stycnik = (novy ?? stary)!.id;
  const zmeny: ZmenaMostu[] = [];
  if ((stary?.svar === true) !== (novy?.svar === true)) zmeny.push({ druh: "svar", stycnik });
  if ((stary?.zamek === true) !== (novy?.zamek === true)) zmeny.push({ druh: "zamek", stycnik });
  if ((stary?.zavazi ?? 0) !== (novy?.zavazi ?? 0)) zmeny.push({ druh: "zavazi", stycnik });
  if (!stejnyTlumic(stary, novy)) zmeny.push({ druh: "tlumic", stycnik });
  return zmeny;
}

/** Výklad: kde je v novém mostě styčník, který v původním stál na daném místě. */
type Vyklad = Map<string, string>;

interface Posudek {
  zmeny: ZmenaMostu[];
  /** Pruty původního mostu, které ve výkladu nemají protějšek, a nové pruty bez protějšku. */
  odebrane: PrutNaMiste[];
  pridane: PrutNaMiste[];
}

/** Sečte změny při daném výkladu styčníků. Pořadí: posuny, odebrané, změněné, přidané, napínáky, styčníky. */
function posud(puvodni: Most, novy: Most, vyklad: Vyklad): Posudek {
  const posuny: ZmenaMostu[] = [];
  for (const [bylo, je] of vyklad) if (bylo !== je) posuny.push({ druh: "stycnik-posunut", stycnik: novy.stycniky.get(je)!.id });

  const volne = new Map<string, PrutNaMiste[]>();
  for (const p of novy.pruty) {
    const klic = klicPrutu(p.a, p.b);
    const seznam = volne.get(klic);
    if (seznam) seznam.push(p);
    else volne.set(klic, [p]);
  }
  const odebraneZmeny: ZmenaMostu[] = [];
  const zmenene: ZmenaMostu[] = [];
  const odebrane: PrutNaMiste[] = [];
  let napinaku = 0;
  for (const stary of puvodni.pruty) {
    const a = vyklad.get(stary.a);
    const b = vyklad.get(stary.b);
    const protejsek = a !== undefined && b !== undefined ? volne.get(klicPrutu(a, b))?.shift() : undefined;
    if (!protejsek) {
      odebrane.push(stary);
      odebraneZmeny.push({ druh: "prut-odebran", prut: stary.prut.id });
      continue;
    }
    if (protejsek.prut.prvek !== stary.prut.prvek) zmenene.push({ druh: "prvek", prut: protejsek.prut.id });
    else {
      if (liseSeNastavenim(stary, protejsek)) zmenene.push({ druh: "nastaveni", prut: protejsek.prut.id });
      if (Math.abs((stary.prut.predpeti ?? 0) - (protejsek.prut.predpeti ?? 0)) > STEJNE) napinaku += 1;
    }
  }
  for (const p of puvodni.bezKoncu) odebraneZmeny.push({ druh: "prut-odebran", prut: p.id });
  // Co v novém mostě zbylo bez protějšku, je přidané (i prut nakreslený dvakrát na stejné místo).
  const pridane = novy.pruty.filter((p) => volne.get(klicPrutu(p.a, p.b))?.includes(p));
  const pridaneZmeny: ZmenaMostu[] = pridane.map((p) => ({ druh: "prut-pridan", prut: p.prut.id }));

  // Svary, zámky, závaží a tlumiče: posunutý styčník si je veze s sebou.
  const naStycnicich: ZmenaMostu[] = [];
  const obsazene = new Set<string>();
  for (const [misto, stary] of puvodni.stycniky) {
    const je = vyklad.get(misto);
    if (je !== undefined) obsazene.add(je);
    naStycnicich.push(...zmenyStycniku(stary, je === undefined ? undefined : novy.stycniky.get(je)));
  }
  for (const [misto, s] of novy.stycniky) if (!obsazene.has(misto)) naStycnicich.push(...zmenyStycniku(undefined, s));

  const zmeny = [...posuny, ...odebraneZmeny, ...zmenene, ...pridaneZmeny];
  if (napinaku > 0) zmeny.push({ druh: "napinaky", lan: napinaku });
  zmeny.push(...naStycnicich);
  return { zmeny, odebrane, pridane };
}

/**
 * Posuny, které by při daném výkladu něco vysvětlily: styčník původního mostu s prutem, který
 * nemá protějšek, a místo v novém mostě, kam vede nový prut od téhož souseda. Seřazené podle
 * míst, aby hledání nezáviselo na pořadí zápisu.
 */
function navrhniPosuny(vyklad: Vyklad, posudek: Posudek, pevne: ReadonlySet<string>, obsazenePevnymi: ReadonlySet<string>): [string, string][] {
  const navrhy = new Map<string, [string, string]>();
  for (const stary of posudek.odebrane) {
    for (const [p, x] of [[stary.a, stary.b], [stary.b, stary.a]] as const) {
      if (pevne.has(p)) continue;
      const soused = vyklad.get(x);
      if (soused === undefined) continue;
      for (const pridany of posudek.pridane) {
        const q: string | null = pridany.a === soused ? pridany.b : pridany.b === soused ? pridany.a : null;
        if (q === null || q === soused || vyklad.get(p) === q || obsazenePevnymi.has(q)) continue;
        navrhy.set(`${p}>${q}`, [p, q]);
      }
    }
  }
  return [...navrhy.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([, navrh]) => navrh);
}

/**
 * Čím se `novy` návrh liší od `puvodniho`: nejmenší počet změn, jakým jde rozdíl vyložit.
 * Pořadí: posunuté styčníky, odebrané pruty, pruty změněné na místě, přidané pruty, napínáky,
 * a nakonec svary, zámky, závaží a tlumiče.
 */
export function zmenyMostu(puvodni: NavrhMostu, novy: NavrhMostu): ZmenaMostu[] {
  const stary = rozloz(puvodni);
  const dnesni = rozloz(novy);
  // Základní výklad: styčník, na jehož místě v novém mostě nějaký stojí, se nehnul.
  const zaklad: Vyklad = new Map();
  for (const misto of stary.stycniky.keys()) if (dnesni.stycniky.has(misto)) zaklad.set(misto, misto);

  let nejlepsi = posud(stary, dnesni, zaklad);
  let zbyva = NEJVIC_VYKLADU;
  /** `pevne`: styčníky, o kterých tenhle výklad už rozhodl, že se posunuly; `cile`: kam. */
  const hledej = (vyklad: Vyklad, posudek: Posudek, pevne: Set<string>, cile: Set<string>): void => {
    if (pevne.size >= NEJVIC_POSUNU || pevne.size + 1 >= nejlepsi.zmeny.length) return;
    const moznosti: { vyklad: Vyklad; posudek: Posudek; p: string; q: string }[] = [];
    for (const [p, q] of navrhniPosuny(vyklad, posudek, pevne, cile)) {
      if (zbyva-- <= 0) break;
      const dalsi: Vyklad = new Map(vyklad);
      // Kdo na cílovém místě „stál“, tam už nestojí: buď se posunul taky, nebo zmizel.
      for (const [bylo, je] of dalsi) if (je === q) dalsi.delete(bylo);
      dalsi.set(p, q);
      moznosti.push({ vyklad: dalsi, posudek: posud(stary, dnesni, dalsi), p, q });
    }
    // Nejdřív výklady s nejmenším počtem změn; výklad, který rozdíl zhorší víc než o posun
    // samotný, k lepšímu nevede.
    moznosti.sort((a, b) => a.posudek.zmeny.length - b.posudek.zmeny.length);
    for (const moznost of moznosti) {
      if (moznost.posudek.zmeny.length > posudek.zmeny.length + 1) break;
      if (moznost.posudek.zmeny.length < nejlepsi.zmeny.length) nejlepsi = moznost.posudek;
      pevne.add(moznost.p);
      cile.add(moznost.q);
      hledej(moznost.vyklad, moznost.posudek, pevne, cile);
      pevne.delete(moznost.p);
      cile.delete(moznost.q);
    }
  };
  if (nejlepsi.odebrane.length > 0 && nejlepsi.pridane.length > 0) hledej(zaklad, nejlepsi, new Set(), new Set());
  return nejlepsi.zmeny;
}
