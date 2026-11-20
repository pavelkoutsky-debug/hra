// Maticová cesta výpočtu: matice tuhosti, statika, vlastní tvary a nejvyšší frekvence.
// Doplňuje časovou simulaci tam, kde je potřeba odpověď hned (stavební režim) nebo
// vlastnost soustavy jako celku (krok integrace, tlumení vlastních tvarů).
//
// Matice jsou husté a ukládají se po řádcích do Float64Array. Pro mosty do několika set
// styčníků to stačí; rozklad soustavy s 900 neznámými trvá desetiny sekundy.

import { spoctiVnitrniSily } from "./sily";
import type { Soustava } from "./soustava";
import { hmotyStupnu, obnovPolohu, posunStupne, silyStupnu, ulozPolohu } from "./stupne";

/** Krok numerické derivace sil: metry u posunů, radiány u natočení. */
const KROK_DERIVACE = 1e-6;

/**
 * Sestaví tečnou matici tuhosti v aktuální poloze numerickou derivací vnitřních sil.
 * Zahrnuje pružnou i geometrickou tuhost (vliv osových sil na příčnou tuhost).
 * Rychlosti se po dobu výpočtu vynulují, aby do matice nevstoupilo tlumení.
 */
export function sestavMaticiTuhosti(s: Soustava, stupne: Int32Array): Float64Array {
  const n = stupne.length;
  const K = new Float64Array(n * n);
  const zaloha = ulozPolohu(s);
  const vx = s.vx.slice();
  const vy = s.vy.slice();
  const omega = s.omega.slice();
  s.vx.fill(0);
  s.vy.fill(0);
  s.omega.fill(0);
  const zmrazeno = s.plasticitaZmrazena;
  s.plasticitaZmrazena = true;

  const smer = new Float64Array(n);
  const plus = new Float64Array(n);
  const minus = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    smer[k] = 1;
    posunStupne(s, stupne, smer, KROK_DERIVACE);
    spoctiVnitrniSily(s);
    silyStupnu(s, stupne, plus);
    obnovPolohu(s, zaloha);
    posunStupne(s, stupne, smer, -KROK_DERIVACE);
    spoctiVnitrniSily(s);
    silyStupnu(s, stupne, minus);
    obnovPolohu(s, zaloha);
    smer[k] = 0;
    // Tuhost je záporná derivace vnitřní síly podle posunu.
    for (let i = 0; i < n; i++) K[i * n + k] = -(plus[i]! - minus[i]!) / (2 * KROK_DERIVACE);
  }

  // Matice tuhosti je symetrická; numerická derivace to poruší jen zaokrouhlením.
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const prumer = 0.5 * (K[i * n + j]! + K[j * n + i]!);
      K[i * n + j] = prumer;
      K[j * n + i] = prumer;
    }
  }

  s.vx.set(vx);
  s.vy.set(vy);
  s.omega.set(omega);
  spoctiVnitrniSily(s);
  s.plasticitaZmrazena = zmrazeno;
  return K;
}

/**
 * Pod jakým podílem původního diagonálního prvku se pivot rozkladu považuje za nulový.
 * Mechanismus má pivot přesně nulový jen teoreticky; zaokrouhlení z něj udělá malé
 * kladné nebo záporné číslo.
 */
const NULOVY_PIVOT = 1e-9;

/**
 * Choleského rozklad A = L·Lᵀ na místě; po návratu je L v dolním trojúhelníku.
 * Vrací false, když matice není (s rezervou na zaokrouhlení) kladně definitní.
 * U matice tuhosti to znamená, že soustava je mechanismus nebo je v dané poloze nestabilní.
 */
export function choleskehoRozklad(A: Float64Array, n: number): boolean {
  for (let j = 0; j < n; j++) {
    const puvodni = A[j * n + j]!;
    let diagonala = puvodni;
    for (let k = 0; k < j; k++) diagonala -= A[j * n + k]! * A[j * n + k]!;
    if (!(diagonala > NULOVY_PIVOT * puvodni)) return false;
    const koren = Math.sqrt(diagonala);
    A[j * n + j] = koren;
    for (let i = j + 1; i < n; i++) {
      let soucet = A[i * n + j]!;
      for (let k = 0; k < j; k++) soucet -= A[i * n + k]! * A[j * n + k]!;
      A[i * n + j] = soucet / koren;
    }
  }
  return true;
}

/** Vyřeší L·Lᵀ·x = b; výsledek přepíše vektor b. */
export function vyresRozkladem(L: Float64Array, n: number, b: Float64Array): void {
  for (let i = 0; i < n; i++) {
    let soucet = b[i]!;
    for (let k = 0; k < i; k++) soucet -= L[i * n + k]! * b[k]!;
    b[i] = soucet / L[i * n + i]!;
  }
  for (let i = n - 1; i >= 0; i--) {
    let soucet = b[i]!;
    for (let k = i + 1; k < n; k++) soucet -= L[k * n + i]! * b[k]!;
    b[i] = soucet / L[i * n + i]!;
  }
}

/**
 * Vlastní čísla a vektory malé symetrické matice Jacobiho metodou.
 * Matici A přepíše; vlastní vektory vrací ve sloupcích V, vlastní čísla na diagonále A.
 */
function jacobi(A: Float64Array, n: number): Float64Array {
  const V = new Float64Array(n * n);
  for (let i = 0; i < n; i++) V[i * n + i] = 1;
  for (let pruchod = 0; pruchod < 60; pruchod++) {
    let mimo = 0;
    let diagonala = 0;
    for (let i = 0; i < n; i++) {
      diagonala += A[i * n + i]! * A[i * n + i]!;
      for (let j = i + 1; j < n; j++) mimo += A[i * n + j]! * A[i * n + j]!;
    }
    if (mimo <= 1e-30 * diagonala) break;
    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = A[p * n + q]!;
        if (apq === 0) continue;
        const theta = (A[q * n + q]! - A[p * n + p]!) / (2 * apq);
        const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const sn = t * c;
        for (let k = 0; k < n; k++) {
          const akp = A[k * n + p]!;
          const akq = A[k * n + q]!;
          A[k * n + p] = c * akp - sn * akq;
          A[k * n + q] = sn * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = A[p * n + k]!;
          const aqk = A[q * n + k]!;
          A[p * n + k] = c * apk - sn * aqk;
          A[q * n + k] = sn * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = V[k * n + p]!;
          const vkq = V[k * n + q]!;
          V[k * n + p] = c * vkp - sn * vkq;
          V[k * n + q] = sn * vkp + c * vkq;
        }
      }
    }
  }
  return V;
}

export interface VlastniTvary {
  /** Vlastní úhlové frekvence v rad/s, vzestupně. */
  omega: Float64Array;
  /**
   * Vlastní tvary po řádcích: tvar i zabírá prvky i·n až (i+1)·n − 1.
   * Jsou normované hmotou: φᵀ·M·φ = 1.
   */
  tvary: Float64Array;
  /** Počet volných stupňů volnosti n. */
  stupnu: number;
}

/**
 * Nejnižší vlastní frekvence a tvary kmitání kolem aktuální polohy
 * (zobecněný problém K·φ = ω²·M·φ, M je diagonální) podprostorovou iterací.
 * Vrací null, když matice tuhosti není kladně definitní.
 */
export function nejnizsiTvary(
  K: Float64Array,
  hmoty: Float64Array,
  pocet: number,
  presnost = 1e-10,
): VlastniTvary | null {
  const n = hmoty.length;
  const m = Math.min(pocet, n);
  const p = Math.min(n, Math.max(2 * m, m + 8));

  const L = K.slice();
  if (!choleskehoRozklad(L, n)) return null;

  // Vektory podprostoru po sloupcích: sloupec j zabírá prvky j·n až (j+1)·n − 1.
  // Začíná se deterministickým pseudonáhodným šumem, aby výsledek nezávisel na běhu.
  let stav = 12345;
  const nahodne = (): number => {
    stav = (Math.imul(stav, 1103515245) + 12345) & 0x7fffffff;
    return stav / 0x7fffffff - 0.5;
  };
  const X = new Float64Array(n * p);
  for (let i = 0; i < n * p; i++) X[i] = nahodne();
  const Y = new Float64Array(n * p);
  const KY = new Float64Array(n * p);
  const Kr = new Float64Array(p * p);
  let lambda = new Float64Array(p).fill(Infinity);

  for (let iterace = 0; iterace < 300; iterace++) {
    // Y = K⁻¹·M·X: jeden krok inverzní iterace zesílí nejnižší tvary.
    for (let j = 0; j < p; j++) {
      const sloupec = Y.subarray(j * n, (j + 1) * n);
      for (let i = 0; i < n; i++) sloupec[i] = hmoty[i]! * X[j * n + i]!;
      vyresRozkladem(L, n, sloupec);
    }

    // Ortonormalizace sloupců v hmotové normě (Gram–Schmidt, dvakrát kvůli zaokrouhlení).
    // Bez ní by sloupce po pár krocích splynuly do nejnižšího tvaru.
    for (let j = 0; j < p; j++) {
      const sloupec = Y.subarray(j * n, (j + 1) * n);
      for (let opakovani = 0; opakovani < 2; opakovani++) {
        for (let k = 0; k < j; k++) {
          const drivejsi = Y.subarray(k * n, (k + 1) * n);
          let soucin = 0;
          for (let i = 0; i < n; i++) soucin += sloupec[i]! * hmoty[i]! * drivejsi[i]!;
          for (let i = 0; i < n; i++) sloupec[i] = sloupec[i]! - soucin * drivejsi[i]!;
        }
      }
      let norma = 0;
      for (let i = 0; i < n; i++) norma += hmoty[i]! * sloupec[i]! * sloupec[i]!;
      norma = Math.sqrt(norma);
      for (let i = 0; i < n; i++) sloupec[i] = sloupec[i]! / norma;
    }

    // Průmět tuhosti do podprostoru: Kr = Yᵀ·K·Y. Hmota se promítá na jednotkovou matici.
    for (let j = 0; j < p; j++) {
      for (let i = 0; i < n; i++) {
        let soucet = 0;
        const radek = i * n;
        for (let k = 0; k < n; k++) soucet += K[radek + k]! * Y[j * n + k]!;
        KY[j * n + i] = soucet;
      }
    }
    for (let a = 0; a < p; a++) {
      for (let b = a; b < p; b++) {
        let soucet = 0;
        for (let i = 0; i < n; i++) soucet += Y[a * n + i]! * KY[b * n + i]!;
        Kr[a * p + b] = soucet;
        Kr[b * p + a] = soucet;
      }
    }

    const Q = jacobi(Kr, p);
    const poradi = Array.from({ length: p }, (_, i) => i).sort((a, b) => Kr[a * p + a]! - Kr[b * p + b]!);

    // X = Y·Q se sloupci seřazenými podle vlastních čísel vzestupně.
    for (let j = 0; j < p; j++) {
      const zdroj = poradi[j]!;
      for (let i = 0; i < n; i++) {
        let soucet = 0;
        for (let k = 0; k < p; k++) soucet += Y[k * n + i]! * Q[k * p + zdroj]!;
        X[j * n + i] = soucet;
      }
    }

    const nova = new Float64Array(p);
    for (let j = 0; j < p; j++) nova[j] = Kr[poradi[j]! * p + poradi[j]!]!;
    let zmena = 0;
    for (let j = 0; j < m; j++) zmena = Math.max(zmena, Math.abs(nova[j]! - lambda[j]!) / Math.abs(nova[j]!));
    lambda = nova;
    if (zmena < presnost) break;
  }

  const omega = new Float64Array(m);
  const tvary = new Float64Array(m * n);
  for (let j = 0; j < m; j++) {
    omega[j] = Math.sqrt(Math.max(0, lambda[j]!));
    tvary.set(X.subarray(j * n, (j + 1) * n), j * n);
  }
  return { omega, tvary, stupnu: n };
}

/** Nejnižší vlastní tvary soustavy v její aktuální poloze. */
export function vlastniTvarySoustavy(s: Soustava, stupne: Int32Array, pocet: number): VlastniTvary | null {
  return nejnizsiTvary(sestavMaticiTuhosti(s, stupne), hmotyStupnu(s, stupne), pocet);
}

/**
 * Nejvyšší vlastní úhlová frekvence soustavy v aktuální poloze mocninnou metodou.
 * Matici nesestavuje: součin K·v získá derivací vnitřních sil ve směru v.
 * Výsledek určuje nejdelší stabilní krok explicitní integrace, 2/ω_max.
 */
export function nejvyssiFrekvence(s: Soustava, stupne: Int32Array, presnost = 1e-6): number {
  const n = stupne.length;
  if (n === 0) return 0;
  const hmoty = hmotyStupnu(s, stupne);
  const zaloha = ulozPolohu(s);
  const vx = s.vx.slice();
  const vy = s.vy.slice();
  const omega = s.omega.slice();
  s.vx.fill(0);
  s.vy.fill(0);
  s.omega.fill(0);
  const zmrazeno = s.plasticitaZmrazena;
  s.plasticitaZmrazena = true;

  const v = new Float64Array(n);
  let stav = 6789;
  for (let i = 0; i < n; i++) {
    stav = (Math.imul(stav, 1103515245) + 12345) & 0x7fffffff;
    v[i] = stav / 0x7fffffff - 0.5;
  }
  const plus = new Float64Array(n);
  const minus = new Float64Array(n);
  let lambda = 0;

  for (let iterace = 0; iterace < 2000; iterace++) {
    // Normování v hmotové normě: vᵀ·M·v = 1. Posun pro derivaci se škáluje tak,
    // aby největší složka byla právě KROK_DERIVACE.
    let norma = 0;
    let nejvetsi = 0;
    for (let i = 0; i < n; i++) {
      norma += hmoty[i]! * v[i]! * v[i]!;
      nejvetsi = Math.max(nejvetsi, Math.abs(v[i]!));
    }
    norma = Math.sqrt(norma);
    for (let i = 0; i < n; i++) v[i] = v[i]! / norma;
    const krok = (KROK_DERIVACE * norma) / nejvetsi;

    posunStupne(s, stupne, v, krok);
    spoctiVnitrniSily(s);
    silyStupnu(s, stupne, plus);
    obnovPolohu(s, zaloha);
    posunStupne(s, stupne, v, -krok);
    spoctiVnitrniSily(s);
    silyStupnu(s, stupne, minus);
    obnovPolohu(s, zaloha);

    // w = M⁻¹·K·v; Rayleighův podíl vᵀ·K·v je odhad největšího vlastního čísla.
    let nova = 0;
    for (let i = 0; i < n; i++) {
      const kv = -(plus[i]! - minus[i]!) / (2 * krok);
      nova += v[i]! * kv;
      v[i] = kv / hmoty[i]!;
    }
    const zmena = Math.abs(nova - lambda) / Math.abs(nova);
    lambda = nova;
    if (zmena < presnost) break;
  }

  s.vx.set(vx);
  s.vy.set(vy);
  s.omega.set(omega);
  spoctiVnitrniSily(s);
  s.plasticitaZmrazena = zmrazeno;
  return Math.sqrt(Math.max(0, lambda));
}

/** Největší posun (m) nebo natočení (rad) v jednom kroku hledání rovnováhy. */
const NEJVETSI_KROK_ROVNOVAHY = 1;
/** Oprava polohy, pod kterou se hledání rovnováhy považuje za dokončené (m, rad). */
const NEPATRNY_KROK_ROVNOVAHY = 1e-12;

/**
 * Najde statickou rovnováhu soustavy pod tíhou a vnějšími silami Newtonovou metodou
 * a soustavu do ní přesune. `vnejsi` jsou síly a momenty ve volných stupních.
 * Vrací počet iterací, nebo −1, když rovnováhu poblíž výchozí polohy nenajde:
 * soustava je mechanismus, iterace nekonverguje, nebo by jeden krok soustavu posunul
 * o víc než `NEJVETSI_KROK_ROVNOVAHY` (typicky povolená lana). V tom případě zůstane
 * soustava tam, kam se iterace dostala, a volající má použít ustálení časovou simulací.
 */
export function najdiRovnovahu(
  s: Soustava,
  stupne: Int32Array,
  vnejsi: Float64Array,
  tiha: number,
  presnost = 1e-7,
): number {
  const n = stupne.length;
  const hmoty = hmotyStupnu(s, stupne);
  const zbytek = new Float64Array(n);
  const vx = s.vx.slice();
  const vy = s.vy.slice();
  const omega = s.omega.slice();
  s.vx.fill(0);
  s.vy.fill(0);
  s.omega.fill(0);
  const zmrazeno = s.plasticitaZmrazena;
  s.plasticitaZmrazena = true;

  const obnovRychlosti = (): void => {
    s.vx.set(vx);
    s.vy.set(vy);
    s.omega.set(omega);
    spoctiVnitrniSily(s);
    s.plasticitaZmrazena = zmrazeno;
  };

  let meritko = 0;
  for (let iterace = 0; iterace < 50; iterace++) {
    spoctiVnitrniSily(s);
    silyStupnu(s, stupne, zbytek);
    let norma = 0;
    let zatizeni = 0;
    for (let k = 0; k < n; k++) {
      // Tíha působí jen ve svislých posunech.
      const tihaStupne = stupne[k]! % 3 === 1 ? -hmoty[k]! * tiha : 0;
      const vnejsiSila = vnejsi[k]! + tihaStupne;
      zbytek[k] = zbytek[k]! + vnejsiSila;
      norma = Math.max(norma, Math.abs(zbytek[k]!));
      zatizeni = Math.max(zatizeni, Math.abs(vnejsiSila));
    }
    meritko = Math.max(meritko, zatizeni, norma);
    if (norma <= presnost * meritko) {
      obnovRychlosti();
      return iterace;
    }
    const K = sestavMaticiTuhosti(s, stupne);
    if (!choleskehoRozklad(K, n)) break;
    vyresRozkladem(K, n, zbytek);
    let nejvetsiKrok = 0;
    for (let k = 0; k < n; k++) nejvetsiKrok = Math.max(nejvetsiKrok, Math.abs(zbytek[k]!));
    if (!(nejvetsiKrok <= NEJVETSI_KROK_ROVNOVAHY)) break;
    posunStupne(s, stupne, zbytek, 1);
    // Oprava menší než zaokrouhlení poloh: dál už se zbytek sil nezmenší.
    if (nejvetsiKrok < NEPATRNY_KROK_ROVNOVAHY) {
      obnovRychlosti();
      return iterace + 1;
    }
  }
  obnovRychlosti();
  return -1;
}
