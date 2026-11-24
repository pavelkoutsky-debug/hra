import type { Bod, Obdelnik } from "./geometrie";
import { jeUvnitr } from "./geometrie";
import { ID_PROVOZU, ID_PRVKU, ID_VOZU, jeKolejove, type IdProvozu, type IdPrvku, type IdVozu } from "./katalog";
import {
  ChybaDat,
  cislo,
  jedenZ,
  jenZnameKlice,
  logicka,
  neboNull,
  objekt,
  polozky,
  text,
  volitelne,
} from "./kontrola";
import { prevedNaAktualni, type Prevod } from "./prevody";

export const VERZE_UROVNE = 9;

/** Převody ze starších verzí formátu úrovně; viz `prevedNaAktualni`. */
const PREVODY_UROVNE: readonly Prevod[] = [
  // 1 → 2: přibylo největší závaží na styčník a osa frekvencí. Starší úrovně je neznaly.
  (stara) => ({ ...stara, nejvetsiZavazi: 0, osaFrekvenci: false }),
  // 2 → 3: laděný tlumič, rezonanční křivka, budič a požadovaný komfort. Starší úrovně je
  // neznaly; neobstál v nich jen most s nepřijatelným kmitáním.
  (stara) => ({ ...stara, nejvetsiTlumic: 0, rezonancniKrivka: false, budic: false, nejhorsiKomfort: 3 }),
  // 3 → 4: nerovnost vozovky začala platit. Starší úrovně třídu uváděly, ale hra ji nepočítala:
  // jsou vyladěné na dokonale rovné vozovce a tak zůstávají. Položky jízdního řádu nově
  // umějí rozestup, rychlost a brzdění; starší je nemají.
  (stara) => ({ ...stara, nerovnost: "zadna" }),
  // 4 → 5: vlak. Položka jízdního řádu s lokomotivou smí nést seznam vozů a kolejová vozidla
  // jezdí jen po trase druhu „kolej“. Starší úrovně vlaky nemají, takže se na nich nic nemění.
  (stara) => stara,
  // 5 → 6: pohyblivé mosty. Úroveň může mít fáze zkoušky (kdy se most zvedá a sklápí) a lodě;
  // starší úrovně mají mosty pevné.
  (stara) => ({ ...stara, pohyb: null, lode: [] }),
  // 6 → 7: kotva smí být vyhrazená jednomu druhu prutu (`jen`: kotva pro tlumič, o kterou se
  // nedá opřít vzpěra). Starší úrovně takové kotvy nemají.
  (stara) => stara,
  // 7 → 8: zkouškové úrovně (bez ukázky a bez nápovědy). Starší úrovně zkouškové nejsou.
  (stara) => ({ ...stara, zkouskova: false }),
  // 8 → 9: úroveň smí omezit průhyb mostovky (`nejvetsiPruhyb`). Starší úrovně ho nehlídají.
  (stara) => ({ ...stara, nejvetsiPruhyb: null }),
];

export const TYPY_KOTEV = ["pevna", "posuvna", "vetknuti"] as const;
export type TypKotvy = (typeof TYPY_KOTEV)[number];

/** K čemu smí být kotva vyhrazená: zatím jen tlumiči (prvek druhu „tlumic“). */
export const VYHRAZENI_KOTEV = ["tlumic", "lano"] as const;
export type VyhrazeniKotvy = (typeof VYHRAZENI_KOTEV)[number];

/** Podpora daná úrovní. Styčník návrhu na stejném místě je v ní uložen. */
export interface Kotva extends Bod {
  typ: TypKotvy;
  /**
   * Kotva vyhrazená jednomu druhu prutu: jiný do ní vést nesmí. Kotva pro tlumič ve svahu
   * pod lávkou je místo, kam se tlumič upne; vzpěra opřená o ni by lávku podepřela a úroveň,
   * která učí tlumit, by šla projít bez tlumiče (nález kontroly obtížnosti M12). Kotva pro
   * lano (obyčejné i nosné) je kotevní blok za opěrou: ocelové táhlo do ní by lana nahradilo
   * a úroveň, která chce zavěšený most, by šla projít konzolovou příhradou bez jediného lana
   * (8-01, kontrola po přeladění M14).
   */
  jen?: VyhrazeniKotvy;
}

export const DRUHY_TRAS = ["lavka", "silnice", "kolej"] as const;
export type DruhTrasy = (typeof DRUHY_TRAS)[number];

/** Trasa provozu: od konce jednoho předmostí ke druhému. Mezi nimi hráč staví mostovku. */
export interface Trasa {
  id: string;
  druh: DruhTrasy;
  zacatek: Bod;
  konec: Bod;
}

export const TRIDY_NEROVNOSTI = ["zadna", "A", "B", "C"] as const;
/**
 * Nerovnost vozovky: žádná (dokonale rovná, jako v úrovních do verze 3), nebo třída podle
 * normového profilu: A nová hladká, B běžná, C rozbitá.
 */
export type TridaNerovnosti = (typeof TRIDY_NEROVNOSTI)[number];

/** Brzdění vozidla na mostě: zastaví, postojí a zase se rozjede. */
export interface Brzdeni {
  /** Souřadnice x světa, kde má vozidlo po zastavení stát čelem, m. */
  misto: number;
  /** Jak dlouho stojí, s. */
  stani: number;
  /** Zpomalení při brzdění, m/s²; bez údaje prudké brzdění 5 m/s², u vlaku provozní 1 m/s². */
  zpomaleni?: number;
}

export const DRUHY_BONUSU = ["rezerva", "komfort-chodcu", "komfort-cestujicich", "dosednuti"] as const;
/**
 * Podmínka mistrovské medaile: největší využití, největší zrychlení v m/s², nebo největší
 * síla (N), kterou pohyblivý most při sklápění udeří do opěry.
 */
export interface BonusUrovne {
  druh: (typeof DRUHY_BONUSU)[number];
  limit: number;
}

export interface PolozkaJizdnihoRadu {
  /** Čas vstupu na trasu v sekundách od začátku zkoušky. */
  cas: number;
  trasa: string;
  /** 1 = od začátku trasy ke konci, −1 = protisměr. */
  smer: 1 | -1;
  druh: IdProvozu;
  /** Počet lidí nebo vozidel ve skupině. */
  pocet?: number;
  /** Kroková frekvence v Hz u lidí; u skákajícího davu rytmus skákání. */
  kadence?: number;
  /** Jak dlouho skákající dav na mostě skáče, v sekundách. */
  trvani?: number;
  /** Rozestup vozidel ve skupině, čelo od čela, m; bez údaje podle druhu vozidla. */
  rozestup?: number;
  /** Rychlost vozidel v m/s; bez údaje podle druhu vozidla. */
  rychlost?: number;
  /** Vozidla na mostě zabrzdí, postojí a rozjedou se. */
  brzdeni?: Brzdeni;
  /**
   * Vlak: vozy za lokomotivou, od prvního za ní. Jen u položky druhu „lokomotiva“;
   * `pocet` té položky je počet lokomotiv v čele.
   */
  vozy?: SkupinaVozu[];
}

/**
 * Fáze zkoušky pohyblivého mostu: kdy se zámky odemknou a písty začnou most zvedat a kdy
 * ho začnou sklápět (po sklopení se zámky zase zamknou). Časy v sekundách od začátku zkoušky.
 */
export interface PohybMostu {
  zvednout: number;
  sklopit: number;
}

/**
 * Loď, která pod mostem propluje. V bokorysu pluje kolmo k výkresu: po dobu průjezdu zabírá
 * plavební profil, obdélník nad hladinou, do kterého nesmí zasahovat nic z mostu.
 */
export interface Lod {
  /** Kdy příď vpluje pod most a jak dlouho průjezd trvá, s. */
  cas: number;
  trvani: number;
  /** Plavební profil: odkud kam sahá podél mostu (m) a jak vysoko nad hladinu (m). */
  xMin: number;
  xMax: number;
  vyska: number;
}

/** Několik stejných vozů za sebou ve vlaku. */
export interface SkupinaVozu {
  druh: IdVozu;
  pocet: number;
}

/** Nejvíc vozidel v jednom vlaku (lokomotivy i vozy dohromady). */
export const NEJVIC_VOZU_VLAKU = 40;

export interface Uroven {
  verze: typeof VERZE_UROVNE;
  /** Kapitola a pořadí, například "2-03". */
  id: string;
  nazev: string;
  /** Rozsah výkresu; mimo něj nelze stavět ani odjet kamerou. */
  vyrez: Obdelnik;
  /** Povrch terénu zleva doprava, x ostře roste. Za krajními body pokračuje vodorovně. */
  teren: Bod[];
  /** Výška hladiny, nebo null, když v úrovni voda není. */
  hladina: number | null;
  kotvy: Kotva[];
  /** Místa, kde smí stát pilíř. */
  zaklady: Bod[];
  /** Oblasti, kam se nesmí stavět (průjezdný profil, plavební dráha). */
  zakazaneZony: Obdelnik[];
  trasy: Trasa[];
  /** Šířka mostovky v metrech; určuje hmotnost na metr a počet lidí vedle sebe. */
  sirkaMostovky: number;
  /** Hmotnost zábradlí a vozovkových vrstev v kg na metr délky mostovky. */
  hmotnostVybaveni: number;
  nerovnost: TridaNerovnosti;
  /** Povolený rozpočet v Kč, nebo null bez omezení. */
  rozpocet: number | null;
  /** Přísnější rozpočet pro medaili; null, když úroveň medaili za rozpočet nemá. */
  inzenyrskyRozpocet: number | null;
  mistrovska: BonusUrovne | null;
  povolenePrvky: IdPrvku[];
  povoleneSvary: boolean;
  /** Největší závaží, které lze zavěsit do jednoho styčníku, v kg; 0 = úroveň závaží nedovoluje. */
  nejvetsiZavazi: number;
  /** Ukazuje úroveň osu frekvencí (vlastní frekvence mostu proti krokům lidí) a brnknutí? */
  osaFrekvenci: boolean;
  /** Největší závaží laděného tlumiče v kg; 0 = úroveň laděný tlumič nedovoluje. */
  nejvetsiTlumic: number;
  /** Kreslí se nad osou frekvencí rezonanční křivka? Má smysl jen s osou frekvencí. */
  rezonancniKrivka: boolean;
  /** Dovoluje úroveň budič (zkoušku mostu rozmítanou silou)? */
  budic: boolean;
  /**
   * Nejhorší třída komfortu, se kterou most ještě obstojí: 3 nízký (do 2,5 m/s²), 2 střední
   * (do 1 m/s²), 1 výborný (do 0,5 m/s²). Rušná městská lávka musí být klidnější než lávka v lese.
   */
  nejhorsiKomfort: 1 | 2 | 3;
  jizdniRad: PolozkaJizdnihoRadu[];
  /** Fáze zkoušky pohyblivého mostu; null u mostu, který se nehýbe. */
  pohyb: PohybMostu | null;
  /** Lodě, které při zkoušce pod mostem proplují. */
  lode: Lod[];
  /**
   * Zkoušková úroveň: uzavírá kapitolu, nic nového neučí a hráč v ní nemá ukázku ani nápovědu.
   * Zadání říká jen úlohu, ne řešení.
   */
  zkouskova: boolean;
  /**
   * O kolik metrů se mostovka při zkoušce smí nejvíc odchýlit od výkresu (pod vlastní tíhou
   * i pod provozem); null: úroveň průhyb nehlídá. Most, který mez překročí, neobstojí, i kdyby
   * všichni přešli: lávka, která visí jako pás, není hotový most. U pohyblivých mostů nemá
   * smysl (mostovka se zvedá) a úroveň s `pohyb` ho mít nesmí.
   */
  nejvetsiPruhyb: number | null;
}

const KLICE_UROVNE = [
  "verze",
  "id",
  "nazev",
  "vyrez",
  "teren",
  "hladina",
  "kotvy",
  "zaklady",
  "zakazaneZony",
  "trasy",
  "sirkaMostovky",
  "hmotnostVybaveni",
  "nerovnost",
  "rozpocet",
  "inzenyrskyRozpocet",
  "mistrovska",
  "povolenePrvky",
  "povoleneSvary",
  "nejvetsiZavazi",
  "osaFrekvenci",
  "nejvetsiTlumic",
  "rezonancniKrivka",
  "budic",
  "nejhorsiKomfort",
  "jizdniRad",
  "pohyb",
  "lode",
  "zkouskova",
  "nejvetsiPruhyb",
] as const;

function bod(h: unknown, cesta: string): Bod {
  const o = objekt(h, cesta);
  return { x: cislo(o.x, `${cesta}.x`), y: cislo(o.y, `${cesta}.y`) };
}

/** Bod na rastru 1 m: stavět lze jen na celých metrech. */
function bodNaRastru(h: unknown, cesta: string): Bod {
  const o = objekt(h, cesta);
  return {
    x: cislo(o.x, `${cesta}.x`, { cele: true }),
    y: cislo(o.y, `${cesta}.y`, { cele: true }),
  };
}

function obdelnik(h: unknown, cesta: string): Obdelnik {
  const o = objekt(h, cesta);
  const r: Obdelnik = {
    xMin: cislo(o.xMin, `${cesta}.xMin`),
    yMin: cislo(o.yMin, `${cesta}.yMin`),
    xMax: cislo(o.xMax, `${cesta}.xMax`),
    yMax: cislo(o.yMax, `${cesta}.yMax`),
  };
  if (r.xMax <= r.xMin || r.yMax <= r.yMin) throw new ChybaDat(cesta, "obdélník má nulovou nebo zápornou plochu");
  return r;
}

function kotva(h: unknown, cesta: string): Kotva {
  const o = objekt(h, cesta);
  const k: Kotva = { ...bodNaRastru(h, cesta), typ: jedenZ(o.typ, `${cesta}.typ`, TYPY_KOTEV) };
  if (o.jen !== undefined) k.jen = jedenZ(o.jen, `${cesta}.jen`, VYHRAZENI_KOTEV);
  return k;
}

function trasa(h: unknown, cesta: string): Trasa {
  const o = objekt(h, cesta);
  const t: Trasa = {
    id: text(o.id, `${cesta}.id`),
    druh: jedenZ(o.druh, `${cesta}.druh`, DRUHY_TRAS),
    zacatek: bodNaRastru(o.zacatek, `${cesta}.zacatek`),
    konec: bodNaRastru(o.konec, `${cesta}.konec`),
  };
  if (t.konec.x <= t.zacatek.x) throw new ChybaDat(cesta, "konec trasy musí ležet vpravo od začátku");
  return t;
}

function polozkaJizdnihoRadu(h: unknown, cesta: string): PolozkaJizdnihoRadu {
  const o = objekt(h, cesta);
  // Překlep v názvu údaje (třeba „vozi“) by jinak potichu poslal na most samotnou lokomotivu.
  jenZnameKlice(o, cesta, ["cas", "trasa", "smer", "druh", "pocet", "kadence", "trvani", "rozestup", "rychlost", "brzdeni", "vozy"]);
  const smer = cislo(o.smer, `${cesta}.smer`, { cele: true });
  if (smer !== 1 && smer !== -1) throw new ChybaDat(`${cesta}.smer`, "směr je 1 nebo −1");
  const p: PolozkaJizdnihoRadu = {
    cas: cislo(o.cas, `${cesta}.cas`, { min: 0 }),
    trasa: text(o.trasa, `${cesta}.trasa`),
    smer,
    druh: jedenZ(o.druh, `${cesta}.druh`, ID_PROVOZU),
  };
  const pocet = volitelne(o.pocet, (v) => cislo(v, `${cesta}.pocet`, { min: 1, cele: true }));
  if (pocet !== undefined) p.pocet = pocet;
  const kadence = volitelne(o.kadence, (v) => cislo(v, `${cesta}.kadence`, { min: 0.5, max: 5 }));
  if (kadence !== undefined) p.kadence = kadence;
  const trvani = volitelne(o.trvani, (v) => cislo(v, `${cesta}.trvani`, { min: 1, max: 120 }));
  if (trvani !== undefined) p.trvani = trvani;
  const rozestup = volitelne(o.rozestup, (v) => cislo(v, `${cesta}.rozestup`, { min: 2, max: 200 }));
  if (rozestup !== undefined) p.rozestup = rozestup;
  const rychlost = volitelne(o.rychlost, (v) => cislo(v, `${cesta}.rychlost`, { min: 0.5, max: 40 }));
  if (rychlost !== undefined) p.rychlost = rychlost;
  const brzdeni = volitelne(o.brzdeni, (v) => {
    const b = objekt(v, `${cesta}.brzdeni`);
    jenZnameKlice(b, `${cesta}.brzdeni`, ["misto", "stani", "zpomaleni"]);
    const vysledek: Brzdeni = {
      misto: cislo(b.misto, `${cesta}.brzdeni.misto`),
      stani: cislo(b.stani, `${cesta}.brzdeni.stani`, { min: 0, max: 60 }),
    };
    const zpomaleni = volitelne(b.zpomaleni, (z) => cislo(z, `${cesta}.brzdeni.zpomaleni`, { min: 1, max: 8 }));
    if (zpomaleni !== undefined) vysledek.zpomaleni = zpomaleni;
    return vysledek;
  });
  if (brzdeni !== undefined) p.brzdeni = brzdeni;
  const vozy = volitelne(o.vozy, (v) =>
    polozky(v, `${cesta}.vozy`, (skupina, c): SkupinaVozu => {
      const s = objekt(skupina, c);
      jenZnameKlice(s, c, ["druh", "pocet"]);
      return { druh: jedenZ(s.druh, `${c}.druh`, ID_VOZU), pocet: cislo(s.pocet, `${c}.pocet`, { min: 1, cele: true }) };
    }),
  );
  if (vozy !== undefined) {
    if (p.druh !== "lokomotiva") throw new ChybaDat(`${cesta}.vozy`, "vozy smí táhnout jen lokomotiva");
    p.vozy = vozy;
  }
  // Vlak jede nárazník na nárazník; rozestup by se u něj potichu nepoužil.
  if (p.druh === "lokomotiva" && p.rozestup !== undefined) {
    throw new ChybaDat(`${cesta}.rozestup`, "vozidla vlaku jedou těsně za sebou, rozestup u nich zadat nejde");
  }
  let vozidel = p.druh === "lokomotiva" ? (p.pocet ?? 1) : 0;
  for (const skupina of p.vozy ?? []) vozidel += skupina.pocet;
  if (vozidel > NEJVIC_VOZU_VLAKU) throw new ChybaDat(cesta, `vlak smí mít nejvýš ${NEJVIC_VOZU_VLAKU} vozidel`);
  return p;
}

function stejnyBod(a: Bod, b: Bod): boolean {
  return a.x === b.x && a.y === b.y;
}

/**
 * Přečte úroveň z dat neznámého tvaru: převede starší verzi formátu, zkontroluje
 * typy i vnitřní souvislosti. Při chybě vyhodí `ChybaDat` s cestou k místu chyby.
 */
export function nactiUroven(data: unknown): Uroven {
  const c = "uroven";
  const o = prevedNaAktualni(data, VERZE_UROVNE, PREVODY_UROVNE, c);
  jenZnameKlice(o, c, KLICE_UROVNE);

  const id = text(o.id, `${c}.id`);
  if (!/^\d-\d\d$/.test(id)) throw new ChybaDat(`${c}.id`, 'očekáván tvar "kapitola-pořadí", např. "2-03"');

  const uroven: Uroven = {
    verze: VERZE_UROVNE,
    id,
    nazev: text(o.nazev, `${c}.nazev`),
    vyrez: obdelnik(o.vyrez, `${c}.vyrez`),
    teren: polozky(o.teren, `${c}.teren`, bod),
    hladina: neboNull(o.hladina, (v) => cislo(v, `${c}.hladina`)),
    kotvy: polozky(o.kotvy, `${c}.kotvy`, kotva),
    zaklady: polozky(o.zaklady, `${c}.zaklady`, bodNaRastru),
    zakazaneZony: polozky(o.zakazaneZony, `${c}.zakazaneZony`, obdelnik),
    trasy: polozky(o.trasy, `${c}.trasy`, trasa),
    sirkaMostovky: cislo(o.sirkaMostovky, `${c}.sirkaMostovky`, { min: 1, max: 30 }),
    hmotnostVybaveni: cislo(o.hmotnostVybaveni, `${c}.hmotnostVybaveni`, { min: 0 }),
    nerovnost: jedenZ(o.nerovnost, `${c}.nerovnost`, TRIDY_NEROVNOSTI),
    rozpocet: neboNull(o.rozpocet, (v) => cislo(v, `${c}.rozpocet`, { min: 0 })),
    inzenyrskyRozpocet: neboNull(o.inzenyrskyRozpocet, (v) => cislo(v, `${c}.inzenyrskyRozpocet`, { min: 0 })),
    mistrovska: neboNull(o.mistrovska, (v) => {
      const b = objekt(v, `${c}.mistrovska`);
      return {
        druh: jedenZ(b.druh, `${c}.mistrovska.druh`, DRUHY_BONUSU),
        limit: cislo(b.limit, `${c}.mistrovska.limit`, { min: 0 }),
      };
    }),
    povolenePrvky: polozky(o.povolenePrvky, `${c}.povolenePrvky`, (v, cesta) => jedenZ(v, cesta, ID_PRVKU)),
    povoleneSvary: logicka(o.povoleneSvary, `${c}.povoleneSvary`),
    nejvetsiZavazi: cislo(o.nejvetsiZavazi, `${c}.nejvetsiZavazi`, { min: 0 }),
    osaFrekvenci: logicka(o.osaFrekvenci, `${c}.osaFrekvenci`),
    nejvetsiTlumic: cislo(o.nejvetsiTlumic, `${c}.nejvetsiTlumic`, { min: 0 }),
    rezonancniKrivka: logicka(o.rezonancniKrivka, `${c}.rezonancniKrivka`),
    budic: logicka(o.budic, `${c}.budic`),
    nejhorsiKomfort: cislo(o.nejhorsiKomfort, `${c}.nejhorsiKomfort`, { min: 1, max: 3, cele: true }) as 1 | 2 | 3,
    jizdniRad: polozky(o.jizdniRad, `${c}.jizdniRad`, polozkaJizdnihoRadu),
    pohyb: neboNull(o.pohyb, (v) => {
      const p = objekt(v, `${c}.pohyb`);
      jenZnameKlice(p, `${c}.pohyb`, ["zvednout", "sklopit"]);
      return {
        zvednout: cislo(p.zvednout, `${c}.pohyb.zvednout`, { min: 0, max: 300 }),
        sklopit: cislo(p.sklopit, `${c}.pohyb.sklopit`, { min: 0, max: 300 }),
      };
    }),
    lode: polozky(o.lode, `${c}.lode`, (v, cesta): Lod => {
      const l = objekt(v, cesta);
      jenZnameKlice(l, cesta, ["cas", "trvani", "xMin", "xMax", "vyska"]);
      return {
        cas: cislo(l.cas, `${cesta}.cas`, { min: 0, max: 300 }),
        trvani: cislo(l.trvani, `${cesta}.trvani`, { min: 1, max: 60 }),
        xMin: cislo(l.xMin, `${cesta}.xMin`),
        xMax: cislo(l.xMax, `${cesta}.xMax`),
        vyska: cislo(l.vyska, `${cesta}.vyska`, { min: 1, max: 60 }),
      };
    }),
    zkouskova: logicka(o.zkouskova, `${c}.zkouskova`),
    nejvetsiPruhyb: neboNull(o.nejvetsiPruhyb, (v) => cislo(v, `${c}.nejvetsiPruhyb`, { min: 0.01, max: 1.5 })),
  };

  zkontrolujSouvislosti(uroven, c);
  return uroven;
}

function zkontrolujSouvislosti(u: Uroven, c: string): void {
  if (u.teren.length < 2) throw new ChybaDat(`${c}.teren`, "terén potřebuje aspoň dva body");
  for (let i = 1; i < u.teren.length; i++) {
    const predchozi = u.teren[i - 1]!;
    const tento = u.teren[i]!;
    if (tento.x <= predchozi.x) throw new ChybaDat(`${c}.teren[${i}]`, "x musí zleva doprava ostře růst");
  }

  u.kotvy.forEach((k, i) => {
    if (!jeUvnitr(u.vyrez, k)) throw new ChybaDat(`${c}.kotvy[${i}]`, "kotva leží mimo výřez");
    if (u.kotvy.findIndex((j) => stejnyBod(j, k)) !== i) {
      throw new ChybaDat(`${c}.kotvy[${i}]`, "dvě kotvy na stejném místě");
    }
  });
  u.zaklady.forEach((z, i) => {
    if (!jeUvnitr(u.vyrez, z)) throw new ChybaDat(`${c}.zaklady[${i}]`, "základ leží mimo výřez");
  });

  if (u.trasy.length === 0) throw new ChybaDat(`${c}.trasy`, "úroveň potřebuje aspoň jednu trasu");
  u.trasy.forEach((t, i) => {
    if (u.trasy.findIndex((j) => j.id === t.id) !== i) throw new ChybaDat(`${c}.trasy[${i}].id`, "id trasy se opakuje");
    for (const [jmeno, b] of [["zacatek", t.zacatek], ["konec", t.konec]] as const) {
      if (!u.kotvy.some((k) => stejnyBod(k, b))) {
        throw new ChybaDat(`${c}.trasy[${i}].${jmeno}`, "konec trasy musí ležet na kotvě");
      }
    }
  });

  // Trasy mostu o více patrech mají stejné rozpětí: stojí na tom osa zrcadlení i kóta rozpětí.
  const hlavni = u.trasy[0]!;
  u.trasy.forEach((t, i) => {
    if (t.zacatek.x !== hlavni.zacatek.x || t.konec.x !== hlavni.konec.x) {
      throw new ChybaDat(`${c}.trasy[${i}]`, "všechny trasy úrovně musí začínat a končit nad sebou (stejné rozpětí)");
    }
    // Po koleji jede vlak jen po kolejišti; bez něj by úroveň nešla postavit.
    if (t.druh === "kolej" && !u.povolenePrvky.includes("kolejiste")) {
      throw new ChybaDat(`${c}.povolenePrvky`, "úroveň s kolejí musí dovolit kolejiště");
    }
  });
  // Bonus za pohodlí cestujících potřebuje někoho, kdo cestuje.
  if (u.mistrovska?.druh === "komfort-cestujicich" && kdoCestuje(u) === null) {
    throw new ChybaDat(`${c}.mistrovska`, "pohodlí cestujících nejde hodnotit bez autobusu nebo osobního vozu");
  }

  u.jizdniRad.forEach((p, i) => {
    const trasa = u.trasy.find((t) => t.id === p.trasa);
    if (!trasa) throw new ChybaDat(`${c}.jizdniRad[${i}].trasa`, `trasa "${p.trasa}" v úrovni není`);
    // Vlak jede po koleji a nic jiného po ní nejezdí.
    if (jeKolejove(p.druh) !== (trasa.druh === "kolej")) {
      throw new ChybaDat(
        `${c}.jizdniRad[${i}].druh`,
        trasa.druh === "kolej" ? "po koleji jezdí jen lokomotiva s vozy" : "kolejové vozidlo potřebuje trasu druhu „kolej“",
      );
    }
    // Vozy samy nejedou: do jízdního řádu patří jako vozy lokomotivy.
    if (p.druh !== "lokomotiva" && jeKolejove(p.druh)) {
      throw new ChybaDat(`${c}.jizdniRad[${i}].druh`, "vůz bez lokomotivy nejede; zapiš ho mezi vozy lokomotivy");
    }
  });

  if (u.pohyb && u.nejvetsiPruhyb !== null) {
    throw new ChybaDat(`${c}.nejvetsiPruhyb`, "průhyb mostovky nejde hlídat u mostu, který se zvedá");
  }
  if (u.pohyb && u.pohyb.sklopit <= u.pohyb.zvednout) {
    throw new ChybaDat(`${c}.pohyb.sklopit`, "most se musí nejdřív zvednout a pak teprve sklopit");
  }
  u.lode.forEach((l, i) => {
    if (u.hladina === null) throw new ChybaDat(`${c}.lode[${i}]`, "loď potřebuje vodu: úroveň nemá hladinu");
    if (l.xMax <= l.xMin) throw new ChybaDat(`${c}.lode[${i}].xMax`, "plavební profil musí mít kladnou šířku");
  });

  if (u.rozpocet !== null && u.inzenyrskyRozpocet !== null && u.inzenyrskyRozpocet > u.rozpocet) {
    throw new ChybaDat(`${c}.inzenyrskyRozpocet`, "inženýrský rozpočet nesmí být vyšší než povolený");
  }
  if (new Set(u.povolenePrvky).size !== u.povolenePrvky.length) {
    throw new ChybaDat(`${c}.povolenePrvky`, "prvek je uveden dvakrát");
  }
}

/** Jak daleko od spojnice trasy smí ležet styčník mostovky, aby k trase patřil, v metrech. */
export const TOLERANCE_TRASY = 0.5;

/** Leží bod na trase: mezi jejími konci a nejvýš `TOLERANCE_TRASY` stranou od jejich spojnice? */
export function bodNaTrase(trasa: Trasa, bod: Bod): boolean {
  const dx = trasa.konec.x - trasa.zacatek.x;
  const dy = trasa.konec.y - trasa.zacatek.y;
  const delka = Math.sqrt(dx * dx + dy * dy);
  if (!(delka > 0)) return false;
  const podel = ((bod.x - trasa.zacatek.x) * dx + (bod.y - trasa.zacatek.y) * dy) / delka;
  const napric = ((bod.x - trasa.zacatek.x) * dy - (bod.y - trasa.zacatek.y) * dx) / delka;
  return podel >= -1e-9 && podel <= delka + 1e-9 && Math.abs(napric) <= TOLERANCE_TRASY;
}

/** Jede v úrovni osobní vůz? Pohodlí cestujících se pak týká vlaku, ne autobusu. */
export function cestujiVlakem(u: Uroven): boolean {
  return u.jizdniRad.some((p) => p.vozy?.some((skupina) => skupina.druh === "vuz-osobni"));
}

/**
 * Čí pohodlí se v úrovni měří: cestujících autobusu, vlaku, obojích (dvoupatrový most), nebo
 * nikoho. Podle toho se jmenuje řádek výsledku i podmínka medaile.
 */
export function kdoCestuje(u: Uroven): "autobus" | "vlak" | "oboji" | null {
  const vlakem = cestujiVlakem(u);
  const autobusem = u.jizdniRad.some((p) => p.druh === "autobus");
  return vlakem && autobusem ? "oboji" : vlakem ? "vlak" : autobusem ? "autobus" : null;
}

/** Výška terénu v místě x; mimo zadané body pokračuje terén vodorovně. */
export function vyskaTerenu(u: Uroven, x: number): number {
  const body = u.teren;
  const prvni = body[0]!;
  const posledni = body[body.length - 1]!;
  if (x <= prvni.x) return prvni.y;
  if (x >= posledni.x) return posledni.y;
  for (let i = 1; i < body.length; i++) {
    const a = body[i - 1]!;
    const b = body[i]!;
    if (x <= b.x) return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
  }
  return posledni.y;
}
