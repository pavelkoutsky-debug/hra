// Skica principu mostu pro první krok nápovědy: schéma nosné soustavy, ne skutečný most.
// Kreslí se jen z rysů mostu (`RysyMostu`), takže neprozradí, kudy vedou pruty, jen o jaký
// druh mostu jde: příhrada nad mostovkou, pilíře, lana z pylonu, zvedací křídlo…

import type { RysyMostu } from "../data/rysy";
import { BARVY, cara } from "./barvy";

type Kontext = CanvasRenderingContext2D;

/** Nakreslí lomenou čáru přes body [x, y]. */
function lomena(ctx: Kontext, body: readonly (readonly [number, number])[]): void {
  ctx.beginPath();
  body.forEach(([x, y], i) => {
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

/** Řada trojúhelníků mezi mostovkou (výška `y`) a pásem o `h` výš (záporné `h` je pod mostovkou). */
function prihrada(ctx: Kontext, x0: number, x1: number, y: number, h: number, poli: number): void {
  const pole = (x1 - x0) / poli;
  const pas: [number, number][] = [];
  const vypln: [number, number][] = [[x0, y]];
  for (let i = 0; i < poli; i++) {
    const stred = x0 + (i + 0.5) * pole;
    pas.push([stred, y - h]);
    vypln.push([stred, y - h], [x0 + (i + 1) * pole, y]);
  }
  lomena(ctx, vypln);
  lomena(ctx, pas);
}

/** Pilíř od mostovky dolů ke dnu. */
function pilir(ctx: Kontext, x: number, y: number, dno: number): void {
  ctx.save();
  ctx.lineWidth = 4;
  lomena(ctx, [
    [x, y],
    [x, dno],
  ]);
  ctx.restore();
}

/**
 * Nakreslí skicu do plátna o rozměrech `sirka` × `vyska` (v jednotkách kontextu). Břehy jsou
 * po stranách, mostovka mezi nimi a nosná soustava podle `rysy`.
 */
export function nakresliSkicu(ctx: Kontext, sirka: number, vyska: number, rysy: RysyMostu): void {
  ctx.clearRect(0, 0, sirka, vyska);
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const okraj = Math.min(34, sirka * 0.12);
  const x0 = okraj;
  const x1 = sirka - okraj;
  const rozpeti = x1 - x0;
  /** Výška mostovky: uprostřed, u soustav nad mostovkou níž a pod ní výš. */
  const nahore = ["trojuhelnik-nad", "prihrada-nad", "zaveseny", "visuty"].includes(rysy.soustava);
  const dole = ["trojuhelnik-pod", "prihrada-pod", "vzpery", "nosnik", "zvedaci"].includes(rysy.soustava);
  const y = vyska * (nahore ? 0.66 : dole ? 0.4 : 0.52);
  const dno = vyska - 6;
  const h = Math.min(vyska * 0.34, rozpeti * 0.16);

  // Břehy: svislé stěny údolí se šrafou.
  ctx.strokeStyle = cara(0.55);
  ctx.lineWidth = 1;
  for (const [okrajBrehu, stena] of [
    [0, x0],
    [sirka, x1],
  ] as const) {
    lomena(ctx, [
      [okrajBrehu, y],
      [stena, y],
      [stena, dno],
    ]);
    const smer = stena > okrajBrehu ? -1 : 1;
    for (let k = 1; k <= 3; k++) {
      lomena(ctx, [
        [stena + smer * 4, y + k * ((dno - y) / 4)],
        [stena + smer * 14, y + k * ((dno - y) / 4) - 10],
      ]);
    }
  }

  // Nosná soustava.
  ctx.strokeStyle = BARVY.cara;
  ctx.lineWidth = 1.5;
  const poli = 6;
  switch (rysy.soustava) {
    case "trojuhelnik-nad":
      lomena(ctx, [
        [x0, y],
        [(x0 + x1) / 2, y - h],
        [x1, y],
      ]);
      lomena(ctx, [
        [(x0 + x1) / 2, y - h],
        [(x0 + x1) / 2, y],
      ]);
      break;
    case "trojuhelnik-pod":
      lomena(ctx, [
        [x0, y + h * 1.1],
        [x0 + rozpeti / 3, y],
      ]);
      lomena(ctx, [
        [x1, y + h * 1.1],
        [x1 - rozpeti / 3, y],
      ]);
      break;
    case "vzpery":
      // Vzpěradlo: z každého svahu dvě vzpěry do mostovky, bez dolního pásu.
      for (const [stena, smer] of [
        [x0, 1],
        [x1, -1],
      ] as const) {
        for (const podil of [0.22, 0.42]) {
          lomena(ctx, [
            [stena, y + h * 1.4],
            [stena + smer * rozpeti * podil, y],
          ]);
        }
      }
      break;
    case "prihrada-nad":
      prihrada(ctx, x0, x1, y, h, poli);
      break;
    case "prihrada-pod":
      prihrada(ctx, x0, x1, y, -h, poli);
      break;
    case "prihrada-obe":
      prihrada(ctx, x0, x1, y, h * 0.8, poli);
      prihrada(ctx, x0, x1, y, -h * 0.8, poli);
      break;
    case "mezi-patry": {
      // Dvě mostovky nad sebou: horní se kreslí tady, dolní jako hlavní mostovka níž.
      const horni = y - h * 1.3;
      const pole = rozpeti / poli;
      const vypln: [number, number][] = [];
      for (let i = 0; i <= poli; i++) vypln.push([x0 + i * pole, i % 2 === 0 ? y : horni]);
      lomena(ctx, vypln);
      ctx.save();
      ctx.strokeStyle = BARVY.caraSilna;
      ctx.lineWidth = 3;
      lomena(ctx, [
        [x0, horni],
        [x1, horni],
      ]);
      ctx.restore();
      break;
    }
    case "zaveseny": {
      if (rysy.pylonyNaOperach) {
        // Stožáry na opěrách: z hlavy vějíř lan do mostovky a kotevní lano za opěru. Pod
        // mostovkou nic není (jeden stožár kreslíme vlevo; na které opěře stojí, skica neříká).
        const vrchol = y - h * 1.5;
        const stozary: (readonly [number, number])[] = rysy.pylonu <= 1 ? [[x0, 1]] : [[x0, 1], [x1, -1]];
        for (const [pata, smer] of stozary) {
          for (const podil of rysy.pylonu <= 1 ? [0.25, 0.5, 0.75] : [0.16, 0.3, 0.44]) {
            lomena(ctx, [
              [pata, vrchol],
              [pata + smer * rozpeti * podil, y],
            ]);
          }
          lomena(ctx, [
            [pata, vrchol],
            [pata - smer * okraj * 0.8, y],
          ]);
          pilir(ctx, pata, vrchol, y);
        }
        break;
      }
      // Jeden pylon uprostřed, nebo dva ve třetinách: podle mostu.
      const pylony = rysy.pylonu <= 1 ? [(x0 + x1) / 2] : [x0 + rozpeti * 0.3, x1 - rozpeti * 0.3];
      const dosah = rysy.pylonu <= 1 ? [0.16, 0.3, 0.44] : [0.1, 0.19, 0.28];
      for (const pylon of pylony) {
        const vrchol = y - h * 1.5;
        for (const podil of dosah) {
          lomena(ctx, [
            [pylon - rozpeti * podil, y],
            [pylon, vrchol],
            [pylon + rozpeti * podil, y],
          ]);
        }
        pilir(ctx, pylon, vrchol, dno);
      }
      break;
    }
    case "visuty": {
      const leva = x0 + rozpeti * 0.18;
      const prava = x1 - rozpeti * 0.18;
      const vrchol = y - h * 1.5;
      // Nosné lano: parabola mezi pylony a kotevní lana k břehům.
      const lano: [number, number][] = [[x0 - okraj * 0.6, y]];
      const dilu = 10;
      for (let i = 0; i <= dilu; i++) {
        const u = i / dilu;
        const pruves = 4 * u * (1 - u);
        const x = leva + (prava - leva) * u;
        const vyskaLana = vrchol + (y - 8 - vrchol) * pruves;
        lano.push([x, vyskaLana]);
        if (i > 0 && i < dilu) {
          lomena(ctx, [
            [x, vyskaLana],
            [x, y],
          ]);
        }
      }
      lano.push([x1 + okraj * 0.6, y]);
      lomena(ctx, lano);
      pilir(ctx, leva, vrchol, dno);
      pilir(ctx, prava, vrchol, dno);
      break;
    }
    case "zvedaci":
    case "nosnik":
    case "mostovka":
      break;
  }

  // Mostovka: u zvedacího mostu zvednuté křídlo s pístem, jinak rovná čára od břehu k břehu.
  ctx.strokeStyle = BARVY.caraSilna;
  ctx.lineWidth = 3;
  if (rysy.soustava === "zvedaci") {
    const kridla: (readonly [number, number])[] = rysy.kridel >= 2 ? [[x0, 1], [x1, -1]] : [[x0, 1]];
    const delka = rysy.kridel >= 2 ? rozpeti * 0.46 : rozpeti * 0.9;
    // Křídlo je pootočené nahoru, ale jen tak, aby se do skici vešlo celé.
    const zdvih = Math.min(delka * 0.38, y - 10);
    const prumet = Math.sqrt(delka * delka - zdvih * zdvih);
    for (const [cep, smer] of kridla) {
      lomena(ctx, [
        [cep, y],
        [cep + smer * prumet, y - zdvih],
      ]);
      // Tečkovaně poloha křídla po sklopení.
      ctx.save();
      ctx.strokeStyle = cara(0.5);
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      lomena(ctx, [
        [cep, y],
        [cep + smer * delka, y],
      ]);
      ctx.restore();
      // Píst: od stěny břehu pod čepem do třetiny křídla.
      ctx.save();
      ctx.strokeStyle = BARVY.voda;
      ctx.lineWidth = 2.5;
      lomena(ctx, [
        [cep, y + h * 1.2],
        [cep + smer * prumet * 0.3, y - zdvih * 0.3],
      ]);
      ctx.restore();
    }
  } else {
    lomena(ctx, [
      [x0, y],
      [x1, y],
    ]);
  }

  // Pilíře pod mostovkou.
  ctx.strokeStyle = BARVY.cara;
  if (rysy.soustava === "nosnik") {
    for (const podil of [0.25, 0.5, 0.75]) pilir(ctx, x0 + rozpeti * podil, y, dno);
  } else if (rysy.pilire) {
    for (const podil of [1 / 3, 2 / 3]) pilir(ctx, x0 + rozpeti * podil, y, dno);
  }

  // Svary: plné čtverečky ve styčnících mostovky, nad pilíři, nebo mezi nimi (podle mostu).
  if (rysy.svary && rysy.soustava !== "zvedaci") {
    ctx.fillStyle = BARVY.caraSilna;
    const nadPiliri = rysy.soustava === "nosnik" ? [0.25, 0.5, 0.75] : [1 / 3, 2 / 3];
    const mezi = rysy.soustava === "nosnik" ? [0.125, 0.375, 0.625, 0.875] : [1 / 6, 0.5, 5 / 6];
    for (const podil of rysy.svaryMeziPodporami ? mezi : nadPiliri) ctx.fillRect(x0 + rozpeti * podil - 3.5, y - 3.5, 7, 7);
  }

  // Vzpěry navíc: ze skály uprostřed údolí do mostovky.
  if (rysy.vzperyNavic) {
    ctx.strokeStyle = BARVY.cara;
    ctx.lineWidth = 1.5;
    const stred = (x0 + x1) / 2;
    lomena(ctx, [
      [stred - rozpeti * 0.12, y],
      [stred, dno - 4],
      [stred + rozpeti * 0.12, y],
    ]);
  }

  // Věšadlo navíc: malý trojúhelník nad středem mostovky.
  if (rysy.vesadloNavic) {
    ctx.strokeStyle = BARVY.cara;
    ctx.lineWidth = 1.5;
    const stred = (x0 + x1) / 2;
    lomena(ctx, [
      [stred - rozpeti * 0.14, y],
      [stred, y - h * 0.9],
      [stred + rozpeti * 0.14, y],
    ]);
    lomena(ctx, [
      [stred, y - h * 0.9],
      [stred, y],
    ]);
  }

  // Závaží: plné obdélníky pod mostovkou.
  if (rysy.zavazi) {
    ctx.fillStyle = BARVY.cara;
    for (const podil of [0.35, 0.5, 0.65]) ctx.fillRect(x0 + rozpeti * podil - 5, y + 3, 10, 8);
  }

  // Laděný tlumič: závaží na pružině pod středem mostovky.
  if (rysy.ladeneTlumice) {
    const x = (x0 + x1) / 2;
    ctx.strokeStyle = BARVY.cara;
    ctx.lineWidth = 1.2;
    const pruzina: [number, number][] = [[x, y + 2]];
    for (let k = 1; k <= 6; k++) pruzina.push([x + (k % 2 === 0 ? -4 : 4), y + 2 + k * 3]);
    pruzina.push([x, y + 23]);
    lomena(ctx, pruzina);
    ctx.fillStyle = BARVY.cara;
    ctx.fillRect(x - 7, y + 23, 14, 9);
  }

  // Viskózní tlumiče: krátké válce pod mostovkou, dole ukotvené.
  if (rysy.viskozniTlumice) {
    for (const podil of [0.25, 0.75]) {
      const x = x0 + rozpeti * podil;
      ctx.strokeStyle = BARVY.voda;
      ctx.lineWidth = 3;
      lomena(ctx, [
        [x, y + 2],
        [x, y + h * 0.9],
      ]);
      ctx.strokeStyle = cara(0.7);
      ctx.lineWidth = 1;
      lomena(ctx, [
        [x - 6, y + h * 0.9 + 2],
        [x + 6, y + h * 0.9 + 2],
      ]);
    }
  }

  // Zámek zvedacího mostu: kroužek na volném konci křídla po sklopení.
  if (rysy.zamek) {
    ctx.strokeStyle = BARVY.caraSilna;
    ctx.lineWidth = 1.5;
    const x = rysy.kridel >= 2 ? (x0 + x1) / 2 : x1;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, 2 * Math.PI);
    ctx.stroke();
  }

  // Ztužení křídel: náznak příhrady nad sklopenou polohou.
  if (rysy.ztuzeni) {
    ctx.save();
    ctx.strokeStyle = cara(0.6);
    ctx.lineWidth = 1;
    prihrada(ctx, x0, x1, y, h * 0.6, 8);
    ctx.restore();
  }
  ctx.restore();
}
