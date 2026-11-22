// Ustálení časovou simulací: klidová poloha soustavy, kterou přímý výpočet nenajde.
//
// Povolené lano nemá v nakreslené (rovné) poloze žádnou příčnou tuhost, takže Newtonova
// metoda v `najdiRovnovahu` hned na začátku selže. Soustava se proto nechá pod tíhou
// rozhýbat a pokaždé, když její pohybová energie začne klesat, se zastaví (kinetické
// tlumení). Tak po pár zhoupnutích dosedne do klidu, i když se po cestě hodně přetvoří.
// Výsledek se nakonec doladí přímým výpočtem.
//
// Hýbou se jen zadané stupně volnosti; ostatní styčníky (vozidla čekající před mostem)
// zůstávají na místě.

import { kinetickaEnergie, krok, spoctiSily, type NastaveniKroku } from "./integrator";
import { najdiRovnovahu, nejvyssiFrekvence } from "./matice";
import { LANO, type Soustava } from "./soustava";
import { betaProUtlum, zvolKrok } from "./stabilita";

/** Nejdelší děj, po který se ustálení zkouší, v sekundách. */
const NEJDELSI_USTALENI = 30;
/** Styčník, který se posune dál, už neusedá, ale padá: soustava klidovou polohu nemá. */
const NEJVETSI_POSUN = 6;
/** Nevyvážená síla, pod kterou je soustava v klidu, jako podíl tíhy jejího nejtěžšího styčníku. */
const PRESNOST_USTALENI = 1e-4;
/** Poměrný útlum nejvyšší frekvence při ustálení: rychlé kmity mají zmizet hned. */
const UTLUM_USTALENI = 0.5;

/**
 * Ustálí soustavu pod tíhou. Vrací true, když našla klidovou polohu (a soustava v ní
 * zůstane s nulovými rychlostmi); false, když se nezastavila nebo se někam zřítila.
 * Při neúspěchu zůstane soustava tam, kam se dostala; volající ji má sestavit znovu.
 *
 * Rychlé kmity (podélné kmitání napjatých lan) po dobu ustálení dusí tlumení úměrné
 * tuhosti; bez něj by jejich energie kolísala tak rychle, že by kinetické tlumení
 * zastavovalo soustavu každých pár kroků a pomalé usedání by se nikam nedostalo.
 */
export function ustalSoustavu(s: Soustava, stupne: Int32Array, tiha: number): boolean {
  if (stupne.length === 0) return true;
  // Stupně, které se hýbat nemají, se na dobu ustálení zadrží.
  const volny = new Uint8Array(3 * s.pocetStycniku);
  for (let k = 0; k < stupne.length; k++) volny[stupne[k]!] = 1;
  const invX = s.invHmotaX.slice();
  const invY = s.invHmotaY.slice();
  const invJ = s.invSetrvacnost.slice();
  const beta = s.beta.slice();
  const x0 = s.x.slice();
  const y0 = s.y.slice();
  let nejvetsiTiha = 0;
  for (let i = 0; i < s.pocetStycniku; i++) {
    if (volny[3 * i] === 0) s.invHmotaX[i] = 0;
    if (volny[3 * i + 1] === 0) s.invHmotaY[i] = 0;
    if (volny[3 * i + 2] === 0) s.invSetrvacnost[i] = 0;
    if (volny[3 * i + 1] === 1 && s.hmota[i]! * tiha > nejvetsiTiha) nejvetsiTiha = s.hmota[i]! * tiha;
  }
  const zmrazeno = s.plasticitaZmrazena;
  s.plasticitaZmrazena = true;
  const zastav = (): void => {
    s.vx.fill(0);
    s.vy.fill(0);
    s.omega.fill(0);
  };
  const obnov = (): void => {
    s.invHmotaX.set(invX);
    s.invHmotaY.set(invY);
    s.invSetrvacnost.set(invJ);
    s.beta.set(beta);
    s.plasticitaZmrazena = zmrazeno;
    zastav();
  };
  /** Největší nevyvážená síla ve volných posunech; volá se se zastavenou soustavou. */
  const nevyvazeno = (): number => {
    let nejvic = 0;
    for (let i = 0; i < s.pocetStycniku; i++) {
      if (s.invHmotaX[i] !== 0 && Math.abs(s.fx[i]!) > nejvic) nejvic = Math.abs(s.fx[i]!);
      if (s.invHmotaY[i] !== 0 && Math.abs(s.fy[i]!) > nejvic) nejvic = Math.abs(s.fy[i]!);
    }
    return nejvic;
  };

  zastav();
  const omegaMax = nejvyssiFrekvence(s, stupne);
  s.beta.fill(betaProUtlum(omegaMax, UTLUM_USTALENI));
  const dt = zvolKrok(omegaMax, UTLUM_USTALENI);
  const nastaveni: NastaveniKroku = { dt, tiha, alfa: 0 };
  spoctiSily(s, tiha, 0);
  const kroku = Math.ceil(NEJDELSI_USTALENI / dt);
  let minula = 0;
  let ustaleno = false;
  for (let i = 0; i < kroku; i++) {
    krok(s, nastaveni);
    const energie = kinetickaEnergie(s);
    if (energie >= minula) {
      minula = energie;
      continue;
    }
    // Vrchol pohybové energie je za námi: soustava právě prolétla kolem klidové polohy.
    zastav();
    spoctiSily(s, tiha, 0);
    minula = 0;
    if (nevyvazeno() <= PRESNOST_USTALENI * nejvetsiTiha) {
      ustaleno = true;
      break;
    }
    // Soustava, která se někam zřítila, klidovou polohu poblíž nakreslené nemá.
    let spadla = false;
    for (let j = 0; j < s.pocetStycniku; j++) {
      const dx = s.x[j]! - x0[j]!;
      const dy = s.y[j]! - y0[j]!;
      if (!(dx * dx + dy * dy <= NEJVETSI_POSUN * NEJVETSI_POSUN)) {
        spadla = true;
        break;
      }
    }
    if (spadla) break;
  }
  obnov();
  spoctiSily(s, tiha, 0);
  if (!ustaleno) return false;
  // Doladění přímým výpočtem: lana už mají tah a s ním příčnou tuhost. Když ho přímý
  // výpočet odmítne (soustava je v klidu, ale drží jen tíhou, ne tuhostí), zůstává poloha
  // z ustálení: je to rovnováha, jen vratká, a zkouška to ukáže.
  const x = s.x.slice();
  const y = s.y.slice();
  const cosN = s.cosN.slice();
  const sinN = s.sinN.slice();
  if (najdiRovnovahu(s, stupne, new Float64Array(stupne.length), tiha) < 0) {
    s.x.set(x);
    s.y.set(y);
    s.cosN.set(cosN);
    s.sinN.set(sinN);
    spoctiSily(s, tiha, 0);
  }
  return true;
}

/**
 * Klidová poloha soustavy pod vlastní tíhou: nejdřív přímým výpočtem, a když ten selže
 * u soustavy s lany, ustálením časovou simulací. Vrací false, když soustava klidovou
 * polohu poblíž nakreslené nemá (mechanismus, most, který neunese sám sebe).
 */
export function najdiKlid(s: Soustava, stupne: Int32Array, tiha: number): boolean {
  if (stupne.length === 0) return true;
  let maLano = false;
  for (let e = 0; e < s.pocetPrvku; e++) {
    if (s.druh[e] === LANO) {
      maLano = true;
      break;
    }
  }
  if (!maLano) return najdiRovnovahu(s, stupne, new Float64Array(stupne.length), tiha) >= 0;
  const x = s.x.slice();
  const y = s.y.slice();
  const cosN = s.cosN.slice();
  const sinN = s.sinN.slice();
  if (najdiRovnovahu(s, stupne, new Float64Array(stupne.length), tiha) >= 0) return true;
  // Přímý výpočet mohl soustavu někam posunout; ustálení začíná z nakreslené polohy.
  s.x.set(x);
  s.y.set(y);
  s.cosN.set(cosN);
  s.sinN.set(sinN);
  return ustalSoustavu(s, stupne, tiha);
}
