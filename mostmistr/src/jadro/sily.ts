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
  const { mezTahu, mezMomentu, plastA, plastB, plastDelka, zatMomentA, zatMomentB } = s;
  const plasticky = !s.plasticitaZmrazena;

  fx.fill(0);
  fy.fill(0);
  moment.fill(0);

  const pocet = s.pocetPrvku;
  for (let e = 0; e < pocet; e++) {
    const a = prvekA[e]!;
    const b = prvekB[e]!;
    const dx = x[b]! - x[a]!;
    const dy = y[b]! - y[a]!;
    const delka = Math.sqrt(dx * dx + dy * dy);
    // Prvek smrštěný do bodu nemá směr (díly svislého lana, které po zřícení dopadly na jedno
    // místo terénu); bere se směr z výchozí polohy. Lano v tom stavu stejně nic nenese.
    const ex = delka > 0 ? dx / delka : osaX0[e]!;
    const ey = delka > 0 ? dy / delka : osaY0[e]!;
    const dvx = vx[b]! - vx[a]!;
    const dvy = vy[b]! - vy[a]!;
    const tlumeni = beta[e]!;

    // Osová síla; kladná je tah. Trvalé protažení prvek prodlužuje.
    let osova =
      tuhostOsova[e]! * (delka - klidovaDelka[e]! - plastDelka[e]! + tlumeni * (ex * dvx + ey * dvy));
    if (druh[e] === LANO && osova < 0) osova = 0; // lano netlačí
    if (osova > mezTahu[e]! && plasticky) osova = zplastizujTah(s, e, osova);
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

        // Pružná část natočení: celkové bez trvalého natočení plastického kloubu.
        let deformaceA = psiA - plastA[e]!;
        let deformaceB = psiB - plastB[e]!;
        if (tlumeni !== 0) {
          // Rychlost natočení spojnice: příčná složka rozdílu rychlostí konců dělená délkou.
          const rychlostAlfa = (ex * dvy - ey * dvx) / delka;
          deformaceA += tlumeni * kapaA * (omega[a]! - rychlostAlfa);
          deformaceB += tlumeni * kapaB * (omega[b]! - rychlostAlfa);
        }
        const tuhostAB = kAB[e]!;
        let mA = tuhostA * deformaceA + tuhostAB * deformaceB;
        let mB = tuhostAB * deformaceA + tuhostB * deformaceB;

        const mezOhybu = mezMomentu[e]!;
        if (mezOhybu !== Infinity && plasticky) {
          // Plastický kloub: skutečný moment na konci (včetně zatížení uvnitř prvku
          // z minulého kroku) nepřekročí plastickou únosnost sníženou osovou silou.
          const podilOsove = Math.abs(osova) / s.unosnostTah[e]!;
          const mez = mezOhybu * (podilOsove < 0.95 ? 1 - podilOsove : 0.05);
          const skutecnyA = mA - zatMomentA[e]!;
          const skutecnyB = mB - zatMomentB[e]!;
          if (skutecnyA > mez || skutecnyA < -mez || skutecnyB > mez || skutecnyB < -mez) {
            zplastizujOhyb(s, e, skutecnyA, skutecnyB, mez);
            mA -= tuhostA * natoceniA + tuhostAB * natoceniB;
            mB -= tuhostAB * natoceniA + tuhostB * natoceniB;
          }
        }
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

  // Zatížení uvnitř prvků z minulého kroku už bylo použito; nové přičte volající.
  vynulujZatizeniPrvku(s);
}

// Výsledek `zplastizujOhyb`: přírůstky trvalého natočení na koncích a a b.
let natoceniA = 0;
let natoceniB = 0;

/** O kolik moment přesahuje mez; se znaménkem momentu, nula uvnitř meze. */
function presah(moment: number, mez: number): number {
  return moment > mez ? moment - mez : moment < -mez ? moment + mez : 0;
}

/**
 * Najde přírůstky trvalého natočení v plastických kloubech prvku tak, aby koncové
 * momenty nepřekročily `mez`, a uloží je do `natoceniA`, `natoceniB`.
 * Když tečou oba konce, řeší se společně, protože se přes tuhost prvku ovlivňují.
 */
function zplastizujOhyb(s: Soustava, e: number, skutecnyA: number, skutecnyB: number, mez: number): void {
  const tuhostA = s.kAA[e]!;
  const tuhostB = s.kBB[e]!;
  const tuhostAB = s.kAB[e]!;
  let presahA = tuhostA !== 0 ? presah(skutecnyA, mez) : 0;
  let presahB = tuhostB !== 0 ? presah(skutecnyB, mez) : 0;
  natoceniA = 0;
  natoceniB = 0;

  if (presahA !== 0 && presahB !== 0) {
    const determinant = tuhostA * tuhostB - tuhostAB * tuhostAB;
    const spolecneA = (presahA * tuhostB - presahB * tuhostAB) / determinant;
    const spolecneB = (presahB * tuhostA - presahA * tuhostAB) / determinant;
    // Platí jen tehdy, když se oba klouby natáčejí ve směru svého momentu.
    if (spolecneA * presahA >= 0 && spolecneB * presahB >= 0) {
      natoceniA = spolecneA;
      natoceniB = spolecneB;
      presahA = 0;
      presahB = 0;
    }
  }
  if (presahA !== 0 || presahB !== 0) {
    // Teče jen jeden konec, nebo společné řešení nevyhovělo: nejdřív víc přetížený konec,
    // potom druhý s momentem, který mu po prvním zbyl.
    if (Math.abs(presahA) >= Math.abs(presahB)) {
      natoceniA = presahA / tuhostA;
      const zbylyB = tuhostB !== 0 ? presah(skutecnyB - tuhostAB * natoceniA, mez) : 0;
      natoceniB = zbylyB !== 0 ? zbylyB / tuhostB : 0;
    } else {
      natoceniB = presahB / tuhostB;
      const zbylyA = tuhostA !== 0 ? presah(skutecnyA - tuhostAB * natoceniB, mez) : 0;
      natoceniA = zbylyA !== 0 ? zbylyA / tuhostA : 0;
    }
  }

  s.plastA[e] = s.plastA[e]! + natoceniA;
  s.plastB[e] = s.plastB[e]! + natoceniB;
  s.plastickaPrace += mez * (Math.abs(natoceniA) + Math.abs(natoceniB));
}

/**
 * Tahová síla nad mezí kluzu: prvek se trvale protáhne tak, aby síla klesla na mez.
 * Mez s protažením lineárně roste od meze kluzu k síle přetržení (zpevnění).
 */
function zplastizujTah(s: Soustava, e: number, osova: number): number {
  const kluz = s.mezTahu[e]!;
  const mezni = s.mezniProtazeni[e]! * s.klidovaDelka[e]!;
  const zpevneni = (s.silaPretrzeni[e]! - kluz) / mezni;
  const tuhost = s.tuhostOsova[e]!;
  const mez = kluz + zpevneni * Math.min(s.plastDelka[e]!, mezni);
  if (osova <= mez) return osova;
  // Nové protažení d splní tuhost·(přebytek − d) = zpevnění·d.
  const protazeni = (osova - mez) / (tuhost + zpevneni);
  s.plastDelka[e] = s.plastDelka[e]! + protazeni;
  const nova = osova - tuhost * protazeni;
  s.plastickaPrace += nova * protazeni;
  return nova;
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

/** Deformační energie prvku `e` v aktuální poloze, v joulech. */
export function energiePrvku(s: Soustava, e: number): number {
  const a = s.prvekA[e]!;
  const b = s.prvekB[e]!;
  const dx = s.x[b]! - s.x[a]!;
  const dy = s.y[b]! - s.y[a]!;
  const delka = Math.sqrt(dx * dx + dy * dy);
  const protazeni = delka - s.klidovaDelka[e]! - s.plastDelka[e]!;
  let energie = 0;
  if (!(s.druh[e] === LANO && protazeni < 0)) energie = 0.5 * s.tuhostOsova[e]! * protazeni * protazeni;

  if (s.druh[e] === NOSNIK) {
    const ex = dx / delka;
    const ey = dy / delka;
    const cosAlfa = s.osaX0[e]! * ex + s.osaY0[e]! * ey;
    const sinAlfa = s.osaX0[e]! * ey - s.osaY0[e]! * ex;
    const psiA = s.sinN[a]! * cosAlfa - s.cosN[a]! * sinAlfa - s.plastA[e]!;
    const psiB = s.sinN[b]! * cosAlfa - s.cosN[b]! * sinAlfa - s.plastB[e]!;
    energie += 0.5 * s.kAA[e]! * psiA * psiA + s.kAB[e]! * psiA * psiB + 0.5 * s.kBB[e]! * psiB * psiB;
  }
  return energie;
}

/** Deformační energie všech prvků v aktuální poloze, v joulech. */
export function deformacniEnergie(s: Soustava): number {
  let energie = 0;
  for (let e = 0; e < s.pocetPrvku; e++) energie += energiePrvku(s, e);
  return energie;
}
