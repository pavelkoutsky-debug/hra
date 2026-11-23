// Výzvy o efektivitu (koncepce, kap. 4): tři měřítka, kterými se dá na úrovni kampaně
// soutěžit dál, i když už je projitá. Nejlevnější a nejlehčí most se měří při každé úspěšné
// zkoušce, únosnost na korunu zkouškou do zlomu. Každá výzva má prahy bronz, stříbro a zlato.
// Zlato ceny a hmotnosti se měří podle „šampiona“: referenčního mostu, ze kterého stroj ubral,
// co šlo (`urovne/hubnuti.ts`). Stříbro je pak most autora hry. Zlato je vždy dosažitelné,
// protože most, který ho splní, existuje; hráč ale musí ubírat taky.

export const DRUHY_VYZEV = ["cena", "hmotnost", "zlom"] as const;
export type DruhVyzvy = (typeof DRUHY_VYZEV)[number];

/** Stupeň výzvy: 0 žádný, 1 bronz, 2 stříbro, 3 zlato. */
export type StupenVyzvy = 0 | 1 | 2 | 3;
export const NAZVY_STUPNU = ["zadny", "bronz", "stribro", "zlato"] as const;

/** Co ve výzvách dokázal nejlepší referenční most úrovně a co jeho zeštíhlená verze. */
export interface ZakladVyzev {
  /** Cena nejlevnějšího referenčního mostu a kolik z ní stojí mostovka, Kč. */
  cena: number;
  cenaMostovky: number;
  /** Hmotnost nejlehčího referenčního mostu a kolik z ní váží mostovka s vybavením, kg. */
  hmotnost: number;
  hmotnostMostovky: number;
  /**
   * Totéž u šampionů: nejlevnější a nejlehčí most, jaký stroj z referenčních mostů zeštíhlil.
   * Null u úrovně, která šampiony nemá; zlato je pak most autora.
   */
  sampion: { cena: number; cenaMostovky: number; hmotnost: number; hmotnostMostovky: number } | null;
  /** Největší únosnost na korunu, jakou měl referenční most při zkoušce do zlomu, N/Kč. */
  zlom: number;
  /** Rozpočet úrovně v Kč; null, když úroveň rozpočet nemá. Dražší most zkoušku nedostane. */
  rozpocet: number | null;
}

/** Prahy jedné výzvy: bronz, stříbro, zlato. */
export type Prahy = readonly [bronz: number, stribro: number, zlato: number];
export type PrahyVyzev = Readonly<Record<DruhVyzvy, Prahy>>;

/**
 * O kolik smí být nosná konstrukce (most bez mostovky) dražší nebo těžší než u referenčního
 * mostu: stříbro o 15 %, bronz o 40 %. Mostovku hráč úsporou neovlivní, proto se do rezervy
 * nepočítá; jinak by u těžkých mostů dostal bronz každý.
 */
const REZERVA_KONSTRUKCE = [1.4, 1.15, 1] as const;
/**
 * Nejmenší odstup stříbra a bronzu od zlata: 2 % a 5 % celého mostu. Kde skoro všechno dělá
 * mostovka (pohyblivé mosty), by jinak tři stupně splynuly v jedno číslo.
 */
const NEJMENSI_ODSTUP = [1.05, 1.02, 1] as const;
/**
 * O kolik smí být nosná konstrukce dražší nebo těžší než u šampiona, aby most dostal zlato:
 * o 10 %, nejmíň ale 2 % celého mostu. Šampion stojí na hraně (některý prut má využitý skoro
 * celý); zlato chce most jemu blízký, ne stejný.
 */
const REZERVA_NAD_SAMPIONEM = 1.1;
const ODSTUP_OD_SAMPIONA = 1.02;
/**
 * Kolik z rozdílu mezi zlatem a rozpočtem úrovně smí práh ceny nejvýš spotřebovat: stříbro
 * třetinu, bronz dvě třetiny. Bronz nad rozpočtem by dostal každý most, který projde.
 */
const PODIL_DO_ROZPOCTU = [2 / 3, 1 / 3, 0] as const;
/** Jakou část únosnosti na korunu referenčního mostu výzva chce: bronz 45 %, stříbro 70 %, zlato 95 %. */
const PODIL_UNOSNOSTI = [0.45, 0.7, 0.95] as const;

/** Tíhové zrychlení pro převod newtonů na tuny; stejné číslo jako v jádře (hlídá test). */
export const TIHA_PRO_VYZVY = 9.80665;

/** Únosnost na korunu (N/Kč) v tunách na 100 000 Kč: číslo, které se dá představit. */
export function tunNaStoTisic(naKorunu: number): number {
  return (naKorunu * 100_000) / TIHA_PRO_VYZVY / 1000;
}

/** Zaokrouhlí na tři platné číslice nahoru, dolů nebo k nejbližšímu; práh pak jde přečíst. */
function naTriCislice(hodnota: number, smer: "nahoru" | "dolu" | "nejbliz"): number {
  if (!(hodnota > 0)) return 0;
  let rad = 1;
  while (hodnota / rad >= 1000) rad *= 10;
  while (hodnota / rad < 100) rad /= 10;
  const podil = hodnota / rad;
  // Malá tolerance, aby se číslo, které už zaokrouhlené je, neposunulo o řád výš.
  const cele = smer === "nahoru" ? Math.ceil(podil - 1e-9) : smer === "dolu" ? Math.floor(podil + 1e-9) : Math.round(podil);
  return Number((cele * rad).toPrecision(3));
}

/**
 * Hodnota výzvy tak přesně, jak ji hra ukazuje: cena na koruny, hmotnost do tuny na kilogramy
 * a výš na tři platné číslice, únosnost na desetinu tuny na 100 000 Kč (v těch jednotkách ji
 * taky vrací). Stupně se porovnávají v těchhle číslech, takže hráč nikdy neuvidí hodnotu
 * stejnou jako práh, který „nesplnil“.
 */
export function zobrazenaHodnota(druh: DruhVyzvy, hodnota: number): number {
  if (druh === "cena") return Math.round(hodnota);
  if (druh === "hmotnost") return hodnota < 1000 ? Math.round(hodnota) : naTriCislice(hodnota, "nejbliz");
  return Math.round(tunNaStoTisic(hodnota) * 10) / 10;
}

/**
 * Prahy ceny nebo hmotnosti. Bez šampiona je zlato most autora a stříbro s bronzem mají
 * rezervu. Se šampionem, který je lepší než most autora, je zlato kousek nad šampionem,
 * stříbro most autora a bronz má rezervu jako dřív.
 */
function prahyDoMeze(
  autor: number,
  mostovka: number,
  sampion: { celkem: number; mostovka: number } | null,
  strop: number | null,
): [number, number, number] {
  const autoruv = naTriCislice(autor, "nahoru");
  let zlato = autoruv;
  if (sampion) {
    const konstrukce = Math.max(0, sampion.celkem - sampion.mostovka);
    const nadSampionem = Math.max(sampion.mostovka + REZERVA_NAD_SAMPIONEM * konstrukce, ODSTUP_OD_SAMPIONA * sampion.celkem);
    zlato = Math.min(autoruv, naTriCislice(nadSampionem, "nahoru"));
  }
  const prahy = [0, 0, zlato] as [number, number, number];
  for (const i of [1, 0] as const) {
    let prah: number;
    if (i === 1 && zlato < autoruv) prah = autoruv;
    else {
      // Rezerva na nosnou konstrukci mostu autora, nejmíň ale pár procent celého mostu.
      prah = Math.max(mostovka + REZERVA_KONSTRUKCE[i] * Math.max(0, autor - mostovka), NEJMENSI_ODSTUP[i] * autor);
      if (strop !== null && strop > autoruv) prah = Math.min(prah, autoruv + PODIL_DO_ROZPOCTU[i] * (strop - autoruv));
      prah = naTriCislice(prah, "nahoru");
    }
    // Stupně musí jít po sobě i tam, kde je rozpočet těsně nad mostem autora: aspoň o jeden krok.
    const prisnejsi = prahy[i + 1]!;
    prahy[i] = prah > prisnejsi ? prah : naTriCislice(prisnejsi * 1.0011, "nahoru");
  }
  return prahy;
}

/** Prahy výzev úrovně odvozené z jejích referenčních mostů. */
export function prahyVyzev(zaklad: ZakladVyzev): PrahyVyzev {
  const zlom = PODIL_UNOSNOSTI.map((k) => naTriCislice(k * zaklad.zlom, "dolu"));
  const s = zaklad.sampion;
  return {
    cena: prahyDoMeze(zaklad.cena, zaklad.cenaMostovky, s && { celkem: s.cena, mostovka: s.cenaMostovky }, zaklad.rozpocet),
    hmotnost: prahyDoMeze(zaklad.hmotnost, zaklad.hmotnostMostovky, s && { celkem: s.hmotnost, mostovka: s.hmotnostMostovky }, null),
    zlom: [zlom[0]!, zlom[1]!, zlom[2]!],
  };
}

/** Je ve výzvě lepší menší číslo (cena, hmotnost), nebo větší (únosnost na korunu)? */
export function mensiJeLepsi(druh: DruhVyzvy): boolean {
  return druh !== "zlom";
}

/** Jaký stupeň výzvy hodnota získá; null (ještě nezměřeno) žádný. Porovnává se, co hráč vidí. */
export function stupenVyzvy(druh: DruhVyzvy, hodnota: number | null, prahy: PrahyVyzev): StupenVyzvy {
  if (hodnota === null || !(hodnota > 0)) return 0;
  const p = prahy[druh];
  const videt = zobrazenaHodnota(druh, hodnota);
  const splni = (prah: number): boolean => {
    const mez = zobrazenaHodnota(druh, prah);
    return mensiJeLepsi(druh) ? videt <= mez : videt >= mez;
  };
  return splni(p[2]) ? 3 : splni(p[1]) ? 2 : splni(p[0]) ? 1 : 0;
}

/** Práh nejbližšího vyššího stupně; null, když už je zlato. */
export function dalsiPrah(druh: DruhVyzvy, stupen: StupenVyzvy, prahy: PrahyVyzev): number | null {
  return stupen === 3 ? null : prahy[druh][stupen];
}

/** Únosnost na korunu v N/Kč z výsledku zkoušky do zlomu; most zadarmo neexistuje. */
export function unosnostNaKorunu(celkem: number, cena: number): number {
  return cena > 0 ? celkem / cena : 0;
}
