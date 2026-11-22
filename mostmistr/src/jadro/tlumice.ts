// Viskózní tlumiče: síla úměrná rychlosti, jakou se prvek prodlužuje.
//
// Tlumič se nepočítá spolu s ostatními silami prvků, ale až po nich. Explicitní výpočet
// by s tuhým tlumičem divergoval, jakmile c·dt přesáhne dvojnásobek brzděné hmoty,
// a takový tlumič je přitom běžný stavební prvek. Síla se proto bere z rychlosti, jakou
// se prvek bude prodlužovat po působení všech sil včetně tlumiče samého:
//
//   F = c · (v + θ·dt·a) / (1 + θ·g),      g = c·dt/μ,
//
// kde v je okamžitá rychlost prodlužování, a zrychlení od ostatních sil a μ hmota, kterou
// tlumič na svých koncích brzdí. Váha θ = ½ dává přesnost druhého řádu (lichoběžníkové
// pravidlo) a platí pro g ≤ 2; pro tužší tlumiče roste k jedné tak, aby se rychlost
// prodlužování ustálila v jediném kroku a nepřekmitávala. Ustálená rychlost pod stálou
// silou vychází přesně F/c při každém θ.

import type { Soustava } from "./soustava";

/**
 * Přičte síly tlumičů ke styčníkům. Volá se jako poslední, po silách prvků, tíze,
 * tlumení i vnějším zatížení, protože z nich odhaduje zrychlení.
 */
export function pridejTlumice(s: Soustava, dt: number): void {
  const { x, y, vx, vy, fx, fy, invHmotaX, invHmotaY, prvekA, prvekB, tlumic, tlumice, osovaSila } = s;
  for (let i = 0; i < s.pocetTlumicu; i++) {
    const e = tlumice[i]!;
    const a = prvekA[e]!;
    const b = prvekB[e]!;
    const dx = x[b]! - x[a]!;
    const dy = y[b]! - y[a]!;
    const delka = Math.sqrt(dx * dx + dy * dy);
    // Tlumič smrštěný do bodu (trosky na jednom místě terénu) nemá směr a nebrzdí nic.
    if (!(delka > 0)) continue;
    const ex = dx / delka;
    const ey = dy / delka;

    const c = tlumic[e]!;
    const rychlost = ex * (vx[b]! - vx[a]!) + ey * (vy[b]! - vy[a]!);
    // Převrácená hodnota brzděné hmoty ve směru osy; zadržený stupeň volnosti nepřispívá.
    const poddajnost =
      ex * ex * (invHmotaX[a]! + invHmotaX[b]!) + ey * ey * (invHmotaY[a]! + invHmotaY[b]!);
    const zrychleni =
      ex * (fx[b]! * invHmotaX[b]! - fx[a]! * invHmotaX[a]!) +
      ey * (fy[b]! * invHmotaY[b]! - fy[a]! * invHmotaY[a]!);
    const g = c * dt * poddajnost;
    const theta = g <= 2 ? 0.5 : 1 - 1 / g;
    // Kladná síla je tah: tlumič brání prodlužování.
    const sila = (c * (rychlost + theta * dt * zrychleni)) / (1 + theta * g);

    fx[a] = fx[a]! + sila * ex;
    fy[a] = fy[a]! + sila * ey;
    fx[b] = fx[b]! - sila * ex;
    fy[b] = fy[b]! - sila * ey;
    osovaSila[e] = osovaSila[e]! + sila;
  }
}
