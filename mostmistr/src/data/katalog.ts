// Katalog stavebních prvků a druhů provozu.
// Jediné místo, kde žijí vlastnosti prvků; ceny a mechanické vlastnosti sem přibudou
// v milníku M1b po ověření proti normám. Uložené mosty a rekordy ceny neobsahují.

export const ID_PRVKU = [
  "mostovka-drevo",
  "mostovka-ocelobeton",
  "kolejiste",
  "drevo-lehke",
  "drevo-tezke",
  "ocel-lehka",
  "ocel-tezka",
  "lano",
  "pilir",
  "tlumic",
  "pruzina",
  "pist",
] as const;

export type IdPrvku = (typeof ID_PRVKU)[number];

export type DruhPrvku = "mostovka" | "prut" | "lano" | "pilir" | "tlumic" | "pruzina" | "pist";

export interface PolozkaKatalogu {
  druh: DruhPrvku;
  /** Největší délka jednoho prutu v metrech. */
  nejvetsiDelka: number;
  /** Zda fyzikální jádro prvek už umí. Dokud ne, kontrola návrhu ho odmítne. */
  hotovo: boolean;
}

// Délky nosných prvků jsou z koncepce (kap. 5); u tlumiče, pružiny a pístu jsou předběžné.
export const KATALOG: Readonly<Record<IdPrvku, PolozkaKatalogu>> = {
  "mostovka-drevo": { druh: "mostovka", nejvetsiDelka: 4, hotovo: false },
  "mostovka-ocelobeton": { druh: "mostovka", nejvetsiDelka: 6, hotovo: false },
  kolejiste: { druh: "mostovka", nejvetsiDelka: 6, hotovo: false },
  "drevo-lehke": { druh: "prut", nejvetsiDelka: 6, hotovo: false },
  "drevo-tezke": { druh: "prut", nejvetsiDelka: 6, hotovo: false },
  "ocel-lehka": { druh: "prut", nejvetsiDelka: 12, hotovo: false },
  "ocel-tezka": { druh: "prut", nejvetsiDelka: 12, hotovo: false },
  lano: { druh: "lano", nejvetsiDelka: 60, hotovo: false },
  pilir: { druh: "pilir", nejvetsiDelka: 12, hotovo: false },
  tlumic: { druh: "tlumic", nejvetsiDelka: 6, hotovo: false },
  pruzina: { druh: "pruzina", nejvetsiDelka: 6, hotovo: false },
  pist: { druh: "pist", nejvetsiDelka: 8, hotovo: false },
};

/** Nejkratší prut, který lze postavit (rastr 1 m). */
export const NEJMENSI_DELKA = 1;

export const ID_PROVOZU = [
  "chodec",
  "bezec",
  "dav",
  "utvar",
  "bezecky-zavod",
  "pruvod",
  "skakajici-dav",
  "cyklista",
  "motocykl",
  "auto",
  "dodavka",
  "autobus",
  "nakladni",
  "souprava",
  "traktor",
  "nadmerny",
  "lokomotiva",
  "vuz-nakladni",
  "vuz-osobni",
  "lod",
] as const;

export type IdProvozu = (typeof ID_PROVOZU)[number];
