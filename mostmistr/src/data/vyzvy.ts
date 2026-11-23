// Výzvy o efektivitu (koncepce, kap. 4): tři měřítka, kterými se dá na úrovni kampaně
// soutěžit dál, i když už je projitá. Nejlevnější a nejlehčí most se měří při každé úspěšné
// zkoušce, únosnost na korunu zkouškou do zlomu. Každá výzva má prahy bronz, stříbro a zlato;
// zlato odpovídá nejlepšímu referenčnímu mostu úrovně, takže je vždy dosažitelné.

export const DRUHY_VYZEV = ["cena", "hmotnost", "zlom"] as const;
export type DruhVyzvy = (typeof DRUHY_VYZEV)[number];

/** Stupeň výzvy: 0 žádný, 1 bronz, 2 stříbro, 3 zlato. */
export type StupenVyzvy = 0 | 1 | 2 | 3;
export const NAZVY_STUPNU = ["zadny", "bronz", "stribro", "zlato"] as const;

/** Co ve výzvách dokázal nejlepší referenční most úrovně. */
export interface ZakladVyzev {
  /** Cena nejlevnějšího referenčního mostu a kolik z ní stojí mostovka, Kč. */
  cena: number;
  cenaMostovky: number;
  /** Hmotnost nejlehčího referenčního mostu a kolik z ní váží mostovka s vybavením, kg. */
  hmotnost: number;
  hmotnostMostovky: number;
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

/** Prahy ceny nebo hmotnosti: zlato je referenční most, stříbro a bronz mají rezervu. */
function prahyDoMeze(nejlepsi: number, mostovka: number, strop: number | null): [number, number, number] {
  const zlato = naTriCislice(nejlepsi, "nahoru");
  const prahy = [0, 0, zlato] as [number, number, number];
  for (const i of [1, 0] as const) {
    // Rezerva na nosnou konstrukci, nejmíň ale pár procent celého mostu.
    let prah = Math.max(mostovka + REZERVA_KONSTRUKCE[i] * Math.max(0, nejlepsi - mostovka), NEJMENSI_ODSTUP[i] * nejlepsi);
    if (strop !== null && strop > zlato) prah = Math.min(prah, zlato + PODIL_DO_ROZPOCTU[i] * (strop - zlato));
    prah = naTriCislice(prah, "nahoru");
    // Stupně musí jít po sobě i tam, kde je rozpočet těsně nad zlatem: aspoň o jeden krok.
    const prisnejsi = prahy[i + 1]!;
    prahy[i] = prah > prisnejsi ? prah : naTriCislice(prisnejsi * 1.0011, "nahoru");
  }
  return prahy;
}

/** Prahy výzev úrovně odvozené z jejích referenčních mostů. */
export function prahyVyzev(zaklad: ZakladVyzev): PrahyVyzev {
  const zlom = PODIL_UNOSNOSTI.map((k) => naTriCislice(k * zaklad.zlom, "dolu"));
  return {
    cena: prahyDoMeze(zaklad.cena, zaklad.cenaMostovky, zaklad.rozpocet),
    hmotnost: prahyDoMeze(zaklad.hmotnost, zaklad.hmotnostMostovky, null),
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
