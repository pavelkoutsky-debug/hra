// Změny stavby soustavy za běhu: rozdělení prvku novým styčníkem a odpojení konce prvku.
// Používá je porušení (přetržení, zlomení, vznik kloubu). Změny jsou vzácné, proto se
// pole při nich prostě zvětší o jednu položku.

import { LANO, nastavTuhostPrvku, prepoctiHmoty, type Soustava } from "./soustava";

type Pole = Float64Array | Int32Array | Uint8Array;

const POLE_STYCNIKU = [
  "x",
  "y",
  "cosN",
  "sinN",
  "vx",
  "vy",
  "omega",
  "fx",
  "fy",
  "moment",
  "hmotaNavic",
  "podpora",
  "invHmotaX",
  "invHmotaY",
  "invSetrvacnost",
  "hmota",
  "setrvacnost",
] as const satisfies readonly (keyof Soustava)[];

const POLE_PRVKU = [
  "prvekA",
  "prvekB",
  "druh",
  "klidovaDelka",
  "osaX0",
  "osaY0",
  "tuhostOsova",
  "kAA",
  "kAB",
  "kBB",
  "beta",
  "tlumic",
  "EA",
  "EI",
  "GAs",
  "polomer",
  "prut",
  "fi",
  "kloub",
  "hmotnostNaMetr",
  "unosnostTah",
  "unosnostTlak",
  "unosnostMoment",
  "unosnostSmyk",
  "kritickaSila",
  "mezTahu",
  "mezMomentu",
  "silaPretrzeni",
  "mezniNatoceni",
  "mezniProtazeni",
  "plastA",
  "plastB",
  "plastDelka",
  "vyuziti",
  "zpusob",
  "mistoNamahani",
  "utrzeny",
  "zatSilaA",
  "zatSilaB",
  "zatMomentA",
  "zatMomentB",
  "zatizenePrvky",
  "jeZatizen",
  "osovaSila",
  "momentA",
  "momentB",
] as const satisfies readonly (keyof Soustava)[];

function zvetsi<T extends Pole>(pole: T, delka: number): T {
  const nove = new (pole.constructor as new (delka: number) => T)(delka);
  nove.set(pole);
  return nove;
}

/** Přístup k polím soustavy podle jména, pro hromadné zvětšování. */
const pole = (s: Soustava): Record<string, Pole> => s as unknown as Record<string, Pole>;

/** Přidá styčník jako kopii styčníku `vzor` (poloha, rychlost, natočení) bez podpory a přidané hmoty. */
function pridejStycnik(s: Soustava, vzor: number): number {
  const novy = s.pocetStycniku;
  const p = pole(s);
  for (const jmeno of POLE_STYCNIKU) {
    p[jmeno] = zvetsi(p[jmeno]!, novy + 1);
    p[jmeno]![novy] = p[jmeno]![vzor]!;
  }
  s.pocetStycniku = novy + 1;
  s.hmotaNavic[novy] = 0;
  s.podpora[novy] = 0;
  s.fx[novy] = 0;
  s.fy[novy] = 0;
  s.moment[novy] = 0;
  return novy;
}

/** Přidá prvek jako kopii prvku `vzor` se všemi vlastnostmi; koncové styčníky nastaví volající. */
function pridejPrvek(s: Soustava, vzor: number): number {
  const novy = s.pocetPrvku;
  const p = pole(s);
  for (const jmeno of POLE_PRVKU) {
    p[jmeno] = zvetsi(p[jmeno]!, novy + 1);
    p[jmeno]![novy] = p[jmeno]![vzor]!;
  }
  s.zatMomentPole = zvetsi(s.zatMomentPole, 3 * (novy + 1));
  s.pocetPrvku = novy + 1;
  s.jeZatizen[novy] = 0;
  s.zatSilaA[novy] = 0;
  s.zatSilaB[novy] = 0;
  s.zatMomentA[novy] = 0;
  s.zatMomentB[novy] = 0;
  return novy;
}

/**
 * Rozdělí prvek `e` novým styčníkem v poměru `t` (0 až 1 od konce a). Oba díly jsou
 * do nového styčníku připojeny tuze a sdílejí vlastnosti původního prvku.
 *
 * Nový styčník leží na ohybové čáře prvku, takže dělení samo síly v konstrukci nezmění.
 * `vychyleni` posune styčník napříč prvkem (v metrech) jako trvalé zalomení: použije se
 * při vybočení ve vzpěru a samo o sobě napětí nevyvolá.
 *
 * Vrací index nového styčníku a nového prvku (díl od nového styčníku ke konci b).
 */
export function rozdelPrvek(
  s: Soustava,
  e: number,
  t: number,
  vychyleni = 0,
): { stycnik: number; prvek: number } {
  const a = s.prvekA[e]!;
  const b = s.prvekB[e]!;
  const dx = s.x[b]! - s.x[a]!;
  const dy = s.y[b]! - s.y[a]!;
  const delka = Math.sqrt(dx * dx + dy * dy);
  const ex = dx / delka;
  const ey = dy / delka;
  const cosAlfa = s.osaX0[e]! * ex + s.osaY0[e]! * ey;
  const sinAlfa = s.osaX0[e]! * ey - s.osaY0[e]! * ex;

  // Ohybová čára prvku s oběma konci tuhými: tvarové funkce Timošenkova nosníku pro průhyb
  // a pro natočení průřezu (se smykovým parametrem Φ). U kloubových prvků a lan se bere přímka.
  let pruhyb = 0;
  let sklon = 0;
  const tuhy = s.druh[e] !== LANO && s.kloub[e] === 0;
  if (tuhy) {
    const psiA = s.sinN[a]! * cosAlfa - s.cosN[a]! * sinAlfa - s.plastA[e]!;
    const psiB = s.sinN[b]! * cosAlfa - s.cosN[b]! * sinAlfa - s.plastB[e]!;
    const fi = s.fi[e]!;
    const jmenovatel = 1 / (1 + fi);
    const smyk = 0.5 * fi * t * (1 - t);
    pruhyb = delka * jmenovatel * (psiA * (t * (1 - t) * (1 - t) + smyk) - psiB * (t * t * (1 - t) + smyk));
    sklon =
      jmenovatel * (psiA * (1 - 4 * t + 3 * t * t + fi * (1 - t)) + psiB * (-2 * t + 3 * t * t + fi * t));
  }

  const c = pridejStycnik(s, a);
  const napric = pruhyb + vychyleni;
  s.x[c] = s.x[a]! + t * dx - napric * ey;
  s.y[c] = s.y[a]! + t * dy + napric * ex;
  s.vx[c] = s.vx[a]! + t * (s.vx[b]! - s.vx[a]!);
  s.vy[c] = s.vy[a]! + t * (s.vy[b]! - s.vy[a]!);
  s.omega[c] = s.omega[a]! + t * (s.omega[b]! - s.omega[a]!);
  // Natočení nového styčníku: natočení spojnice plus sklon ohybové čáry.
  const cosSklonu = Math.sqrt(1 - sklon * sklon);
  s.cosN[c] = cosAlfa * cosSklonu - sinAlfa * sklon;
  s.sinN[c] = sinAlfa * cosSklonu + cosAlfa * sklon;

  const f = pridejPrvek(s, e);
  s.prvekB[e] = c;
  s.prvekA[f] = c;

  // Klidové délky dílů se určí ze skutečných délek tak, aby poměrné protažení, a tedy
  // osová síla, zůstalo po rozdělení stejné i se zalomením. Součet klidových délek se
  // tím nepatrně změní (ohnutá čára je delší než spojnice), proto se hmotnost na metr
  // přepočítá: hmota prutu se zachovává přesně.
  const puvodniDelka = s.klidovaDelka[e]!;
  const plast = s.plastDelka[e]!;
  const pomerne = (delka - puvodniDelka - plast) / puvodniDelka;
  const hmotaPrvku = s.hmotnostNaMetr[e]! * puvodniDelka;
  // Odmocnina je na rozdíl od Math.hypot ve všech prohlížečích zaokrouhlená stejně.
  const dxE = s.x[c]! - s.x[a]!;
  const dyE = s.y[c]! - s.y[a]!;
  const dxF = s.x[b]! - s.x[c]!;
  const dyF = s.y[b]! - s.y[c]!;
  const delkaE = Math.sqrt(dxE * dxE + dyE * dyE);
  const delkaF = Math.sqrt(dxF * dxF + dyF * dyF);
  s.plastDelka[e] = t * plast;
  s.plastDelka[f] = (1 - t) * plast;
  s.klidovaDelka[e] = (delkaE - s.plastDelka[e]!) / (1 + pomerne);
  s.klidovaDelka[f] = (delkaF - s.plastDelka[f]!) / (1 + pomerne);
  s.hmotnostNaMetr[e] = (t * hmotaPrvku) / s.klidovaDelka[e]!;
  s.hmotnostNaMetr[f] = ((1 - t) * hmotaPrvku) / s.klidovaDelka[f]!;

  if (s.druh[e] !== LANO) {
    // V novém styčníku jsou oba díly spojené tuze; klouby na původních koncích zůstávají.
    s.kloub[f] = s.kloub[e]! & 2;
    s.kloub[e] = s.kloub[e]! & 1;
    s.plastA[f] = 0;
    s.plastB[f] = s.plastB[e]!;
    s.plastB[e] = 0;
    if (vychyleni !== 0) {
      // Zalomení je trvalá deformace: natočení spojnic obou dílů se zapíše jako plastické,
      // takže pružná natočení konců, a tedy i momenty, zůstanou beze změny.
      const natoceniE = vychyleni / delkaE;
      const natoceniF = -vychyleni / delkaF;
      s.plastA[e] = s.plastA[e]! - natoceniE;
      s.plastB[e] = s.plastB[e]! - natoceniE;
      s.plastA[f] = s.plastA[f]! - natoceniF;
      s.plastB[f] = s.plastB[f]! - natoceniF;
    }
    // Díly už se samostatně na vzpěr neposuzují; vybočení prutu je teď skutečný pohyb styčníku.
    s.kritickaSila[e] = Infinity;
    s.kritickaSila[f] = Infinity;
  }

  nastavTuhostPrvku(s, e);
  nastavTuhostPrvku(s, f);
  prepoctiHmoty(s);
  return { stycnik: c, prvek: f };
}

/**
 * Odpojí konec prvku od jeho styčníku: konec dostane vlastní nový styčník na stejném
 * místě se stejnou rychlostí. Původní styčník si nechá podpory, přidanou hmotu
 * a ostatní prvky. Vrací index nového styčníku.
 */
export function odpojKonec(s: Soustava, e: number, konecB: boolean): number {
  const puvodni = konecB ? s.prvekB[e]! : s.prvekA[e]!;
  const novy = pridejStycnik(s, puvodni);
  if (konecB) s.prvekB[e] = novy;
  else s.prvekA[e] = novy;
  prepoctiHmoty(s);
  return novy;
}
