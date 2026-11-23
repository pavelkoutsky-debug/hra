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
/** Jakou část únosnosti na korunu referenčního mostu výzva chce: bronz 45 %, stříbro 70 %, zlato 95 %. */
const PODIL_UNOSNOSTI = [0.45, 0.7, 0.95] as const;

/** Zaokrouhlí na tři platné číslice směrem nahoru nebo dolů; práh pak jde přečíst. */
function naTriCislice(hodnota: number, nahoru: boolean): number {
  if (!(hodnota > 0)) return 0;
  let rad = 1;
  while (hodnota / rad >= 1000) rad *= 10;
  while (hodnota / rad < 100) rad /= 10;
  const podil = hodnota / rad;
  // Malá tolerance, aby se číslo, které už zaokrouhlené je, neposunulo o řád výš.
  const cele = nahoru ? Math.ceil(podil - 1e-9) : Math.floor(podil + 1e-9);
  return Number((cele * rad).toPrecision(3));
}

/** Prahy výzev úrovně odvozené z jejích referenčních mostů. */
export function prahyVyzev(zaklad: ZakladVyzev): PrahyVyzev {
  const cena = REZERVA_KONSTRUKCE.map((k) =>
    naTriCislice(zaklad.cenaMostovky + k * Math.max(0, zaklad.cena - zaklad.cenaMostovky), true),
  );
  const hmotnost = REZERVA_KONSTRUKCE.map((k) =>
    naTriCislice(zaklad.hmotnostMostovky + k * Math.max(0, zaklad.hmotnost - zaklad.hmotnostMostovky), true),
  );
  const zlom = PODIL_UNOSNOSTI.map((k) => naTriCislice(k * zaklad.zlom, false));
  return {
    cena: [cena[0]!, cena[1]!, cena[2]!],
    hmotnost: [hmotnost[0]!, hmotnost[1]!, hmotnost[2]!],
    zlom: [zlom[0]!, zlom[1]!, zlom[2]!],
  };
}

/** Je ve výzvě lepší menší číslo (cena, hmotnost), nebo větší (únosnost na korunu)? */
export function mensiJeLepsi(druh: DruhVyzvy): boolean {
  return druh !== "zlom";
}

/** Jaký stupeň výzvy hodnota získá; null (ještě nezměřeno) žádný. */
export function stupenVyzvy(druh: DruhVyzvy, hodnota: number | null, prahy: PrahyVyzev): StupenVyzvy {
  if (hodnota === null || !(hodnota > 0)) return 0;
  const p = prahy[druh];
  const splni = (prah: number): boolean => (mensiJeLepsi(druh) ? hodnota <= prah : hodnota >= prah);
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
