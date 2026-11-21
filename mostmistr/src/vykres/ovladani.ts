import type { Bod } from "../data/geometrie";

/** Co ovládání výkresu hlásí zbytku hry. Souřadnice jsou v pixelech plátna. */
export interface PosluchacOvladani {
  posun(dx: number, dy: number): void;
  zoom(kotva: Bod, faktor: number): void;
  /** Zoom klávesnicí nebo tlačítkem: kolem středu plátna. */
  zoomNaStred(faktor: number): void;
  celyVykres(): void;
  /** Kurzor se pohnul nad plátnem; null, když ho opustil. */
  kurzor(bod: Bod | null): void;
  /** Levé tlačítko: kreslení a výběr. Bez něj levé tlačítko nedělá nic. */
  leve?: PosluchacLevehoTlacitka;
}

export interface PosluchacLevehoTlacitka {
  stisk(bod: Bod, klavesy: { shift: boolean; alt: boolean }): void;
  /** Pohyb se stisknutým tlačítkem. */
  tah(bod: Bod): void;
  pusteni(bod: Bod): void;
  /** Tah přerušil systém (ztráta ukazatele); nic se nemá dokončit. */
  zruseni(): void;
}

const KROK_KLAVESNICE = 60; // pixelů na stisk šipky
const ZOOM_KLAVESNICE = 1.25;

/** Kolečko myši hlásí posun v pixelech, řádcích nebo stránkách; sjednotíme na pixely. */
function pixelyKolecka(udalost: WheelEvent): number {
  if (udalost.deltaMode === WheelEvent.DOM_DELTA_LINE) return udalost.deltaY * 16;
  if (udalost.deltaMode === WheelEvent.DOM_DELTA_PAGE) return udalost.deltaY * 400;
  return udalost.deltaY;
}

/**
 * Připojí ovládání výkresu: zoom kolečkem, posun pravým nebo prostředním tlačítkem,
 * klávesy šipek, plus, minus a Home. Levé tlačítko patří kreslení a hlásí se posluchači
 * `leve`. Mezerník je vyhrazený pro spuštění zkoušky, proto výkres neposouvá.
 */
export function pripojOvladani(canvas: HTMLCanvasElement, posluchac: PosluchacOvladani): void {
  let tazeni: { ukazatel: number; x: number; y: number } | null = null;
  /** Ukazatel, který právě drží levé tlačítko. */
  let leve: number | null = null;

  const mistoNaPlatne = (udalost: MouseEvent): Bod => {
    const obrys = canvas.getBoundingClientRect();
    return { x: udalost.clientX - obrys.left, y: udalost.clientY - obrys.top };
  };
  const nastavKurzor = (): void => {
    canvas.style.cursor = tazeni ? "grabbing" : "crosshair";
  };

  canvas.addEventListener("contextmenu", (udalost) => udalost.preventDefault());

  canvas.addEventListener("pointerdown", (udalost) => {
    canvas.focus({ preventScroll: true });
    if (udalost.button === 0) {
      if (!posluchac.leve || tazeni || leve !== null) return;
      udalost.preventDefault();
      leve = udalost.pointerId;
      canvas.setPointerCapture(udalost.pointerId);
      posluchac.leve.stisk(mistoNaPlatne(udalost), { shift: udalost.shiftKey, alt: udalost.altKey });
      return;
    }
    if (udalost.button !== 1 && udalost.button !== 2) return;
    if (leve !== null) return;
    udalost.preventDefault();
    tazeni = { ukazatel: udalost.pointerId, x: udalost.clientX, y: udalost.clientY };
    canvas.setPointerCapture(udalost.pointerId);
    nastavKurzor();
  });

  canvas.addEventListener("pointermove", (udalost) => {
    if (tazeni && udalost.pointerId === tazeni.ukazatel) {
      posluchac.posun(udalost.clientX - tazeni.x, udalost.clientY - tazeni.y);
      tazeni.x = udalost.clientX;
      tazeni.y = udalost.clientY;
    }
    const misto = mistoNaPlatne(udalost);
    if (leve === udalost.pointerId) posluchac.leve?.tah(misto);
    posluchac.kurzor(misto);
  });

  const uvolni = (udalost: PointerEvent): void => {
    if (canvas.hasPointerCapture(udalost.pointerId)) canvas.releasePointerCapture(udalost.pointerId);
  };
  canvas.addEventListener("pointerup", (udalost) => {
    if (leve === udalost.pointerId && udalost.button === 0) {
      leve = null;
      uvolni(udalost);
      posluchac.leve?.pusteni(mistoNaPlatne(udalost));
      return;
    }
    if (tazeni && udalost.pointerId === tazeni.ukazatel && udalost.button !== 0) {
      tazeni = null;
      uvolni(udalost);
      nastavKurzor();
    }
  });
  canvas.addEventListener("pointercancel", (udalost) => {
    if (leve === udalost.pointerId) {
      leve = null;
      posluchac.leve?.zruseni();
    }
    if (tazeni && udalost.pointerId === tazeni.ukazatel) tazeni = null;
    uvolni(udalost);
    nastavKurzor();
  });
  canvas.addEventListener("pointerleave", () => {
    if (!tazeni && leve === null) posluchac.kurzor(null);
  });

  canvas.addEventListener(
    "wheel",
    (udalost) => {
      udalost.preventDefault();
      // Omezení jednoho kroku, aby trhnutí kolečkem neodletělo přes celý rozsah.
      const pixely = Math.max(-240, Math.min(240, pixelyKolecka(udalost)));
      posluchac.zoom(mistoNaPlatne(udalost), Math.exp(-pixely * 0.0018));
    },
    { passive: false },
  );

  window.addEventListener("keydown", (udalost) => {
    if (udalost.target instanceof HTMLElement && udalost.target.closest("input, textarea, select, dialog")) return;
    if (udalost.ctrlKey || udalost.metaKey || udalost.altKey) return;
    switch (udalost.key) {
      case "ArrowLeft":
        posluchac.posun(KROK_KLAVESNICE, 0);
        break;
      case "ArrowRight":
        posluchac.posun(-KROK_KLAVESNICE, 0);
        break;
      case "ArrowUp":
        posluchac.posun(0, KROK_KLAVESNICE);
        break;
      case "ArrowDown":
        posluchac.posun(0, -KROK_KLAVESNICE);
        break;
      case "+":
      case "=":
        posluchac.zoomNaStred(ZOOM_KLAVESNICE);
        break;
      case "-":
        posluchac.zoomNaStred(1 / ZOOM_KLAVESNICE);
        break;
      case "Home":
        posluchac.celyVykres();
        break;
      default:
        return;
    }
    udalost.preventDefault();
  });

  nastavKurzor();
}
