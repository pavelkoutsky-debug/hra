// Případ 9-02 Havarijní komise (kapitola 2): ocelová lávka přes údolí úrovně 2-03, 32 m.
// Přes lávku jde čestná jednotka, 24 vojáků v kroku 2,3 Hz. Nad lávkou ani hlouběji než metr
// pod ní stavět nejde (zóny úrovně 2-03); paleta je proti 2-03 rozšířená o těžký ocelový profil,
// aby šla zkusit slepá oprava „těžší pruty“.
//
// Most: dřevěná mostovka po čtyřech metrech a nad ní metr vysoká Warrenova příhrada z lehkého
// profilu (horní styčníky nad středy polí). Prázdná kmitá na 2,76 Hz, s vojáky na 2,24 Hz, tedy
// přímo v kroku jednotky. Stavitel to věděl a zavěsil dvě dvoutunová závaží, jenže do styčníků
// mostovky u opěr (x = 4 a 28), kam se dobře přijíždí. Tam se most při prvním tvaru kmitání skoro
// nehýbe, takže závaží frekvenci skoro nezmění (2,64 Hz, s vojáky 2,19 Hz).
//
// Co hráč uvidí: nic nepovolí (nejvíc 24 %), nikdo nespadne, ale lávka se pod jednotkou
// rozhoupe; kmitání překročí mez 2,5 m/s² v 8,4 s a vrcholí na 4,1 m/s² (1,66× mez). Most
// „neobstál kvůli kmitání“, příčina je krok útvaru.
//
// Oprava komise (3 změny): obě závaží přenést od opěr doprostřed rozpětí (styčníky 12 a 20 m),
// kde most kmitá nejvíc, a mezi ně zavěsit třetí (16 m). Přenesené závaží je jedna změna. Vlastní
// frekvence klesne pod krok jednotky a kmitání je 1,59 m/s² (0,64× mez). Projde i ponechání
// závaží u opěr a tři nová uprostřed (1,44 m/s²); jen dvě přenesená vedle sebe (12 a 16 m) projdou
// těsně (2,47 m/s²), přenesená na 12 a 20 m bez třetího ne (2,99 m/s²).
//
// Slepé opravy: těžký profil v horním pásu (most je tužší i těžší a frekvence skoro stejná),
// další dvě závaží blíž k opěrám (8 a 24 m), závaží přenesená jen o pole dál (8 a 24 m) a jediné
// závaží uprostřed (frekvence klesne na 2,33 Hz, s vojáky 2,03 Hz, a krok jednotky zůstává
// v rezonanci).

import type { PripadHavarie } from "../../src/data/havarie";
import type { IdPrvku } from "../../src/data/katalog";
import { Kreslic } from "../../src/data/kreslic";
import type { NavrhMostu } from "../../src/data/navrh";
import { urovenPripadu } from "./pomoc";

const O: IdPrvku = "ocel-lehka";
const TO: IdPrvku = "ocel-tezka";

const uroven = urovenPripadu(2, "Lávka u kasáren", "2-03", {
  povolenePrvky: ["mostovka-drevo", O, TO],
});

const ROZPETI = 32;
const POLE = 4;
const VYSKA = 1;
/** Závaží, jak je zavěsil stavitel: do styčníků mostovky u opěr. */
const ZAVAZI_U_OPER: readonly [number, number][] = [
  [4, 2000],
  [28, 2000],
];

interface Upravy {
  /** Závaží navíc ([x styčníku mostovky, kg]). */
  zavazi?: readonly [number, number][];
  /** Kam se přenesla závaží od opěr (místo x = 4 a 28); bez toho zůstávají, kde je stavitel zavěsil. */
  prenesena?: readonly [number, number];
  /** Prvek dílů horního pásu podle x jejich levého konce. */
  pas?: Readonly<Record<number, IdPrvku>>;
}

/** Lávka od začátku: vlastní kreslič, aby každý most měl svá pole. */
function lavka(upravy: Upravy = {}): NavrhMostu {
  const k = new Kreslic(uroven.id);
  for (let x = 0; x < ROZPETI; x += POLE) k.prut("mostovka-drevo", [x, 0], [x + POLE, 0]);
  for (let x = 0; x < ROZPETI; x += POLE) {
    const vrchol: [number, number] = [x + POLE / 2, VYSKA];
    k.prut(O, [x, 0], vrchol);
    k.prut(O, vrchol, [x + POLE, 0]);
    if (x + POLE < ROZPETI) k.prut(upravy.pas?.[vrchol[0]] ?? O, vrchol, [vrchol[0] + POLE, VYSKA]);
  }
  const puvodni: readonly [number, number][] = upravy.prenesena ? ZAVAZI_U_OPER.map(([, kg], i) => [upravy.prenesena![i]!, kg]) : ZAVAZI_U_OPER;
  for (const [x, kg] of [...puvodni, ...(upravy.zavazi ?? [])]) k.bod(x, 0, { zavazi: kg });
  return k.navrh();
}

export const pripad02: PripadHavarie = {
  uroven,
  kapitola: "2",
  most: lavka(),
  oprava: lavka({ prenesena: [12, 20], zavazi: [[16, 2000]] }),
  slepe: [
    { nazev: "těžký profil v horním pásu uprostřed", navrh: lavka({ pas: { 10: TO, 14: TO, 18: TO } }) },
    {
      nazev: "další závaží blíž k opěrám",
      navrh: lavka({
        zavazi: [
          [8, 2000],
          [24, 2000],
        ],
      }),
    },
    { nazev: "závaží přenesená jen o pole dál", navrh: lavka({ prenesena: [8, 24] }) },
    { nazev: "jediné závaží uprostřed", navrh: lavka({ zavazi: [[16, 2000]] }) },
  ],
};
