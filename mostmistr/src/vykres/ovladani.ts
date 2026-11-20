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
 * Připojí ovládání výkresu: zoom kolečkem, posun pravým nebo prostředním tlačítkem
 * či levým s mezerníkem, klávesy šipek, plus, minus a Home.
 * Levé tlačítko bez mezerníku zůstává volné pro kreslení prutů.
 */
export function pripojOvladani(canvas: HTMLCanvasElement, posluchac: PosluchacOvladani): void {
  let mezernik = false;
  let tazeni: { ukazatel: number; x: number; y: number } | null = null;

  const mistoNaPlatne = (udalost: MouseEvent): Bod => {
    const obrys = canvas.getBoundingClientRect();
    return { x: udalost.clientX - obrys.left, y: udalost.clientY - obrys.top };
  };
  const nastavKurzor = (): void => {
    canvas.style.cursor = tazeni ? "grabbing" : mezernik ? "grab" : "crosshair";
  };

  canvas.addEventListener("contextmenu", (udalost) => udalost.preventDefault());

  canvas.addEventListener("pointerdown", (udalost) => {
    canvas.focus({ preventScroll: true });
    const posouva = udalost.button === 1 || udalost.button === 2 || (udalost.button === 0 && mezernik);
    if (!posouva) return;
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
    posluchac.kurzor(mistoNaPlatne(udalost));
  });

  const ukonciTazeni = (udalost: PointerEvent): void => {
    if (!tazeni || udalost.pointerId !== tazeni.ukazatel) return;
    tazeni = null;
    if (canvas.hasPointerCapture(udalost.pointerId)) canvas.releasePointerCapture(udalost.pointerId);
    nastavKurzor();
  };
  canvas.addEventListener("pointerup", ukonciTazeni);
  canvas.addEventListener("pointercancel", ukonciTazeni);
  canvas.addEventListener("pointerleave", () => {
    if (!tazeni) posluchac.kurzor(null);
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
    if (udalost.target instanceof HTMLElement && udalost.target.closest("input, textarea, select")) return;
    if (udalost.ctrlKey || udalost.metaKey || udalost.altKey) return;
    switch (udalost.key) {
      case " ":
        // Na tlačítku mezerník mačká tlačítko; posun výkresu si ho bere jen jinde.
        if (udalost.target instanceof HTMLButtonElement) return;
        mezernik = true;
        nastavKurzor();
        break;
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

  window.addEventListener("keyup", (udalost) => {
    if (udalost.key !== " ") return;
    mezernik = false;
    nastavKurzor();
  });
  window.addEventListener("blur", () => {
    mezernik = false;
    nastavKurzor();
  });

  nastavKurzor();
}
