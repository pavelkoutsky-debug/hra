// Změny mezi dvěma návrhy téhož mostu: čím se opravený most liší od původního. Havarijní
// komise (`urovne/havarie/`) dovoluje opravit spadlý most nejvýš několika změnami; tady se
// počítají. Bez prohlížeče.
//
// Změna je to, co hráč udělá jedním tahem nástroje: přidá prut, odebere prut, vymění mu
// materiál, přenastaví ho (zdvih pístu, tlumič), posune styčník, svaří nebo rozvaří styčník,
// dá nebo sebere zámek, závaží nebo laděný tlumič. Napínáky lan se počítají dohromady jako
// jedna změna: tlačítko Dopnout lana je přenastaví všechny naráz.
//
// Počítá se výsledek, ne cesta k němu: stejný opravený most má stejný počet změn, ať k němu
// hráč došel jakkoli. Pruty se proto porovnávají podle místa (souřadnic konců), ne podle id:
// prut smazaný a nakreslený znovu na stejné místo změna není. Posunutý styčník je jedna změna,
// ne dvě za každý jeho prut: pozná se podle id (editor ho při tažení drží) a také podle tvaru
// (styčník smazaný a postavený jinde se stejnými pruty ke stejným sousedům).

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
  /** Styčník posunutý na jiné místo (id je v obou návrzích stejné). */
  | { druh: "stycnik-posunut"; stycnik: number }
  /** Jiný svar, zámek, závaží nebo laděný tlumič ve styčníku (id v novém návrhu, jinak v původním). */
  | { druh: "svar" | "zamek" | "zavazi" | "tlumic"; stycnik: number };

const klicBodu = (s: { x: number; y: number }): string => `${s.x};${s.y}`;
const klicPrutu = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);
/** Napínák se liší, když ho hráč opravdu přenastavil; zaokrouhlení zápisu se nepočítá. */
const STEJNE_PREDPETI = 1e-9;

function liseSeNastavenim(a: PrutNavrhu, b: PrutNavrhu): boolean {
  return a.zdvih !== b.zdvih || a.tlumeni !== b.tlumeni || a.tuhost !== b.tuhost;
}

function stejnyTlumic(a: StycnikNavrhu | undefined, b: StycnikNavrhu | undefined): boolean {
  const ta = a?.tlumic;
  const tb = b?.tlumic;
  if (!ta || !tb) return !ta && !tb;
  return ta.hmota === tb.hmota && ta.frekvence === tb.frekvence;
}

/**
 * Čím se `novy` návrh liší od `puvodniho`. Pořadí: posunuté styčníky, odebrané pruty, pruty
 * změněné na místě, přidané pruty, napínáky, a nakonec svary, zámky, závaží a tlumiče.
 */
export function zmenyMostu(puvodni: NavrhMostu, novy: NavrhMostu): ZmenaMostu[] {
  const zmeny: ZmenaMostu[] = [];
  const stareStycniky = new Map(puvodni.stycniky.map((s) => [s.id, s]));
  const noveStycniky = new Map(novy.stycniky.map((s) => [s.id, s]));
  const obsazeno = new Set(novy.stycniky.map(klicBodu));

  /** Sousedé styčníku na místě `bod`: místa druhých konců jeho prutů (přeložená přes `preloz`). */
  const sousede = (navrh: NavrhMostu, stycniky: Map<number, StycnikNavrhu>, bod: string, preloz: (b: string) => string): string[] => {
    const seznam: string[] = [];
    for (const p of navrh.pruty) {
      const a = stycniky.get(p.a);
      const b = stycniky.get(p.b);
      if (!a || !b) continue;
      if (klicBodu(a) === bod) seznam.push(preloz(klicBodu(b)));
      else if (klicBodu(b) === bod) seznam.push(preloz(klicBodu(a)));
    }
    return seznam.sort();
  };

  // Posunuté styčníky: stejné id, jiné místo, a místo, kde styčník stál, je dnes volné. Id samo
  // nestačí: editor ho po smazání styčníku přidělí prvnímu novému, který s tím starým nemusí
  // mít nic společného. Posunutý styčník si proto musí držet aspoň jeden prut ke stejnému sousedovi.
  /** Kde je v novém návrhu to, co v původním leželo na daném místě. */
  const kdeJe = new Map<string, string>();
  const podleId: StycnikNavrhu[] = [];
  for (const stary of puvodni.stycniky) {
    const dnes = noveStycniky.get(stary.id);
    const bylo = klicBodu(stary);
    if (dnes && klicBodu(dnes) !== bylo && !obsazeno.has(bylo)) {
      kdeJe.set(bylo, klicBodu(dnes));
      podleId.push(stary);
    }
  }
  const dnesni = (bod: string): string => kdeJe.get(bod) ?? bod;
  for (const stary of podleId) {
    const bylo = klicBodu(stary);
    const pred = sousede(puvodni, stareStycniky, bylo, dnesni);
    const po = new Set(sousede(novy, noveStycniky, kdeJe.get(bylo)!, (b) => b));
    if (pred.some((soused) => po.has(soused))) zmeny.push({ druh: "stycnik-posunut", stycnik: stary.id });
    else kdeJe.delete(bylo);
  }

  // Totéž podle tvaru, pro styčník smazaný a postavený jinde (má jiné id): na místě, kde stál,
  // dnes nic není, a jinde přibyl styčník spojený se stejnými sousedy. Výsledek je stejný most
  // jako po posunutí, takže se počítá stejně (jiný materiál jeho prutů je pak výměna prutu).
  const puvodniMista = new Set(puvodni.stycniky.map(klicBodu));
  const cilePosunu = new Set(kdeJe.values());
  const pribyle = novy.stycniky.filter((s) => !puvodniMista.has(klicBodu(s)) && !cilePosunu.has(klicBodu(s)));
  const pouzite = new Set<string>();
  for (const stary of puvodni.stycniky) {
    const bylo = klicBodu(stary);
    if (kdeJe.has(bylo) || obsazeno.has(bylo)) continue;
    const vzor = sousede(puvodni, stareStycniky, bylo, dnesni).join(",");
    if (vzor === "") continue;
    const cil = pribyle.find((s) => !pouzite.has(klicBodu(s)) && sousede(novy, noveStycniky, klicBodu(s), (b) => b).join(",") === vzor);
    if (!cil) continue;
    pouzite.add(klicBodu(cil));
    kdeJe.set(bylo, klicBodu(cil));
    zmeny.push({ druh: "stycnik-posunut", stycnik: stary.id });
  }

  const mistoStareho = (p: PrutNavrhu): string | null => {
    const a = stareStycniky.get(p.a);
    const b = stareStycniky.get(p.b);
    return a && b ? klicPrutu(dnesni(klicBodu(a)), dnesni(klicBodu(b))) : null;
  };
  const mistoNoveho = (p: PrutNavrhu): string | null => {
    const a = noveStycniky.get(p.a);
    const b = noveStycniky.get(p.b);
    return a && b ? klicPrutu(klicBodu(a), klicBodu(b)) : null;
  };
  const novePruty = new Map<string, PrutNavrhu>();
  for (const p of novy.pruty) {
    const misto = mistoNoveho(p);
    if (misto !== null && !novePruty.has(misto)) novePruty.set(misto, p);
  }
  const nalezene = new Set<string>();
  const zmenene: ZmenaMostu[] = [];
  let napinaku = 0;
  for (const stary of puvodni.pruty) {
    const misto = mistoStareho(stary);
    const dnes = misto === null ? undefined : novePruty.get(misto);
    if (misto === null || !dnes || nalezene.has(misto)) {
      zmeny.push({ druh: "prut-odebran", prut: stary.id });
      continue;
    }
    nalezene.add(misto);
    if (dnes.prvek !== stary.prvek) zmenene.push({ druh: "prvek", prut: dnes.id });
    else {
      if (liseSeNastavenim(stary, dnes)) zmenene.push({ druh: "nastaveni", prut: dnes.id });
      if (Math.abs((stary.predpeti ?? 0) - (dnes.predpeti ?? 0)) > STEJNE_PREDPETI) napinaku += 1;
    }
  }
  zmeny.push(...zmenene);
  for (const [misto, p] of novePruty) {
    if (!nalezene.has(misto)) zmeny.push({ druh: "prut-pridan", prut: p.id });
  }
  // Prut nakreslený dvakrát na stejné místo kontrola návrhu odmítá; kdyby tu byl, je přidaný.
  const videne = new Set<string>();
  for (const p of novy.pruty) {
    const misto = mistoNoveho(p);
    if (misto === null) continue;
    if (videne.has(misto)) zmeny.push({ druh: "prut-pridan", prut: p.id });
    videne.add(misto);
  }
  if (napinaku > 0) zmeny.push({ druh: "napinaky", lan: napinaku });

  // Svary, zámky, závaží a tlumiče se porovnávají na místě (posunutý styčník si je veze s sebou).
  const stareNaMiste = new Map<string, StycnikNavrhu>();
  for (const s of puvodni.stycniky) stareNaMiste.set(dnesni(klicBodu(s)), s);
  const noveNaMiste = new Map<string, StycnikNavrhu>();
  for (const s of novy.stycniky) noveNaMiste.set(klicBodu(s), s);
  for (const misto of new Set([...stareNaMiste.keys(), ...noveNaMiste.keys()])) {
    const stary = stareNaMiste.get(misto);
    const dnes = noveNaMiste.get(misto);
    const stycnik = (dnes ?? stary)!.id;
    if ((stary?.svar === true) !== (dnes?.svar === true)) zmeny.push({ druh: "svar", stycnik });
    if ((stary?.zamek === true) !== (dnes?.zamek === true)) zmeny.push({ druh: "zamek", stycnik });
    if ((stary?.zavazi ?? 0) !== (dnes?.zavazi ?? 0)) zmeny.push({ druh: "zavazi", stycnik });
    if (!stejnyTlumic(stary, dnes)) zmeny.push({ druh: "tlumic", stycnik });
  }
  return zmeny;
}
