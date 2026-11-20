import { describe, expect, it } from "vitest";
import { kinetickaEnergie, krok, polohovaEnergie, spoctiSily, TIHOVE_ZRYCHLENI } from "../src/jadro/integrator";
import { nejvyssiFrekvence, vlastniTvarySoustavy } from "../src/jadro/matice";
import { deformacniEnergie } from "../src/jadro/sily";
import { sestavSoustavu, type PopisSoustavy, type Soustava } from "../src/jadro/soustava";
import { zvolKrok } from "../src/jadro/stabilita";
import { volneStupne } from "../src/jadro/stupne";
import { pridejTlumeniHmotou, vytvorTlumeniHmotou } from "../src/jadro/tlumeniHmotou";
import { HEB200, nosnik } from "./pomucky-jadra";

const g = TIHOVE_ZRYCHLENI;

/** Vodorovný prut 4 m z osmi dílů; podpory doplní volající. */
function prut(): PopisSoustavy {
  const popis: PopisSoustavy = { stycniky: [], prvky: [] };
  for (let i = 0; i <= 8; i++) popis.stycniky.push({ x: 0.5 * i, y: 0 });
  for (let i = 0; i < 8; i++) popis.prvky.push({ ...HEB200, a: i, b: i + 1 });
  return popis;
}

/** Krokuje soustavu s tíhou a tlumením úměrným hmotě; vrací funkci, která ji posune o čas. */
function behS(s: Soustava, alfa: number, tiha = g): (sekund: number) => void {
  const tlumeni = vytvorTlumeniHmotou(s, alfa, null);
  const dt = zvolKrok(nejvyssiFrekvence(s, volneStupne(s)), 0);
  const nastaveni = { dt, tiha, alfa: 0, dalsiSily: (soustava: Soustava) => pridejTlumeniHmotou(soustava, tlumeni) };
  spoctiSily(s, tiha, 0);
  pridejTlumeniHmotou(s, tlumeni);
  return (sekund) => {
    for (let i = 0; i < sekund / dt; i++) krok(s, nastaveni);
  };
}

const energie = (s: Soustava): number => kinetickaEnergie(s) + deformacniEnergie(s) + polohovaEnergie(s, g);

describe("tlumení úměrné hmotě po porušení", () => {
  it("volný kus padá volným pádem a otáčí se dál, i když je tlumení silné", () => {
    const s = sestavSoustavu(prut());
    // Kus letí šikmo a točí se kolem svého středu (x = 2 m).
    const otacky = 3;
    for (let i = 0; i <= 8; i++) {
      s.vx[i] = 2;
      s.vy[i] = 1 + otacky * (s.x[i]! - 2);
      s.omega[i] = otacky;
    }
    const posun = behS(s, 5);
    posun(0.8);
    let tx = 0;
    let ty = 0;
    let vy = 0;
    for (let i = 0; i <= 8; i++) {
      // Krajní styčníky nesou polovinu hmoty; těžiště je uprostřed.
      const vaha = i === 0 || i === 8 ? 0.5 : 1;
      tx += (vaha * s.x[i]!) / 8;
      ty += (vaha * s.y[i]!) / 8;
      vy += (vaha * s.vy[i]!) / 8;
    }
    expect(tx).toBeCloseTo(2 + 2 * 0.8, 3);
    expect(ty).toBeCloseTo(1 * 0.8 - 0.5 * g * 0.8 ** 2, 3);
    expect(vy).toBeCloseTo(1 - g * 0.8, 3);
    // Úhlová rychlost zůstala: konce se proti sobě pohybují rychlostí ω·L.
    const relativni = Math.hypot(s.vx[8]! - s.vx[0]!, s.vy[8]! - s.vy[0]!);
    expect(relativni / (otacky * 4)).toBeCloseTo(1, 2);
  });

  it("kus držený jedním kloubem se kývá bez ztráty energie", () => {
    const popis = prut();
    popis.stycniky[0]!.pevneX = popis.stycniky[0]!.pevneY = true;
    popis.prvky[0]!.kloubA = true;
    const s = sestavSoustavu(popis);
    const posun = behS(s, 5);
    const pocatecni = energie(s);
    let hmota = 0;
    for (let i = 0; i <= 8; i++) hmota += s.hmota[i]!;
    posun(4);
    // Za čtyři sekundy by tlumení α = 5 bez odečtení otáčení pohyb úplně zastavilo.
    expect(Math.abs(energie(s) - pocatecni) / (hmota * g * 2)).toBeLessThan(0.01);
    // Prut se překývl na druhou stranu: ohybové kmity jsou malé, pohyb celku velký.
    expect(kinetickaEnergie(s) + (pocatecni - energie(s))).toBeGreaterThan(0);
  });

  it("kus na posuvné podpoře se smí otáčet i posouvat", () => {
    const popis = prut();
    popis.stycniky[0]!.pevneY = true;
    popis.prvky[0]!.kloubA = true;
    const s = sestavSoustavu(popis);
    for (let i = 0; i <= 8; i++) s.vx[i] = 1.5;
    const posun = behS(s, 5);
    const pocatecni = energie(s);
    let hmota = 0;
    for (let i = 0; i <= 8; i++) hmota += s.hmota[i]!;
    posun(2);
    expect(Math.abs(energie(s) - pocatecni) / (hmota * g * 2)).toBeLessThan(0.01);
    // Vodorovná hybnost se zachovala: nic ji nebrzdí.
    let hybnost = 0;
    for (let i = 0; i <= 8; i++) hybnost += s.hmota[i]! * s.vx[i]!;
    expect(hybnost / (hmota * 1.5)).toBeCloseTo(1, 2);
  });

  it("nosník na dvou podporách se tlumí celý: útlum prvního tvaru je α/(2ω)", () => {
    const s = sestavSoustavu(nosnik(HEB200, 12, 8, "prosty"));
    const stupne = volneStupne(s);
    const tvary = vlastniTvarySoustavy(s, stupne, 1)!;
    const omega = tvary.omega[0]!;
    const utlum = 0.03;
    // Rozkmitat první tvar počáteční rychlostí.
    for (let k = 0; k < stupne.length; k++) {
      const kod = stupne[k]!;
      const i = (kod / 3) | 0;
      const rychlost = 0.5 * tvary.tvary[k]!;
      if (kod % 3 === 0) s.vx[i] = rychlost;
      else if (kod % 3 === 1) s.vy[i] = rychlost;
      else s.omega[i] = rychlost;
    }
    const posun = behS(s, 2 * utlum * omega, 0);
    const pred = kinetickaEnergie(s) + deformacniEnergie(s);
    const perioda = (2 * Math.PI) / omega;
    posun(5 * perioda);
    const po = kinetickaEnergie(s) + deformacniEnergie(s);
    // Energie klesá jako exp(−2·ζ·ω·t).
    expect(Math.log(pred / po) / (2 * utlum * omega * 5 * perioda)).toBeCloseTo(1, 1);
  });

  it("deformační kmitání volného kusu utlumí, i když pohyb celku nechává být", () => {
    const s = sestavSoustavu(prut());
    // Prohnutý tvar: středy se pohybují proti koncům.
    for (let i = 0; i <= 8; i++) s.vy[i] = Math.cos((Math.PI * i) / 4);
    const posun = behS(s, 40, 0);
    const pred = kinetickaEnergie(s);
    posun(0.5);
    expect(kinetickaEnergie(s) + deformacniEnergie(s)).toBeLessThan(0.01 * pred);
  });

  it("nikdy nepřidává energii: výkon tlumicích sil je záporný pro libovolné rychlosti", () => {
    let stav = 12345;
    const nahodne = (): number => {
      stav = (Math.imul(stav, 1103515245) + 12345) & 0x7fffffff;
      return stav / 0x7fffffff - 0.5;
    };
    for (const podpory of ["zadne", "kloub", "posuv", "dve"] as const) {
      const popis = prut();
      if (podpory === "kloub" || podpory === "dve") popis.stycniky[0]!.pevneX = popis.stycniky[0]!.pevneY = true;
      if (podpory === "posuv") popis.stycniky[3]!.pevneY = true;
      if (podpory === "dve") popis.stycniky[8]!.pevneY = true;
      const s = sestavSoustavu(popis);
      const tlumeni = vytvorTlumeniHmotou(s, 1, null);
      for (let pokus = 0; pokus < 20; pokus++) {
        for (let i = 0; i <= 8; i++) {
          s.vx[i] = s.invHmotaX[i] === 0 ? 0 : nahodne();
          s.vy[i] = s.invHmotaY[i] === 0 ? 0 : nahodne();
          s.omega[i] = nahodne();
        }
        s.fx.fill(0);
        s.fy.fill(0);
        s.moment.fill(0);
        pridejTlumeniHmotou(s, tlumeni);
        let vykon = 0;
        for (let i = 0; i <= 8; i++) vykon += s.fx[i]! * s.vx[i]! + s.fy[i]! * s.vy[i]! + s.moment[i]! * s.omega[i]!;
        expect(vykon).toBeLessThanOrEqual(1e-12);
      }
    }
  });

  it("styčníky břemen netlumí vůbec", () => {
    const popis = prut();
    popis.stycniky.push({ x: 1, y: 2, hmota: 100 });
    const s = sestavSoustavu(popis);
    const tlumeny = new Uint8Array(s.pocetStycniku).fill(1);
    tlumeny[9] = 0;
    const tlumeni = vytvorTlumeniHmotou(s, 3, tlumeny);
    s.vy[9] = -4;
    s.fx.fill(0);
    s.fy.fill(0);
    pridejTlumeniHmotou(s, tlumeni);
    expect(s.fy[9]).toBe(0);
    expect(tlumeni.cast[9]).toBe(-1);
  });
});
