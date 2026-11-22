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
import { frekvenceProKrokovani, najdiRovnovahu } from "./matice";
import { LANO, type Soustava } from "./soustava";
import { betaProUtlum, zvolKrok } from "./stabilita";

/** Nejdelší děj, po který se ustálení zkouší, v sekundách. */
const NEJDELSI_USTALENI = 30;
/** Styčník, který se posune dál, už neusedá, ale padá: soustava klidovou polohu nemá. */
const NEJVETSI_POSUN = 6;
/**
 * Totéž pro body, ve kterých se stýkají jen lana: volný konec lana nebo hodně povolené lano
 * se smí zhoupnout daleko a most přitom klidovou polohu má. Nejdelší lano měří 60 m, takže
 * dál se dostane jen kus, který opravdu padá.
 */
const NEJVETSI_POSUN_LANA = 100;
/**
 * Po kolika krocích se posun kontroluje i mimo vrcholy pohybové energie. Kus ve volném pádu
 * žádný vrchol nemá, takže by se jinak počítalo až do vypršení času. Mez je tu dvojnásobná:
 * uprostřed zhoupnutí smí být styčník dál než v klidu.
 */
const KROKU_MEZI_KONTROLAMI = 256;
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
  /** Vrátí soustavě hmoty a tlumení; plasticita zůstává zmrazená až do konce ustálení. */
  const obnov = (): void => {
    s.invHmotaX.set(invX);
    s.invHmotaY.set(invY);
    s.invSetrvacnost.set(invJ);
    s.beta.set(beta);
    zastav();
  };
  /**
   * Největší nevyvážená síla ve volných posunech; volá se se zastavenou soustavou.
   * Když výpočet někde dal neplatné číslo, vrací NaN (a soustava se za ustálenou nepočítá).
   */
  const nevyvazeno = (): number => {
    let nejvic = 0;
    for (let i = 0; i < s.pocetStycniku; i++) {
      if (s.invHmotaX[i] !== 0) {
        const f = Math.abs(s.fx[i]!);
        if (f !== f) return f;
        if (f > nejvic) nejvic = f;
      }
      if (s.invHmotaY[i] !== 0) {
        const f = Math.abs(s.fy[i]!);
        if (f !== f) return f;
        if (f > nejvic) nejvic = f;
      }
    }
    return nejvic;
  };
  // Styčníky, do kterých vede i něco jiného než lano, a podpory (posuvné ložisko, které
  // lano odtáhne o metry, není klidová poloha mostu); ostatní jsou jen body lan.
  const nosny = new Uint8Array(s.pocetStycniku);
  for (let i = 0; i < s.pocetStycniku; i++) if ((s.podpora[i]! & 3) !== 0) nosny[i] = 1;
  for (let e = 0; e < s.pocetPrvku; e++) {
    if (s.druh[e] === LANO) continue;
    nosny[s.prvekA[e]!] = 1;
    nosny[s.prvekB[e]!] = 1;
  }
  /** Posunul se některý styčník od nakreslené polohy dál než o `mez` metrů (nebo do neplatna)? */
  const dalNez = (mez: number): boolean => {
    for (let j = 0; j < s.pocetStycniku; j++) {
      const dx = s.x[j]! - x0[j]!;
      const dy = s.y[j]! - y0[j]!;
      const dovoleno = nosny[j] === 1 ? mez : NEJVETSI_POSUN_LANA;
      if (!(dx * dx + dy * dy <= dovoleno * dovoleno)) return true;
    }
    return false;
  };

  zastav();
  const omegaMax = frekvenceProKrokovani(s, stupne);
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
      // Kus ve volném pádu jen zrychluje a k vrcholu energie nikdy nedojde.
      if ((i + 1) % KROKU_MEZI_KONTROLAMI === 0 && dalNez(2 * NEJVETSI_POSUN)) break;
      continue;
    }
    // Vrchol pohybové energie je za námi: soustava právě prolétla kolem klidové polohy.
    zastav();
    spoctiSily(s, tiha, 0);
    minula = 0;
    // Soustava, která se někam zřítila, klidovou polohu poblíž nakreslené nemá,
    // i kdyby tam dole nakonec zůstala viset v klidu.
    if (dalNez(NEJVETSI_POSUN)) break;
    // Neplatné číslo (NaN) podmínku nesplní: rozpadlý výpočet se za ustálený nepočítá.
    if (nevyvazeno() <= PRESNOST_USTALENI * nejvetsiTiha) {
      ustaleno = true;
      break;
    }
  }
  obnov();
  // Síly v klidové poloze se počítají ještě se zmrazenou plasticitou: ustálení je jen
  // hledání výchozího stavu a nesmí v prutech zanechat trvalé přetvoření.
  spoctiSily(s, tiha, 0);
  if (!ustaleno) {
    s.plasticitaZmrazena = zmrazeno;
    return false;
  }
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
    s.plasticitaZmrazena = true;
    spoctiSily(s, tiha, 0);
  }
  s.plasticitaZmrazena = zmrazeno;
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
