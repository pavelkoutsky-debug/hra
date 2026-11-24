// Sdílení mostu odkazem: úsporný zápis návrhu do textu, který se vejde do adresy stránky.
//
// Zápis JSON, který dává Export, má u většího mostu několik kilobajtů a v adrese by byl samé
// procento. Kód mostu nese totéž v pár stovkách znaků abecedy, která se v adrese nemění
// (písmena, číslice, pomlčka a podtržítko). Čísla se ukládají přesně (celá úsporně, ostatní
// jako osm bajtů), pořadí styčníků a prutů se zachovává: most z odkazu dá ve zkoušce stejný
// otisk jako originál. Na konci je kontrolní součet, protože odkazy se cestou zkracují
// (zalomení v e-mailu, limit zprávy) a půlka mostu nesmí vypadat jako jiný most.
//
// Bez prohlížeče: stejný kód vyrobí hra i test v Node.

import { KATALOG } from "./katalog";
import { ChybaDat } from "./kontrola";
import { nactiNavrh, VERZE_NAVRHU, type NavrhMostu, type PrutNavrhu, type StycnikNavrhu } from "./navrh";

/** Verze rozložení bajtů v kódu mostu (ne formátu návrhu; ten kód nese zvlášť). */
export const VERZE_KODU_MOSTU = 1;

/**
 * Delší kód hra nečte ani nenabízí (zhruba 600 prutů): největší most kampaně má pod tisíc znaků.
 * Sdílení se ptá `vejdeSeDoOdkazu`, aby hra nikdy nedala odkaz, který sama odmítne.
 */
export const NEJDELSI_KOD_MOSTU = 6000;

/** Jméno parametru adresy, který kód mostu nese. */
export const PARAMETR_MOSTU = "most";

const ABECEDA = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const HODNOTA_ZNAKU = new Map<string, number>([...ABECEDA].map((znak, i) => [znak, i]));

const SVAR = 1;
const ZAMEK = 2;
const ZAVAZI = 4;
const TLUMIC = 8;

const PREDPETI = 1;
const TUHOST = 2;
const TLUMENI = 4;
const ZDVIH = 8;

/** Id styčníků (bit 0) a prutů (bit 1) jdou po řadě od nuly a v kódu nejsou. */
const ID_STYCNIKU_PO_RADE = 1;
const ID_PRUTU_PO_RADE = 2;

function poskozeny(duvod: string): ChybaDat {
  return new ChybaDat("odkaz", `odkaz na most je poškozený nebo neúplný (${duvod})`, "odkaz-poskozeny");
}

/** Kód z novější hry, než je tahle: hráči pomůže načíst stránku znovu, ne prosit o nový odkaz. */
function novejsi(duvod: string): ChybaDat {
  return new ChybaDat("odkaz", duvod, "novejsi-verze");
}

/** Kontrolní součet (FNV-1a, dolních 16 bitů) bajtů `od` až `po`. */
function soucet(bajty: ArrayLike<number>, po: number): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < po; i++) {
    h ^= bajty[i]!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h ^ (h >>> 16)) & 0xffff;
}

class Zapis {
  readonly bajty: number[] = [];
  readonly #pohled = new DataView(new ArrayBuffer(8));

  /** Nezáporné celé číslo po sedmi bitech, nejnižší napřed. */
  cele(n: number): void {
    if (!Number.isSafeInteger(n) || n < 0) throw new Error(`kód mostu neumí zapsat ${n} jako nezáporné celé číslo`);
    let zbytek = n;
    while (zbytek >= 128) {
      this.bajty.push((zbytek % 128) | 128);
      zbytek = Math.floor(zbytek / 128);
    }
    this.bajty.push(zbytek);
  }

  /**
   * Libovolné číslo přesně: celé (většina souřadnic a hmotností) jako sudé číslo s klikatým
   * znaménkem, ostatní jako lichá značka a osm bajtů. Záporná nula jde druhou cestou.
   */
  cislo(n: number): void {
    if (Number.isInteger(n) && Math.abs(n) < 2 ** 40 && !Object.is(n, -0)) {
      this.cele(2 * (n >= 0 ? 2 * n : -2 * n - 1));
      return;
    }
    if (!Number.isFinite(n)) throw new Error("kód mostu nese jen konečná čísla");
    this.cele(1);
    this.#pohled.setFloat64(0, n, true);
    for (let i = 0; i < 8; i++) this.bajty.push(this.#pohled.getUint8(i));
  }

  text(s: string): void {
    this.cele(s.length);
    for (let i = 0; i < s.length; i++) this.cele(s.charCodeAt(i));
  }
}

class Cteni {
  #misto = 0;
  readonly #bajty: Uint8Array;
  readonly #konec: number;
  readonly #pohled = new DataView(new ArrayBuffer(8));

  constructor(bajty: Uint8Array, konec: number) {
    this.#bajty = bajty;
    this.#konec = konec;
  }

  get zbyva(): number {
    return this.#konec - this.#misto;
  }

  #bajt(): number {
    if (this.#misto >= this.#konec) throw poskozeny("končí dřív, než má");
    return this.#bajty[this.#misto++]!;
  }

  cele(): number {
    let n = 0;
    let rad = 1;
    for (let i = 0; i < 8; i++) {
      const b = this.#bajt();
      n += (b & 127) * rad;
      if (b < 128) {
        // Větší číslo by se zaokrouhlilo: jiné id, než jaké most měl, a kód, který nejde zapsat zpátky.
        if (!Number.isSafeInteger(n)) throw poskozeny("číslo je větší, než kód dovoluje");
        return n;
      }
      rad *= 128;
    }
    throw poskozeny("číslo je delší, než kód dovoluje");
  }

  cislo(): number {
    const n = this.cele();
    if (n % 2 === 0) {
      const klikate = n / 2;
      return klikate % 2 === 0 ? klikate / 2 : -(klikate + 1) / 2;
    }
    if (n !== 1) throw poskozeny("neznámá značka čísla");
    for (let i = 0; i < 8; i++) this.#pohled.setUint8(i, this.#bajt());
    const hodnota = this.#pohled.getFloat64(0, true);
    if (!Number.isFinite(hodnota)) throw poskozeny("číslo není konečné");
    return hodnota;
  }

  /** Počet položek, z nichž každá zabere aspoň `nejmene` bajtů: víc, než se do zbytku vejde, je chyba. */
  pocet(nejmene: number): number {
    const n = this.cele();
    if (n * nejmene > this.zbyva) throw poskozeny("slibuje víc položek, než obsahuje");
    return n;
  }

  text(): string {
    const delka = this.pocet(1);
    let s = "";
    for (let i = 0; i < delka; i++) {
      const kod = this.cele();
      if (kod > 0xffff) throw poskozeny("neplatný znak");
      s += String.fromCharCode(kod);
    }
    return s;
  }
}

function naZnaky(bajty: readonly number[]): string {
  let text = "";
  for (let i = 0; i < bajty.length; i += 3) {
    const a = bajty[i]!;
    const b = bajty[i + 1];
    const c = bajty[i + 2];
    text += ABECEDA[a >> 2]!;
    text += ABECEDA[((a & 3) << 4) | ((b ?? 0) >> 4)]!;
    if (b !== undefined) text += ABECEDA[((b & 15) << 2) | ((c ?? 0) >> 6)]!;
    if (c !== undefined) text += ABECEDA[c & 63]!;
  }
  return text;
}

function zeZnaku(text: string): Uint8Array {
  if (text.length % 4 === 1) throw poskozeny("chybí mu konec");
  const bajty = new Uint8Array(Math.floor((text.length * 3) / 4));
  let misto = 0;
  for (let i = 0; i < text.length; i += 4) {
    const ctverice: number[] = [];
    for (let j = i; j < Math.min(i + 4, text.length); j++) {
      const hodnota = HODNOTA_ZNAKU.get(text[j]!);
      if (hodnota === undefined) throw poskozeny("obsahuje znak, který do něj nepatří");
      ctverice.push(hodnota);
    }
    const [a, b, c, d] = ctverice as [number, number, number?, number?];
    bajty[misto++] = (a << 2) | (b >> 4);
    if (c !== undefined) bajty[misto++] = ((b & 15) << 4) | (c >> 2);
    if (d !== undefined) bajty[misto++] = ((c! & 3) << 6) | d;
  }
  return bajty;
}

/**
 * Zapíše most do kódu pro adresu. `rozkodujMost` z něj vrátí most, který se od původního liší
 * nejvýš tím, že nenese vypnuté přepínače (`svar: false` je totéž co žádný svar).
 */
export function zakodujMost(navrh: NavrhMostu): string {
  const z = new Zapis();
  z.cele(VERZE_KODU_MOSTU);
  z.cele(navrh.verze);
  z.text(navrh.uroven);

  const prvky = [...new Set(navrh.pruty.map((p) => p.prvek))];
  z.cele(prvky.length);
  for (const prvek of prvky) z.text(prvek);

  const stycnikyPoRade = navrh.stycniky.every((s, i) => s.id === i);
  const prutyPoRade = navrh.pruty.every((p, i) => p.id === i);
  z.cele((stycnikyPoRade ? ID_STYCNIKU_PO_RADE : 0) | (prutyPoRade ? ID_PRUTU_PO_RADE : 0));

  const poradiStycniku = new Map<number, number>();
  z.cele(navrh.stycniky.length);
  navrh.stycniky.forEach((s, i) => {
    poradiStycniku.set(s.id, i);
    z.cislo(s.x);
    z.cislo(s.y);
    z.cele((s.svar ? SVAR : 0) | (s.zamek ? ZAMEK : 0) | (s.zavazi !== undefined ? ZAVAZI : 0) | (s.tlumic !== undefined ? TLUMIC : 0));
    if (s.zavazi !== undefined) z.cislo(s.zavazi);
    if (s.tlumic !== undefined) {
      z.cislo(s.tlumic.hmota);
      z.cislo(s.tlumic.frekvence);
    }
    if (!stycnikyPoRade) z.cele(s.id);
  });

  z.cele(navrh.pruty.length);
  for (const p of navrh.pruty) {
    const a = poradiStycniku.get(p.a);
    const b = poradiStycniku.get(p.b);
    if (a === undefined || b === undefined) throw new ChybaDat("navrh.pruty", "prut vede do styčníku, který v návrhu není");
    z.cele(a);
    z.cele(b);
    z.cele(prvky.indexOf(p.prvek));
    z.cele(
      (p.predpeti !== undefined ? PREDPETI : 0) |
        (p.tuhost !== undefined ? TUHOST : 0) |
        (p.tlumeni !== undefined ? TLUMENI : 0) |
        (p.zdvih !== undefined ? ZDVIH : 0),
    );
    if (p.predpeti !== undefined) z.cislo(p.predpeti);
    if (p.tuhost !== undefined) z.cislo(p.tuhost);
    if (p.tlumeni !== undefined) z.cislo(p.tlumeni);
    if (p.zdvih !== undefined) z.cislo(p.zdvih);
    if (!prutyPoRade) z.cele(p.id);
  }

  const kontrola = soucet(z.bajty, z.bajty.length);
  z.bajty.push(kontrola & 255, kontrola >> 8);
  return naZnaky(z.bajty);
}

/**
 * Přečte most z kódu. Poškozený nebo zkrácený kód odmítne (`ChybaDat` s kódem
 * `odkaz-poskozeny`), kód z novější hry také (`novejsi-verze`); vnitřní stavbu mostu pak
 * zkontroluje `nactiNavrh` stejně jako u Importu. Pravidla úrovně hlídá až `zkontrolujNavrh`.
 */
export function rozkodujMost(kod: string): NavrhMostu {
  if (kod.length > NEJDELSI_KOD_MOSTU) throw poskozeny("je delší, než hra čte");
  const bajty = zeZnaku(kod);
  if (bajty.length < 4) throw poskozeny("je příliš krátký");
  const konec = bajty.length - 2;
  if (soucet(bajty, konec) !== (bajty[konec]! | (bajty[konec + 1]! << 8))) throw poskozeny("nesedí kontrolní součet");

  const c = new Cteni(bajty, konec);
  const verzeKodu = c.cele();
  if (verzeKodu > VERZE_KODU_MOSTU) throw novejsi(`odkaz je z novější verze hry (kód mostu verze ${verzeKodu})`);
  if (verzeKodu < 1) throw poskozeny("neznámá verze");
  const verze = c.cele();
  if (verze > VERZE_NAVRHU) throw novejsi(`most je z novější verze hry (formát návrhu ${verze})`);
  const uroven = c.text();

  const prvky: string[] = [];
  const druhu = c.pocet(2);
  for (let i = 0; i < druhu; i++) {
    const prvek = c.text();
    // Prvek, který katalog nezná, přibyl v novější hře (nebo z ní zmizel): kód poškozený není.
    if (!Object.hasOwn(KATALOG, prvek)) throw novejsi(`most používá prvek „${prvek}“, který tahle verze hry nezná`);
    prvky.push(prvek);
  }

  const priznaky = c.cele();
  // Bit, který tahle verze nezná, nese pole návrhu přidané později: číst dál by znamenalo
  // přečíst jeho hodnotu jako něco jiného.
  if ((priznaky & ~(ID_STYCNIKU_PO_RADE | ID_PRUTU_PO_RADE)) !== 0) throw novejsi("most má příznaky, které tahle verze hry nezná");
  const stycnikyPoRade = (priznaky & ID_STYCNIKU_PO_RADE) !== 0;
  const prutyPoRade = (priznaky & ID_PRUTU_PO_RADE) !== 0;

  const stycniky: StycnikNavrhu[] = [];
  const pocetStycniku = c.pocet(3);
  for (let i = 0; i < pocetStycniku; i++) {
    const s: StycnikNavrhu = { id: i, x: c.cislo(), y: c.cislo() };
    const co = c.cele();
    if ((co & ~(SVAR | ZAMEK | ZAVAZI | TLUMIC)) !== 0) throw novejsi("styčník má vlastnost, kterou tahle verze hry nezná");
    if (co & SVAR) s.svar = true;
    if (co & ZAMEK) s.zamek = true;
    if (co & ZAVAZI) s.zavazi = c.cislo();
    if (co & TLUMIC) s.tlumic = { hmota: c.cislo(), frekvence: c.cislo() };
    if (!stycnikyPoRade) s.id = c.cele();
    stycniky.push(s);
  }

  const pruty: Record<string, unknown>[] = [];
  const pocetPrutu = c.pocet(4);
  for (let i = 0; i < pocetPrutu; i++) {
    const a = stycniky[c.cele()];
    const b = stycniky[c.cele()];
    const prvek = prvky[c.cele()];
    if (!a || !b || prvek === undefined) throw poskozeny("prut odkazuje mimo most");
    const p: Record<string, unknown> = { id: i, a: a.id, b: b.id, prvek };
    const co = c.cele();
    if ((co & ~(PREDPETI | TUHOST | TLUMENI | ZDVIH)) !== 0) throw novejsi("prut má vlastnost, kterou tahle verze hry nezná");
    if (co & PREDPETI) p.predpeti = c.cislo();
    if (co & TUHOST) p.tuhost = c.cislo();
    if (co & TLUMENI) p.tlumeni = c.cislo();
    if (co & ZDVIH) p.zdvih = c.cislo();
    if (!prutyPoRade) p.id = c.cele();
    pruty.push(p);
  }
  if (c.zbyva !== 0) throw poskozeny("má na konci něco navíc");

  // Kontrolu typů, rozsahů a souvislostí (i převod staršího formátu návrhu) dělá čtení návrhu.
  return nactiNavrh({ verze, uroven, stycniky, pruty });
}

/** Most beze změny, jen bez vypnutých přepínačů: takový vrátí `rozkodujMost(zakodujMost(navrh))`. */
export function mostBezVypnutych(navrh: NavrhMostu): NavrhMostu {
  return {
    ...navrh,
    stycniky: navrh.stycniky.map((s) => {
      const { svar, zamek, ...zbytek } = s;
      return { ...zbytek, ...(svar ? { svar: true } : {}), ...(zamek ? { zamek: true } : {}) };
    }),
    pruty: navrh.pruty.map((p): PrutNavrhu => ({ ...p })),
  };
}

/** Odkaz, který most otevře v jeho úrovni: adresa hry (`zaklad`, bez dotazu) a dva parametry. */
export function odkazNaMost(zaklad: string, navrh: NavrhMostu): string {
  const bezDotazu = zaklad.replace(/[?#].*$/, "");
  return `${bezDotazu}?uroven=${encodeURIComponent(navrh.uroven)}&${PARAMETR_MOSTU}=${zakodujMost(navrh)}`;
}

/**
 * Kód mostu z adresy, jak ho předala aplikace, kterou odkaz prošel: bez mezer a zalomení
 * uvnitř a bez interpunkce, která se k odkazu přilepila na konci věty (tečka, závorka).
 */
export function ocistiKodMostu(kod: string): string {
  return kod.replace(/\s+/g, "").replace(/[^A-Za-z0-9_-]+$/, "");
}

/**
 * Najde kód mostu v textu, který hráč vložil do Importu: celý odkaz, jeho konec, nebo kód sám.
 * Vrací null, když text jako odkaz ani kód nevypadá (pak je to nejspíš zápis JSON z Exportu).
 */
export function kodMostuVTextu(text: string): string | null {
  const cisty = text.trim();
  const vOdkazu = new RegExp(`[?&]${PARAMETR_MOSTU}=([A-Za-z0-9_-]+)`).exec(cisty);
  if (vOdkazu) return vOdkazu[1]!;
  // Samotný kód: jen když mu sedí kontrolní součet. Obyčejné slovo („mostovka“) kód není
  // a Import o něm má říct, že to není most, ne že je odkaz poškozený.
  if (!/^[A-Za-z0-9_-]{8,}$/.test(cisty)) return null;
  try {
    const bajty = zeZnaku(cisty);
    const konec = bajty.length - 2;
    return bajty.length >= 4 && soucet(bajty, konec) === (bajty[konec]! | (bajty[konec + 1]! << 8)) ? cisty : null;
  } catch {
    return null;
  }
}

/** Vejde se most do odkazu, který hra zase přečte? Větší most (nebo id mimo rozsah) odkaz nedostane. */
export function vejdeSeDoOdkazu(navrh: NavrhMostu): boolean {
  try {
    return zakodujMost(navrh).length <= NEJDELSI_KOD_MOSTU;
  } catch {
    return false;
  }
}

/** Jak si most stojí proti výzvě z odkazu. */
export type StavVyzvyOdkazu = "vyhra" | "shoda" | "prohra" | "nepocita";

/**
 * Porovná cenu mostu s cenou soupeřova mostu z odkazu. Porovnává se v celých korunách, jak je
 * hráč vidí; vyhrává jen most ostře levnější. `pocitaSe` je false u mostu, který neprošel
 * nebo se na něm něco porušilo (stejné pravidlo jako u rekordů výzev).
 */
export function stavVyzvyOdkazu(cena: number, cil: number, pocitaSe: boolean): { stav: StavVyzvyOdkazu; rozdil: number } {
  const rozdil = Math.abs(Math.round(cena) - Math.round(cil));
  if (!pocitaSe) return { stav: "nepocita", rozdil };
  if (Math.round(cena) < Math.round(cil)) return { stav: "vyhra", rozdil };
  return { stav: Math.round(cena) === Math.round(cil) ? "shoda" : "prohra", rozdil };
}
