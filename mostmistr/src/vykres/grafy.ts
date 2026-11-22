// Malé grafy analytického panelu: rezonanční křivka a průběhy v čase.
// Kreslí se ve stejném stylu jako výkres: tenké světlé čáry na modrém podkladu.

import { BARVY, PISMO } from "./barvy";

type Kontext = CanvasRenderingContext2D;

/** Okraje grafu v pixelech: vlevo a dole je místo na popisky os. */
const VLEVO = 30;
const DOLE = 14;
const NAHORE = 5;
const VPRAVO = 6;

export interface Vrchol {
  /** Frekvence v Hz. */
  f: number;
  hodnota: number;
}

/**
 * Vrcholy křivky zadané hodnotami po kroku `krok` od `od`: místa, kde je hodnota větší než
 * obě sousední a aspoň `podil` největší hodnoty křivky (drobné hrbolky se nepočítají).
 */
export function vrcholyKrivky(krivka: readonly number[], od: number, krok: number, podil = 0.05): Vrchol[] {
  let nejvic = 0;
  for (const h of krivka) if (h > nejvic) nejvic = h;
  const vrcholy: Vrchol[] = [];
  for (let i = 1; i + 1 < krivka.length; i++) {
    const h = krivka[i]!;
    if (h > krivka[i - 1]! && h >= krivka[i + 1]! && h >= podil * nejvic) vrcholy.push({ f: od + i * krok, hodnota: h });
  }
  return vrcholy;
}

export interface DataKrivky {
  od: number;
  krok: number;
  prazdny: readonly number[];
  obsazeny: readonly number[] | null;
  /** Kroky lidí: frekvence v Hz a poloviční šířka pásma, ve kterém se pohybují. */
  kroky: readonly { f: number; pasmo: number }[];
  /** Pravý okraj vodorovné osy v Hz a horní okraj svislé osy (m/s² na 1 kN). */
  rozsah: number;
  strop: number;
}

function zaokrouhliNahoru(hodnota: number): number {
  if (!(hodnota > 0)) return 1;
  const rad = Math.pow(10, Math.floor(Math.log10(hodnota)));
  for (const nasobek of [1, 2, 5, 10]) if (nasobek * rad >= hodnota) return nasobek * rad;
  return 10 * rad;
}

/** Horní okraj svislé osy, pod který se vejde hodnota `nejvic`: 1, 2 nebo 5 krát mocnina deseti. */
export function stropGrafu(nejvic: number): number {
  return zaokrouhliNahoru(nejvic);
}

function zapis(hodnota: number): string {
  const text = Math.abs(hodnota) >= 10 ? hodnota.toFixed(0) : Math.abs(hodnota) >= 1 ? hodnota.toFixed(1) : hodnota.toFixed(2);
  return text.replace(".", ",").replace("-", "−");
}

function ram(ctx: Kontext, sirka: number, vyska: number): { x0: number; y0: number; w: number; h: number } {
  ctx.clearRect(0, 0, sirka, vyska);
  const x0 = VLEVO;
  const y0 = NAHORE;
  const w = sirka - VLEVO - VPRAVO;
  const h = vyska - NAHORE - DOLE;
  ctx.strokeStyle = BARVY.popisek;
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(x0 + 0.5, y0);
  ctx.lineTo(x0 + 0.5, y0 + h + 0.5);
  ctx.lineTo(x0 + w, y0 + h + 0.5);
  ctx.stroke();
  ctx.font = `9px ${PISMO}`;
  ctx.fillStyle = BARVY.popisek;
  return { x0, y0, w, h };
}

/**
 * Rezonanční křivka: vodorovně frekvence buzení, svisle zrychlení mostovky na jednotkovou
 * sílu. Plná čára je most s lidmi (nebo prázdný, když v úrovni lidé nejsou), tenká
 * přerušovaná prázdný most. Svislé pruhy jsou kroky lidí a jejich dvojnásobky.
 */
export function nakresliKrivku(ctx: Kontext, sirka: number, vyska: number, data: DataKrivky): void {
  const { x0, y0, w, h } = ram(ctx, sirka, vyska);
  const naX = (f: number): number => x0 + (w * Math.min(f, data.rozsah)) / data.rozsah;
  const naY = (hodnota: number): number => y0 + h - h * Math.min(1, hodnota / data.strop);

  // Kroky lidí a jejich dvojnásobky.
  for (const krok of data.kroky) {
    for (const nasobek of [1, 2]) {
      const f = nasobek * krok.f;
      if (f > data.rozsah) continue;
      if (krok.pasmo > 0) {
        ctx.fillStyle = "rgba(143, 208, 255, 0.22)";
        const leva = naX(nasobek * (krok.f - krok.pasmo));
        ctx.fillRect(leva, y0, naX(nasobek * (krok.f + krok.pasmo)) - leva, h);
      }
      ctx.strokeStyle = nasobek === 1 ? BARVY.voda : BARVY.popisek;
      ctx.lineWidth = nasobek === 1 ? 1.5 : 1;
      ctx.setLineDash(nasobek === 1 ? [] : [3, 3]);
      ctx.beginPath();
      ctx.moveTo(Math.round(naX(f)) + 0.5, y0);
      ctx.lineTo(Math.round(naX(f)) + 0.5, y0 + h);
      ctx.stroke();
    }
  }
  ctx.setLineDash([]);

  // Popisky os.
  ctx.fillStyle = BARVY.popisek;
  ctx.textBaseline = "top";
  ctx.textAlign = "center";
  for (let hz = 0; hz <= data.rozsah; hz++) ctx.fillText(String(hz), naX(hz), y0 + h + 3);
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillText(zapis(data.strop), x0 - 4, y0 + 4);
  ctx.fillText("0", x0 - 4, y0 + h);

  const cara = (hodnoty: readonly number[]): void => {
    ctx.beginPath();
    hodnoty.forEach((hodnota, i) => {
      const x = naX(data.od + i * data.krok);
      const y = naY(hodnota);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  };
  ctx.lineJoin = "round";
  if (data.obsazeny) {
    ctx.strokeStyle = BARVY.cara;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    cara(data.prazdny);
    ctx.setLineDash([]);
  }
  ctx.strokeStyle = BARVY.caraSilna;
  ctx.lineWidth = 2;
  cara(data.obsazeny ?? data.prazdny);
}

export interface DataPrubehu {
  /** Časy vzorků v sekundách (vzestupně) a hodnoty v nich. */
  casy: ArrayLike<number>;
  hodnoty: ArrayLike<number>;
  /** Rozsah vodorovné osy v sekundách a svislé osy v jednotkách hodnot. */
  trvani: number;
  dno: number;
  strop: number;
  /** Právě přehrávaný okamžik, s. */
  cas: number;
  /** Vodorovná mez, která se v grafu vyznačí (například hranice nepřijatelného kmitání). */
  mez?: number;
}

/** Průběh veličiny v čase s ukazatelem právě přehrávaného okamžiku. */
export function nakresliPrubeh(ctx: Kontext, sirka: number, vyska: number, data: DataPrubehu): void {
  const { x0, y0, w, h } = ram(ctx, sirka, vyska);
  const trvani = data.trvani > 0 ? data.trvani : 1;
  const rozpeti = data.strop - data.dno || 1;
  const naX = (cas: number): number => x0 + (w * Math.min(cas, trvani)) / trvani;
  const naY = (hodnota: number): number => y0 + h - (h * Math.max(0, Math.min(1, (hodnota - data.dno) / rozpeti)));

  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillText(zapis(data.strop), x0 - 4, y0 + 4);
  ctx.fillText(zapis(data.dno), x0 - 4, y0 + h);
  if (data.dno < 0 && data.strop > 0) {
    // Nulová čára.
    ctx.strokeStyle = BARVY.popisek;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(x0, Math.round(naY(0)) + 0.5);
    ctx.lineTo(x0 + w, Math.round(naY(0)) + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (data.mez !== undefined && data.mez > data.dno && data.mez < data.strop) {
    ctx.strokeStyle = BARVY.varovani;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(x0, Math.round(naY(data.mez)) + 0.5);
    ctx.lineTo(x0 + w, Math.round(naY(data.mez)) + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Čára průběhu: v každém sloupci pixelů nejmenší a největší hodnota, aby se neztratily špičky.
  const pocet = data.casy.length;
  if (pocet > 0) {
    ctx.strokeStyle = BARVY.caraSilna;
    ctx.lineWidth = 1.2;
    ctx.lineJoin = "round";
    ctx.beginPath();
    let sloupec = -1;
    let nejmin = 0;
    let nejvic = 0;
    let zacato = false;
    const dokonci = (): void => {
      if (sloupec < 0) return;
      const x = x0 + sloupec + 0.5;
      if (!zacato) {
        ctx.moveTo(x, naY(nejmin));
        zacato = true;
      } else ctx.lineTo(x, naY(nejmin));
      if (nejvic !== nejmin) ctx.lineTo(x, naY(nejvic));
    };
    for (let i = 0; i < pocet; i++) {
      const s = Math.floor((w * Math.min(data.casy[i]!, trvani)) / trvani);
      const hodnota = data.hodnoty[i]!;
      if (s !== sloupec) {
        dokonci();
        sloupec = s;
        nejmin = nejvic = hodnota;
      } else {
        if (hodnota < nejmin) nejmin = hodnota;
        if (hodnota > nejvic) nejvic = hodnota;
      }
    }
    dokonci();
    ctx.stroke();
  }

  // Ukazatel přehrávaného okamžiku.
  ctx.strokeStyle = BARVY.voda;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(Math.round(naX(data.cas)) + 0.5, y0);
  ctx.lineTo(Math.round(naX(data.cas)) + 0.5, y0 + h);
  ctx.stroke();
}
