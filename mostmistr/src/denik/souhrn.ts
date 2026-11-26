// Souhrn deníku hraní: z dávek událostí spočítá, jak se která úroveň hraje. Slouží stránce
// správce a ladění obtížnosti: kolik hráčů úroveň otevřelo, kolik ji prošlo, na kolikátý
// pokus, za jak dlouho, za kolik, z čeho stavěli a na čem mosty nejčastěji padají.
//
// Počítá se ve dvou krocích. Z dávek vznikne „výtah“: co se o kterém hráči ve které úrovni
// ví. Výtahy jdou sloučit (víc dní, den zpracovaný po částech), a teprve z výtahu se dělá
// souhrn s počty a mediány. Server si výtah každého dne ukládá i s tím, kam v dávkách došel,
// takže souhrn nečte znovu to, co už započítal.
//
// Čisté funkce bez prohlížeče i serveru; události se čtou opatrně, protože deník starší
// verze hry může mít jiná data.

import { ID_PRVKU } from "../data/katalog";
import { DRUHY_RADY } from "../hra/radaPoNezdaru";
import type { DavkaDeniku, HodnotaDeniku, UdalostDeniku } from "./udalosti";

export interface SouhrnUrovne {
  uroven: string;
  /** Kolik různých hráčů úroveň otevřelo a kolikrát celkem. */
  hracu: number;
  otevreni: number;
  /** Zkoušky s provozem (pokusy s brnknutím a budičem se nepočítají) a kolik jich prošlo. */
  zkousek: number;
  pruchodu: number;
  /** Hráči, kterým aspoň jedna zkouška prošla, a hráči, kteří úroveň otevřeli a nic nezkusili. */
  hracuSPruchodem: number;
  hracuBezZkousky: number;
  /** Medián počtu zkoušek do prvního průchodu a minut strávených v úrovni do něj; null bez průchodu. */
  zkousekDoPruchodu: number | null;
  minutDoPruchodu: number | null;
  /** Kolik hráčů získalo kterou medaili. */
  medaile: { pruchod: number; rozpocet: number; mistrovska: number };
  /** Cena nejlevnějšího mostu, který prošel, a medián nejlevnějších průchodů hráčů; null bez průchodu. */
  nejlevnejsiPruchod: number | null;
  cenaPruchodu: number | null;
  /** Z čeho se stavělo: prvek a kolik prutů z něj hráči nakreslili, od nejčastějšího. */
  prvky: Record<string, number>;
  /** Na čem mosty padaly: „prvek/způsob“ prvního porušení a kolikrát; „bez porušení“, když se nic nezlomilo. */
  selhani: Record<string, number>;
  /** Kolik hráčů si otevřelo nápovědu a kolik z nich si nechalo ukázat i obrys mostu. */
  hracuSNapovedou: number;
  hracuSObrysem: number;
  /** Kolik hráčů zkusilo zkoušku do zlomu a kolik těch zkoušek bylo. */
  hracuDoZlomu: number;
  zkousekDoZlomu: number;
  /**
   * Rada po druhém stejném nezdaru (`rada.ukazana`): kolikrát zazněla která („prvek/způsob“
   * u porušení, jinak druh), kolik hráčů ji vidělo, kolik z nich úroveň potom prošlo, medián
   * zkoušek od rady do průchodu a kolik hráčů z rady otevřelo nápovědu.
   */
  rady: Record<string, number>;
  hracuSRadou: number;
  hracuSRadouPrusli: number;
  zkousekPoRade: number | null;
  hracuNapovedaZRady: number;
}

export interface SouhrnDeniku {
  hracu: number;
  sezeni: number;
  /** Hráči, kteří přišli poprvé, a hráči na dotykovém zařízení. */
  novych: number;
  dotykovych: number;
  udalosti: number;
  /** Chyby hlášené prohlížečem a odeslané zpětné vazby. */
  chyb: number;
  vazeb: number;
  /** Hráči, kteří si záznam hraní vypnuli a do konce období ho znovu nezapnuli. */
  vypnuli: number;
  /** Nejčastější chyby: text a počet, nejvýš deset. */
  chyby: { zprava: string; pocet: number }[];
  urovne: SouhrnUrovne[];
}

/** Co se o jednom hráči v jedné úrovni ví. */
export interface HracVUrovni {
  otevreni: number;
  zkousek: number;
  pruchodu: number;
  /** Zkoušek a sekund do prvního průchodu; null, dokud žádný není. */
  zkousekDoPruchodu: number | null;
  sekundDoPruchodu: number | null;
  /** Sekundy z ukončených návštěv úrovně (z událostí o jejím opuštění). */
  sekundDriv: number;
  medaile: { pruchod: boolean; rozpocet: boolean; mistrovska: boolean };
  /** Cena nejlevnějšího mostu, se kterým hráč prošel; null bez průchodu. */
  nejlevnejsi: number | null;
  /**
   * Nejvyšší krok nápovědy, který hráč použil (0 žádný, 1 soupis, 2 obrys), a počet zkoušek
   * do zlomu. Starší uložené výtahy tyhle údaje nemají, proto jsou volitelné.
   */
  napoveda?: number;
  zlomu?: number;
  /**
   * Kolik zkoušek měl hráč za sebou, když poprvé uviděl radu po druhém stejném nezdaru (null:
   * žádnou), a jestli z ní otevřel nápovědu. Starší výtahy je nemají.
   */
  radaZkousek?: number | null;
  radaNapoveda?: boolean;
}

export interface HracVeVytahu {
  sezeni: string[];
  novy: boolean;
  dotyk: boolean;
  /** Poslední, co hráč se záznamem udělal: true vypnul, false znovu zapnul, null nic z toho. */
  vypnul: boolean | null;
}

export const VERZE_VYTAHU = 2;
/**
 * Nejvíc různých textů chyb, které si výtah pamatuje; další se sčítají pod „ostatní“. Strop
 * chrání výtah před zahlcením vymyšlenými daty; běžný den k němu nedojde. Nad ním už sloučení
 * výtahů nedává přesně totéž co výpočet najednou (záleží na pořadí, v jakém chyby přišly).
 */
const NEJVIC_CHYB_VE_VYTAHU = 200;
const OSTATNI_CHYBY = "ostatní";
/** Nejdelší text chyby, který se počítá zvlášť, a meze údajů, kterým souhrn věří. */
const NEJDELSI_CHYBA = 120;
const NEJVIC_SEKUND = 2 * 86_400;
const NEJVETSI_CENA = 1e10;
const NEJVIC_DILU = 40;

// Deník plní kdokoli, kdo umí poslat žádost: souhrn proto bere jen hodnoty, které hra opravdu
// posílá (známé prvky a způsoby porušení, časy a ceny v rozumných mezích).
const ZNAME_PRVKY: ReadonlySet<string> = new Set<string>(ID_PRVKU);
const ZNAME_ZPUSOBY: ReadonlySet<string> = new Set(["tah", "tlak", "ohyb", "smyk", "vzper"]);
const ZNAME_RADY: ReadonlySet<string> = new Set<string>(DRUHY_RADY);

/**
 * Výtah z deníku: mezivýsledek, který jde slučovat. Vše je po hráčích, takže sloučením
 * výtahů dvou dnů vyjdou počty různých hráčů správně.
 */
export interface VytahDeniku {
  verze: number;
  hraci: Record<string, HracVeVytahu>;
  udalosti: number;
  chyb: number;
  vazeb: number;
  chyby: Record<string, number>;
  /** úroveň → hráč → co se o něm ví */
  urovne: Record<string, Record<string, HracVUrovni>>;
  /** úroveň → důvod pádu → kolikrát */
  selhani: Record<string, Record<string, number>>;
  /** úroveň → prvek → kolik prutů z něj hráči nakreslili */
  prvky: Record<string, Record<string, number>>;
  /** úroveň → rada („prvek/způsob“ nebo druh) → kolikrát se ukázala; starší výtahy ho nemají */
  rady?: Record<string, Record<string, number>>;
}

function median(hodnoty: number[]): number | null {
  if (hodnoty.length === 0) return null;
  const serazene = [...hodnoty].sort((a, b) => a - b);
  const stred = serazene.length >> 1;
  return serazene.length % 2 === 1 ? serazene[stred]! : (serazene[stred - 1]! + serazene[stred]!) / 2;
}

const cisloZ = (h: HodnotaDeniku | undefined): number => (typeof h === "number" && Number.isFinite(h) ? h : 0);
/** Číslo v mezích; mimo ně (i záporné) nula. */
const vMezich = (h: HodnotaDeniku | undefined, nejvic: number): number => {
  const hodnota = cisloZ(h);
  return hodnota > 0 && hodnota <= nejvic ? hodnota : 0;
};
const znamyPrvek = (h: HodnotaDeniku | undefined): string | null => (typeof h === "string" && ZNAME_PRVKY.has(h) ? h : null);
const anoZ = (h: HodnotaDeniku | undefined): boolean => h === true;
const textZ = (h: HodnotaDeniku | undefined): string | null => (typeof h === "string" ? h : null);

/**
 * Slovník bez zděděných klíčů: čísla hráčů, id úrovní a texty chyb jsou cizí data a nesmějí
 * se potkat s vlastnostmi Object.prototype („constructor“, „__proto__“).
 */
function slovnik<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>;
}

export function prazdnyVytah(): VytahDeniku {
  return {
    verze: VERZE_VYTAHU,
    hraci: slovnik(),
    udalosti: 0,
    chyb: 0,
    vazeb: 0,
    chyby: slovnik(),
    urovne: slovnik(),
    selhani: slovnik(),
    prvky: slovnik(),
    rady: slovnik(),
  };
}

const jeObjekt = (h: unknown): h is Record<string, unknown> => typeof h === "object" && h !== null && !Array.isArray(h);

/** Vypadá hodnota z úložiště jako výtah této verze? */
export function jeVytah(h: unknown): h is VytahDeniku {
  if (!jeObjekt(h)) return false;
  return (
    h.verze === VERZE_VYTAHU &&
    jeObjekt(h.hraci) &&
    jeObjekt(h.urovne) &&
    jeObjekt(h.selhani) &&
    jeObjekt(h.prvky) &&
    (h.rady === undefined || jeObjekt(h.rady)) &&
    jeObjekt(h.chyby) &&
    typeof h.udalosti === "number" &&
    typeof h.chyb === "number" &&
    typeof h.vazeb === "number"
  );
}

function pricti(kam: Record<string, number>, klic: string, kolik: number): void {
  kam[klic] = (kam[klic] ?? 0) + kolik;
}

/** Přičte chybu; když je různých textů moc, sčítá další pod společný klíč. */
function prictiChybu(chyby: Record<string, number>, zprava: string, kolik: number): void {
  if (zprava in chyby || Object.keys(chyby).length < NEJVIC_CHYB_VE_VYTAHU) pricti(chyby, zprava, kolik);
  else pricti(chyby, OSTATNI_CHYBY, kolik);
}

function novyHracVUrovni(): HracVUrovni {
  return {
    otevreni: 0,
    zkousek: 0,
    pruchodu: 0,
    zkousekDoPruchodu: null,
    sekundDoPruchodu: null,
    sekundDriv: 0,
    medaile: { pruchod: false, rozpocet: false, mistrovska: false },
    nejlevnejsi: null,
    napoveda: 0,
    zlomu: 0,
    radaZkousek: null,
    radaNapoveda: false,
  };
}

const novyHrac = (): HracVeVytahu => ({ sezeni: [], novy: false, dotyk: false, vypnul: null });

/** Porovnání dvou textů po znacích (stejné, jakým se řadí klíče v úložišti). */
const poradiTextu = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Výtah z dávek deníku. Dávky nemusejí být seřazené; řadí se podle času, kdy je server
 * přijal (dávky ze serveru ho nesou v `prijato`), pak podle hráče, začátku sezení (podle
 * hodin hráče) a pořadí: tak jdou za sebou i klíče dávek v úložišti. Dávky jednoho sezení
 * se navíc vrátí do pořadí, v jakém je hra číslovala (při odchodu ze stránky může pozdější
 * dávka dorazit dřív), a dávka, která přišla dvakrát (server ji uložil, ale odpověď se ke
 * hře nedostala, takže ji poslala znovu), se počítá jednou. Obojí jen mezi dávkami, které
 * dostane tahle funkce najednou. Na pořadí záleží u „zkoušek do prvního průchodu“ a u vypnutí záznamu.
 */
export function vytahDeniku(davky: readonly (DavkaDeniku & { prijato?: string })[]): VytahDeniku {
  const serazene = [...davky].sort(
    (a, b) =>
      poradiTextu(typeof a.prijato === "string" ? a.prijato : "", typeof b.prijato === "string" ? b.prijato : "") ||
      poradiTextu(a.hlavicka.hrac, b.hlavicka.hrac) ||
      (a.hlavicka.zacatek ?? 0) - (b.hlavicka.zacatek ?? 0) ||
      poradiTextu(a.hlavicka.sezeni, b.hlavicka.sezeni) ||
      a.poradi - b.poradi,
  );
  // Dávky téhož sezení do pořadí podle čísla dávky; místa v celkovém pořadí si sezení ponechá.
  const mistaSezeni = new Map<string, number[]>();
  serazene.forEach((d, i) => {
    const klic = `${d.hlavicka.hrac}/${d.hlavicka.sezeni}`;
    const mista = mistaSezeni.get(klic);
    if (mista) mista.push(i);
    else mistaSezeni.set(klic, [i]);
  });
  for (const mista of mistaSezeni.values()) {
    if (mista.length < 2) continue;
    const davkySezeni = mista.map((i) => serazene[i]!).sort((a, b) => a.poradi - b.poradi);
    mista.forEach((misto, j) => (serazene[misto] = davkySezeni[j]!));
  }
  const v = prazdnyVytah();
  /** Otisky dávek, které už se započetly: stejné sezení, číslo, počet událostí a jejich časy. */
  const zapoctene = new Set<string>();

  const zpracuj = (hrac: string, oHraci: HracVeVytahu, u: UdalostDeniku): void => {
    v.udalosti += 1;
    const data = u.data ?? {};
    if (u.druh === "sezeni.start" && !anoZ(data.navrat)) oHraci.novy = true;
    else if (u.druh === "denik.vypnut") oHraci.vypnul = true;
    else if (u.druh === "denik.zapnut") oHraci.vypnul = false;
    else if (u.druh === "chyba") {
      v.chyb += 1;
      prictiChybu(v.chyby, (textZ(data.zprava) ?? "neznámá chyba").slice(0, NEJDELSI_CHYBA), 1);
    } else if (u.druh === "vazba.odeslana") v.vazeb += 1;
    if (u.uroven === undefined) return;
    const hraciUrovne = (v.urovne[u.uroven] ??= slovnik());
    const zaznam = (hraciUrovne[hrac] ??= novyHracVUrovni());
    if (u.druh === "uroven.otevrena") zaznam.otevreni += 1;
    else if (u.druh === "uroven.opustena") zaznam.sekundDriv += vMezich(data.sekund, NEJVIC_SEKUND);
    else if (u.druh === "stavba.zmena" && data.co === "prut") {
      const prvek = znamyPrvek(data.prvek);
      // Dlouhý tah rozdělený na díly dal víc prutů najednou.
      if (prvek !== null) pricti((v.prvky[u.uroven] ??= slovnik()), prvek, Math.max(1, Math.round(vMezich(data.dilu, NEJVIC_DILU))));
    } else if (u.druh === "napoveda") {
      // Nápověda: krok 1 je soupis mostu, krok 2 jeho obrys. Jiné hodnoty hra neposílá.
      const krok = data.krok === 2 ? 2 : data.krok === 1 ? 1 : 0;
      zaznam.napoveda = Math.max(zaznam.napoveda ?? 0, krok);
    } else if (u.druh === "rada.ukazana" || u.druh === "rada.napoveda") {
      // Rada po druhém stejném nezdaru: jen druhy, které hra posílá; prvek jen známý.
      const druh = textZ(data.druh);
      if (druh === null || !ZNAME_RADY.has(druh)) return;
      if (u.druh === "rada.napoveda") zaznam.radaNapoveda = true;
      else {
        const prvek = znamyPrvek(data.prvek);
        pricti(((v.rady ??= slovnik())[u.uroven] ??= slovnik()), prvek !== null ? `${prvek}/${druh}` : druh, 1);
        if (zaznam.radaZkousek === null || zaznam.radaZkousek === undefined) zaznam.radaZkousek = zaznam.zkousek;
      }
    } else if (u.druh === "zkouska.konec" && data.host === true) {
      // Zkouška cizího mostu z odkazu: není to hráčova stavba a do čísel o úrovni nepatří.
    } else if (u.druh === "zkouska.konec" && data.pokus === "zlom") {
      zaznam.zlomu = (zaznam.zlomu ?? 0) + 1;
    } else if (u.druh === "zkouska.konec" && (data.pokus === null || data.pokus === undefined)) {
      zaznam.zkousek += 1;
      if (anoZ(data.pruchod)) {
        zaznam.pruchodu += 1;
        if (zaznam.zkousekDoPruchodu === null) {
          zaznam.zkousekDoPruchodu = zaznam.zkousek;
          zaznam.sekundDoPruchodu = zaznam.sekundDriv + vMezich(data.sekund, NEJVIC_SEKUND);
        }
        const cena = Math.round(vMezich(data.cena, NEJVETSI_CENA));
        if (cena >= 1 && (zaznam.nejlevnejsi === null || cena < zaznam.nejlevnejsi)) zaznam.nejlevnejsi = cena;
      } else {
        const prvni = data.prvni;
        let duvod = "bez porušení";
        if (prvni !== null && typeof prvni === "object" && !Array.isArray(prvni)) {
          const zpusob = textZ(prvni.zpusob);
          duvod = `${znamyPrvek(prvni.prvek) ?? "?"}/${zpusob !== null && ZNAME_ZPUSOBY.has(zpusob) ? zpusob : "?"}`;
        } else if (anoZ(data.preklopeno)) {
          // Pohyblivý most bez zlomeného prutu: co se nepovedlo při zvedání a sklápění.
          duvod = "křídlo se překlopilo";
        } else if (vMezich(data.narazyLodi, 100) >= 1) {
          duvod = "loď narazila";
        } else if (data.zamceno === false) {
          duvod = "zámek nezapadl";
        } else if (anoZ(data.mezera)) {
          duvod = "mostovka nedosáhla na předmostí";
        }
        pricti((v.selhani[u.uroven] ??= slovnik()), duvod, 1);
      }
      const medaile = data.medaile;
      if (medaile !== null && typeof medaile === "object" && !Array.isArray(medaile)) {
        zaznam.medaile.pruchod ||= anoZ(medaile.pruchod);
        zaznam.medaile.rozpocet ||= anoZ(medaile.rozpocet);
        zaznam.medaile.mistrovska ||= anoZ(medaile.mistrovska);
      }
    }
  };

  for (const davka of serazene) {
    const { hrac, sezeni } = davka.hlavicka;
    const udalosti = davka.udalosti;
    const otisk = `${hrac}/${sezeni}/${davka.poradi}/${udalosti.length}/${udalosti[0]?.t ?? ""}/${udalosti[udalosti.length - 1]?.t ?? ""}`;
    if (zapoctene.has(otisk)) continue;
    zapoctene.add(otisk);
    const oHraci = (v.hraci[hrac] ??= novyHrac());
    if (!oHraci.sezeni.includes(sezeni)) oHraci.sezeni.push(sezeni);
    if (davka.hlavicka.dotyk) oHraci.dotyk = true;
    for (const u of davka.udalosti) zpracuj(hrac, oHraci, u);
  }
  return v;
}

/**
 * Sloučí výtahy do jednoho. Na pořadí záleží u „do prvního průchodu“ a u vypnutí záznamu:
 * výtahy mají jít za sebou tak, jak se hrálo (dny vzestupně, části jednoho dne v pořadí
 * klíčů dávek).
 */
export function slucVytahy(vytahy: readonly VytahDeniku[]): VytahDeniku {
  const s = prazdnyVytah();
  for (const v of vytahy) {
    s.udalosti += v.udalosti;
    s.chyb += v.chyb;
    s.vazeb += v.vazeb;
    for (const [zprava, pocet] of Object.entries(v.chyby)) prictiChybu(s.chyby, zprava, pocet);
    for (const [hrac, o] of Object.entries(v.hraci)) {
      const cil = (s.hraci[hrac] ??= novyHrac());
      for (const sezeni of o.sezeni) if (!cil.sezeni.includes(sezeni)) cil.sezeni.push(sezeni);
      cil.novy ||= o.novy;
      cil.dotyk ||= o.dotyk;
      if (o.vypnul !== null && o.vypnul !== undefined) cil.vypnul = o.vypnul;
    }
    for (const [uroven, hraci] of Object.entries(v.urovne)) {
      const cilUrovne = (s.urovne[uroven] ??= slovnik());
      for (const [hrac, z] of Object.entries(hraci)) {
        const cil = (cilUrovne[hrac] ??= novyHracVUrovni());
        if ((cil.radaZkousek ?? null) === null && (z.radaZkousek ?? null) !== null) cil.radaZkousek = cil.zkousek + z.radaZkousek!;
        cil.radaNapoveda = (cil.radaNapoveda ?? false) || (z.radaNapoveda ?? false);
        if (cil.zkousekDoPruchodu === null && z.zkousekDoPruchodu !== null) {
          cil.zkousekDoPruchodu = cil.zkousek + z.zkousekDoPruchodu;
          cil.sekundDoPruchodu = cil.sekundDriv + (z.sekundDoPruchodu ?? 0);
        }
        cil.otevreni += z.otevreni;
        cil.zkousek += z.zkousek;
        cil.pruchodu += z.pruchodu;
        cil.sekundDriv += z.sekundDriv;
        cil.medaile.pruchod ||= z.medaile.pruchod;
        cil.medaile.rozpocet ||= z.medaile.rozpocet;
        cil.medaile.mistrovska ||= z.medaile.mistrovska;
        if (z.nejlevnejsi !== null && (cil.nejlevnejsi === null || z.nejlevnejsi < cil.nejlevnejsi)) cil.nejlevnejsi = z.nejlevnejsi;
        cil.napoveda = Math.max(cil.napoveda ?? 0, z.napoveda ?? 0);
        cil.zlomu = (cil.zlomu ?? 0) + (z.zlomu ?? 0);
      }
    }
    for (const [uroven, pocty] of Object.entries(v.selhani)) {
      const cil = (s.selhani[uroven] ??= slovnik());
      for (const [duvod, pocet] of Object.entries(pocty)) pricti(cil, duvod, pocet);
    }
    for (const [uroven, pocty] of Object.entries(v.prvky)) {
      const cil = (s.prvky[uroven] ??= slovnik());
      for (const [prvek, pocet] of Object.entries(pocty)) pricti(cil, prvek, pocet);
    }
    for (const [uroven, pocty] of Object.entries(v.rady ?? {})) {
      const cil = ((s.rady ??= slovnik())[uroven] ??= slovnik());
      for (const [rada, pocet] of Object.entries(pocty)) pricti(cil, rada, pocet);
    }
  }
  return s;
}

const odNejcastejsiho = (pocty: Record<string, number> | undefined): Record<string, number> =>
  Object.fromEntries(Object.entries(pocty ?? {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));

/** Souhrn s počty a mediány z výtahu. */
export function souhrnZVytahu(v: VytahDeniku): SouhrnDeniku {
  const hraci = Object.values(v.hraci);
  const urovne: SouhrnUrovne[] = Object.entries(v.urovne)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([uroven, hraciUrovne]) => {
      const zaznamy = Object.values(hraciUrovne);
      const soucet = (cti: (z: HracVUrovni) => number): number => zaznamy.reduce((s, z) => s + cti(z), 0);
      const minut = median(zaznamy.flatMap((z) => (z.sekundDoPruchodu === null ? [] : [z.sekundDoPruchodu / 60])));
      const ceny = zaznamy.flatMap((z) => (z.nejlevnejsi === null ? [] : [z.nejlevnejsi]));
      const cena = median(ceny);
      // Hráči, kteří radu viděli, a kolik zkoušek od ní potřebovali ti, kdo potom prošli.
      const sRadou = zaznamy.filter((z) => (z.radaZkousek ?? null) !== null);
      const poRade = sRadou.flatMap((z) => (z.zkousekDoPruchodu !== null && z.zkousekDoPruchodu > z.radaZkousek! ? [z.zkousekDoPruchodu - z.radaZkousek!] : []));
      return {
        uroven,
        hracu: zaznamy.length,
        otevreni: soucet((z) => z.otevreni),
        zkousek: soucet((z) => z.zkousek),
        pruchodu: soucet((z) => z.pruchodu),
        hracuSPruchodem: zaznamy.filter((z) => z.pruchodu > 0).length,
        hracuBezZkousky: zaznamy.filter((z) => z.zkousek === 0).length,
        zkousekDoPruchodu: median(zaznamy.flatMap((z) => (z.zkousekDoPruchodu === null ? [] : [z.zkousekDoPruchodu]))),
        minutDoPruchodu: minut === null ? null : Math.round(minut * 10) / 10,
        medaile: {
          pruchod: zaznamy.filter((z) => z.medaile.pruchod).length,
          rozpocet: zaznamy.filter((z) => z.medaile.rozpocet).length,
          mistrovska: zaznamy.filter((z) => z.medaile.mistrovska).length,
        },
        nejlevnejsiPruchod: ceny.length === 0 ? null : ceny.reduce((a, b) => Math.min(a, b)),
        cenaPruchodu: cena === null ? null : Math.round(cena),
        prvky: odNejcastejsiho(v.prvky[uroven]),
        selhani: odNejcastejsiho(v.selhani[uroven]),
        hracuSNapovedou: zaznamy.filter((z) => (z.napoveda ?? 0) >= 1).length,
        hracuSObrysem: zaznamy.filter((z) => (z.napoveda ?? 0) >= 2).length,
        hracuDoZlomu: zaznamy.filter((z) => (z.zlomu ?? 0) > 0).length,
        zkousekDoZlomu: zaznamy.reduce((soucet, z) => soucet + (z.zlomu ?? 0), 0),
        rady: odNejcastejsiho(v.rady?.[uroven]),
        hracuSRadou: sRadou.length,
        hracuSRadouPrusli: poRade.length,
        zkousekPoRade: median(poRade),
        hracuNapovedaZRady: zaznamy.filter((z) => z.radaNapoveda === true).length,
      };
    });

  return {
    hracu: hraci.length,
    sezeni: hraci.reduce((s, h) => s + h.sezeni.length, 0),
    novych: hraci.filter((h) => h.novy).length,
    dotykovych: hraci.filter((h) => h.dotyk).length,
    udalosti: v.udalosti,
    chyb: v.chyb,
    vazeb: v.vazeb,
    vypnuli: hraci.filter((h) => h.vypnul === true).length,
    chyby: Object.entries(v.chyby)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([zprava, pocet]) => ({ zprava, pocet })),
    urovne,
  };
}

/** Souhrn rovnou z dávek deníku. */
export function souhrnDeniku(davky: readonly DavkaDeniku[]): SouhrnDeniku {
  return souhrnZVytahu(vytahDeniku(davky));
}
