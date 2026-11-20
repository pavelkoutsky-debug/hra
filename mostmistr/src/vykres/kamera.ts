import type { Bod, Obdelnik } from "../data/geometrie";

/**
 * Pohled na výkres. `x`, `y` je bod světa (metry, y nahoru) uprostřed plátna,
 * `meritko` je počet pixelů na metr.
 */
export interface Kamera {
  x: number;
  y: number;
  meritko: number;
}

/** Rozměr plátna v CSS pixelech. */
export interface Rozmer {
  sirka: number;
  vyska: number;
}

export const MERITKO_MIN = 3;
export const MERITKO_MAX = 240;

export function svetNaObraz(k: Kamera, r: Rozmer, b: Bod): Bod {
  return {
    x: r.sirka / 2 + (b.x - k.x) * k.meritko,
    y: r.vyska / 2 - (b.y - k.y) * k.meritko,
  };
}

export function obrazNaSvet(k: Kamera, r: Rozmer, b: Bod): Bod {
  return {
    x: k.x + (b.x - r.sirka / 2) / k.meritko,
    y: k.y - (b.y - r.vyska / 2) / k.meritko,
  };
}

/** Posune výkres o daný počet pixelů; obsah jede s kurzorem. */
export function posunO(k: Kamera, dx: number, dy: number): Kamera {
  return { ...k, x: k.x - dx / k.meritko, y: k.y + dy / k.meritko };
}

/**
 * Změní měřítko tak, aby bod světa pod `kotva` (pixely plátna) zůstal na místě.
 * `nejmensi` je dolní mez měřítka; hra ji nastavuje na pohled s celým výkresem,
 * protože dál už není na co se dívat.
 */
export function zoomKolem(k: Kamera, r: Rozmer, kotva: Bod, faktor: number, nejmensi = MERITKO_MIN): Kamera {
  const meritko = Math.min(MERITKO_MAX, Math.max(nejmensi, k.meritko * faktor));
  const podKotvou = obrazNaSvet(k, r, kotva);
  return {
    x: podKotvou.x - (kotva.x - r.sirka / 2) / meritko,
    y: podKotvou.y + (kotva.y - r.vyska / 2) / meritko,
    meritko,
  };
}

/** Pohled, do kterého se vejde celý výřez s okrajem `okraj` pixelů. */
export function celyVyrez(vyrez: Obdelnik, r: Rozmer, okraj: number): Kamera {
  const sirka = Math.max(1, r.sirka - 2 * okraj);
  const vyska = Math.max(1, r.vyska - 2 * okraj);
  const meritko = Math.min(
    MERITKO_MAX,
    sirka / (vyrez.xMax - vyrez.xMin),
    vyska / (vyrez.yMax - vyrez.yMin),
  );
  return {
    x: (vyrez.xMin + vyrez.xMax) / 2,
    y: (vyrez.yMin + vyrez.yMax) / 2,
    meritko,
  };
}

/** Jak daleko za okraj výřezu smí pohled zajet, jako podíl šířky a výšky plátna. */
export const VULE_POSUNU = 0.35;

/**
 * Udrží pohled u výkresu: za okraj výřezu smí zajet nejvýš o `vule` plátna.
 * Vůle je potřeba, aby šlo odsunout část výkresu zpod panelů, které plátno překrývají.
 * Když se výřez i s vůlí vejde na plátno celý, drží se uprostřed.
 */
export function omezNaVyrez(k: Kamera, vyrez: Obdelnik, r: Rozmer, vule = VULE_POSUNU): Kamera {
  const osa = (stred: number, min: number, max: number, pixelu: number): number => {
    const pul = pixelu / 2 / k.meritko;
    const presah = (vule * pixelu) / k.meritko;
    const dolni = min + pul - presah;
    const horni = max - pul + presah;
    if (dolni > horni) return (min + max) / 2;
    return Math.min(horni, Math.max(dolni, stred));
  };
  return {
    ...k,
    x: osa(k.x, vyrez.xMin, vyrez.xMax, r.sirka),
    y: osa(k.y, vyrez.yMin, vyrez.yMax, r.vyska),
  };
}

/** Část světa, která je právě vidět. */
export function viditelnaOblast(k: Kamera, r: Rozmer): Obdelnik {
  const pulSirky = r.sirka / 2 / k.meritko;
  const pulVysky = r.vyska / 2 / k.meritko;
  return { xMin: k.x - pulSirky, xMax: k.x + pulSirky, yMin: k.y - pulVysky, yMax: k.y + pulVysky };
}
