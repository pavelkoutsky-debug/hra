import { spoctiVnitrniSily } from "./sily";
import type { Soustava } from "./soustava";
import { pridejTlumice } from "./tlumice";
import { pridejModalniTlumeni, type ModalniTlumeni } from "./tlumeni";
import { energieTihyPrvku, pridejTihuPrvku } from "./zatizeni";

/** Tíhové zrychlení v m/s². */
export const TIHOVE_ZRYCHLENI = 9.80665;

export interface NastaveniKroku {
  /** Délka kroku v sekundách. */
  dt: number;
  /** Tíhové zrychlení; 0 tíhu vypne. */
  tiha: number;
  /** Tlumení úměrné hmotě v 1/s: síla −α·m·v. */
  alfa: number;
  /** Tlumení vlastních tvarů; viz `tlumeni.ts`. */
  modalni?: ModalniTlumeni;
  /**
   * Další síly působící na styčníky (kola, lidé). Volá se po výpočtu sil mostu
   * a smí k polím `fx`, `fy`, `moment` jen přičítat.
   */
  dalsiSily?: (s: Soustava) => void;
}

/**
 * Přičte ke vnitřním silám tíhu a tlumení úměrné hmotě. Po zavolání obsahují
 * `fx`, `fy`, `moment` výslednou sílu na každý styčník.
 */
export function spoctiSily(s: Soustava, tiha: number, alfa: number, modalni?: ModalniTlumeni): void {
  spoctiVnitrniSily(s);
  if (modalni) pridejModalniTlumeni(s, modalni);
  const { fx, fy, moment, hmota, setrvacnost, vx, vy, omega } = s;
  const pocet = s.pocetStycniku;
  for (let i = 0; i < pocet; i++) {
    const m = hmota[i]!;
    fx[i] = fx[i]! - alfa * m * vx[i]!;
    fy[i] = fy[i]! - m * tiha - alfa * m * vy[i]!;
    moment[i] = moment[i]! - alfa * setrvacnost[i]! * omega[i]!;
  }
  // Tíha prutů s tuhými konci působí po délce, ne jen ve styčnících.
  pridejTihuPrvku(s, tiha);
}

/**
 * Jeden krok času metodou velocity Verlet (půlkrok rychlosti, krok polohy, síly, půlkrok rychlosti).
 * Metoda je symplektická: sama energii soustavy dlouhodobě nemění. Je podmíněně stabilní,
 * krok musí být kratší než 2/ω_max; viz `stabilita.ts`.
 *
 * Před prvním krokem musí být síly spočítané pro výchozí stav (`spoctiSily`).
 */
export function krok(s: Soustava, n: NastaveniKroku): void {
  const { x, y, cosN, sinN, vx, vy, omega, fx, fy, moment, invHmotaX, invHmotaY, invSetrvacnost } = s;
  const pocet = s.pocetStycniku;
  const pul = 0.5 * n.dt;
  const dt = n.dt;

  for (let i = 0; i < pocet; i++) {
    const rychlostX = vx[i]! + pul * fx[i]! * invHmotaX[i]!;
    const rychlostY = vy[i]! + pul * fy[i]! * invHmotaY[i]!;
    vx[i] = rychlostX;
    vy[i] = rychlostY;
    x[i] = x[i]! + dt * rychlostX;
    y[i] = y[i]! + dt * rychlostY;

    const invJ = invSetrvacnost[i]!;
    if (invJ !== 0) {
      const uhlova = omega[i]! + pul * moment[i]! * invJ;
      omega[i] = uhlova;
      // Otočení o ω·dt racionální (Cayleyho) formulí: přesně zachovává jednotkovou délku
      // a nepotřebuje sinus ani kosinus. Úhel se liší od ω·dt až ve třetím řádu.
      const t = 0.5 * dt * uhlova;
      const jmenovatel = 1 / (1 + t * t);
      const c = (1 - t * t) * jmenovatel;
      const sn = 2 * t * jmenovatel;
      const cosStary = cosN[i]!;
      const sinStary = sinN[i]!;
      cosN[i] = cosStary * c - sinStary * sn;
      sinN[i] = sinStary * c + cosStary * sn;
    }
  }

  spoctiSily(s, n.tiha, n.alfa, n.modalni);
  if (n.dalsiSily) n.dalsiSily(s);
  if (s.pocetTlumicu > 0) pridejTlumice(s, dt);

  for (let i = 0; i < pocet; i++) {
    vx[i] = vx[i]! + pul * fx[i]! * invHmotaX[i]!;
    vy[i] = vy[i]! + pul * fy[i]! * invHmotaY[i]!;
    omega[i] = omega[i]! + pul * moment[i]! * invSetrvacnost[i]!;
  }
}

/** Pohybová energie soustavy v joulech. */
export function kinetickaEnergie(s: Soustava): number {
  const { vx, vy, omega, hmota, setrvacnost, invHmotaX, invHmotaY, invSetrvacnost } = s;
  let energie = 0;
  for (let i = 0; i < s.pocetStycniku; i++) {
    const m = hmota[i]!;
    if (invHmotaX[i] !== 0) energie += 0.5 * m * vx[i]! * vx[i]!;
    if (invHmotaY[i] !== 0) energie += 0.5 * m * vy[i]! * vy[i]!;
    if (invSetrvacnost[i] !== 0) energie += 0.5 * setrvacnost[i]! * omega[i]! * omega[i]!;
  }
  return energie;
}

/** Polohová energie v tíhovém poli vztažená k výšce y = 0, v joulech. */
export function polohovaEnergie(s: Soustava, tiha: number): number {
  let energie = 0;
  for (let i = 0; i < s.pocetStycniku; i++) {
    if (s.invHmotaY[i] !== 0) energie += s.hmota[i]! * tiha * s.y[i]!;
  }
  // Tíha prutů s tuhými konci působí po délce: část polohové energie nese jejich průhyb.
  energie += energieTihyPrvku(s, tiha);
  return energie;
}
