import { LANO, NOSNIK, type Soustava } from "./soustava";

/**
 * Spočítá vnitřní síly prvků a uloží jejich účinek na styčníky do `fx`, `fy`, `moment`
 * (pole nejdřív vynuluje). Vnější zatížení a tíhu přičítá až integrátor.
 *
 * Korotační formulace: prvek se sleduje ve své okamžité poloze, takže platí i pro
 * libovolně velké posuny a natočení. Deformace prvku tvoří
 *   u   = L − L0                       protažení,
 *   ψ_a = sin(θ_a − α), ψ_b obdobně    natočení konců vůči spojnici,
 * kde α je natočení spojnice styčníků proti výchozí poloze. Síly na styčníky jsou
 * přesným gradientem deformační energie ½·k·u² + ½·ψᵀ·K·ψ, takže výpočet sám
 * energii nepřidává ani neubírá. Sinus místo úhlu dovoluje obejít se bez
 * goniometrických funkcí; pro malé deformace prvku je rozdíl třetího řádu.
 */
export function spoctiVnitrniSily(s: Soustava): void {
  const { x, y, cosN, sinN, vx, vy, omega, fx, fy, moment } = s;
  const { prvekA, prvekB, druh, klidovaDelka, osaX0, osaY0, tuhostOsova, kAA, kAB, kBB, beta } = s;
  const { osovaSila, momentA, momentB } = s;

  fx.fill(0);
  fy.fill(0);
  moment.fill(0);
  vynulujZatizeniPrvku(s);

  const pocet = s.pocetPrvku;
  for (let e = 0; e < pocet; e++) {
    const a = prvekA[e]!;
    const b = prvekB[e]!;
    const dx = x[b]! - x[a]!;
    const dy = y[b]! - y[a]!;
    const delka = Math.sqrt(dx * dx + dy * dy);
    const ex = dx / delka;
    const ey = dy / delka;
    const dvx = vx[b]! - vx[a]!;
    const dvy = vy[b]! - vy[a]!;
    const tlumeni = beta[e]!;

    // Osová síla; kladná je tah.
    let osova = tuhostOsova[e]! * (delka - klidovaDelka[e]! + tlumeni * (ex * dvx + ey * dvy));
    if (druh[e] === LANO && osova < 0) osova = 0; // lano netlačí
    osovaSila[e] = osova;

    let posouvajici = 0;
    if (druh[e] === NOSNIK) {
      const tuhostA = kAA[e]!;
      const tuhostB = kBB[e]!;
      if (tuhostA !== 0 || tuhostB !== 0) {
        // Natočení spojnice proti výchozí poloze.
        const cosAlfa = osaX0[e]! * ex + osaY0[e]! * ey;
        const sinAlfa = osaX0[e]! * ey - osaY0[e]! * ex;
        // Natočení konců vůči spojnici: ψ = sin(θ − α), κ = cos(θ − α).
        const psiA = sinN[a]! * cosAlfa - cosN[a]! * sinAlfa;
        const psiB = sinN[b]! * cosAlfa - cosN[b]! * sinAlfa;
        const kapaA = cosN[a]! * cosAlfa + sinN[a]! * sinAlfa;
        const kapaB = cosN[b]! * cosAlfa + sinN[b]! * sinAlfa;

        let deformaceA = psiA;
        let deformaceB = psiB;
        if (tlumeni !== 0) {
          // Rychlost natočení spojnice: příčná složka rozdílu rychlostí konců dělená délkou.
          const rychlostAlfa = (ex * dvy - ey * dvx) / delka;
          deformaceA += tlumeni * kapaA * (omega[a]! - rychlostAlfa);
          deformaceB += tlumeni * kapaB * (omega[b]! - rychlostAlfa);
        }
        const tuhostAB = kAB[e]!;
        const mA = tuhostA * deformaceA + tuhostAB * deformaceB;
        const mB = tuhostAB * deformaceA + tuhostB * deformaceB;
        momentA[e] = mA;
        momentB[e] = mB;

        moment[a] = moment[a]! - mA * kapaA;
        moment[b] = moment[b]! - mB * kapaB;
        posouvajici = (mA * kapaA + mB * kapaB) / delka;
      }
    }

    // Síla na styčník a je N·e − V·n, kde n = (−e_y, e_x); na styčník b opačná.
    const silaX = osova * ex + posouvajici * ey;
    const silaY = osova * ey - posouvajici * ex;
    fx[a] = fx[a]! + silaX;
    fy[a] = fy[a]! + silaY;
    fx[b] = fx[b]! - silaX;
    fy[b] = fy[b]! - silaY;
  }
}

/** Zapomene zatížení prvků z minulého kroku; nuluje jen prvky, které nějaké měly. */
function vynulujZatizeniPrvku(s: Soustava): void {
  const { zatizenePrvky, zatSilaA, zatSilaB, zatMomentA, zatMomentB, zatMomentPole } = s;
  for (let i = 0; i < s.pocetZatizenych; i++) {
    const e = zatizenePrvky[i]!;
    zatSilaA[e] = 0;
    zatSilaB[e] = 0;
    zatMomentA[e] = 0;
    zatMomentB[e] = 0;
    zatMomentPole[3 * e] = 0;
    zatMomentPole[3 * e + 1] = 0;
    zatMomentPole[3 * e + 2] = 0;
    s.jeZatizen[e] = 0;
  }
  s.pocetZatizenych = 0;
}

/** Deformační energie všech prvků v aktuální poloze, v joulech. */
export function deformacniEnergie(s: Soustava): number {
  const { x, y, cosN, sinN, prvekA, prvekB, druh, klidovaDelka, osaX0, osaY0, tuhostOsova, kAA, kAB, kBB } = s;
  let energie = 0;
  for (let e = 0; e < s.pocetPrvku; e++) {
    const a = prvekA[e]!;
    const b = prvekB[e]!;
    const dx = x[b]! - x[a]!;
    const dy = y[b]! - y[a]!;
    const delka = Math.sqrt(dx * dx + dy * dy);
    const protazeni = delka - klidovaDelka[e]!;
    if (!(druh[e] === LANO && protazeni < 0)) energie += 0.5 * tuhostOsova[e]! * protazeni * protazeni;

    if (druh[e] === NOSNIK) {
      const ex = dx / delka;
      const ey = dy / delka;
      const cosAlfa = osaX0[e]! * ex + osaY0[e]! * ey;
      const sinAlfa = osaX0[e]! * ey - osaY0[e]! * ex;
      const psiA = sinN[a]! * cosAlfa - cosN[a]! * sinAlfa;
      const psiB = sinN[b]! * cosAlfa - cosN[b]! * sinAlfa;
      energie += 0.5 * kAA[e]! * psiA * psiA + kAB[e]! * psiA * psiB + 0.5 * kBB[e]! * psiB * psiB;
    }
  }
  return energie;
}
