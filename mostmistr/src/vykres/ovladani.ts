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
  /**
   * Šipka o krok rastru ve směru `dx`, `dy` (osa y nahoru). Vrátí true, když ji hra použila
   * (posun vybraných styčníků); jinak šipka posune pohled.
   */
  sipka?(dx: number, dy: number): boolean;
}

export interface PosluchacLevehoTlacitka {
  /** `dotyk`: stiskl prst, ne myš (cíl na výkresu pak chce větší dosah). */
  stisk(bod: Bod, klavesy: { shift: boolean; alt: boolean; dotyk: boolean }): void;
  /** Pohyb se stisknutým tlačítkem. */
  tah(bod: Bod): void;
  pusteni(bod: Bod): void;
  /** Tah přerušil systém (ztráta ukazatele); nic se nemá dokončit. */
  zruseni(): void;
  /**
   * Provede stisk něco hned a nevratně (pověsí závaží, přepne svar, spustí pokus)? Takový stisk
   * se u dotyku ohlásí až při zvednutí prstu, který se nepohnul: jinak by ho udělal i první
   * prst pomalého gesta dvěma prsty a zrušení by ho už nevrátilo.
   */
  okamzity?(): boolean;
}

const KROK_KLAVESNICE = 60; // pixelů na stisk šipky
const ZOOM_KLAVESNICE = 1.25;
/** Směr šipky ve světě (osa y nahoru). */
const SMERY_SIPEK: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
};

/**
 * Dotyk se jako stisk ohlásí až po téhle době, nebo jakmile se prst pohne o `VULE_DOTYKU`.
 * Kdo chce výkres dvěma prsty posunout, nepoloží je ve stejný okamžik; bez prodlevy by první
 * prst stihl něco nakreslit, pověsit závaží nebo spustit budič.
 */
const PRODLEVA_DOTYKU = 140; // ms
const VULE_DOTYKU = 8; // pixelů
/** Pod touhle roztečí prstů se zoom nepočítá: poměr dvou malých čísel by skákal. */
const NEJMENSI_ROZTEC = 12; // pixelů

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
 *
 * Na dotykové obrazovce jeden prst dělá totéž co levé tlačítko (kde výkres nic nekreslí,
 * posouvá ho) a dva prsty výkres posouvají a zvětšují. Druhý prst rozdělaný tah zruší.
 */
export function pripojOvladani(canvas: HTMLCanvasElement, posluchac: PosluchacOvladani): void {
  let tazeni: { ukazatel: number; x: number; y: number } | null = null;
  /** Ukazatel, který právě drží levé tlačítko. */
  let leve: number | null = null;
  /** Prsty položené na plátně a kde právě jsou (souřadnice okna). */
  const dotyky = new Map<number, Bod>();
  /** Gesto dvěma prsty: který pár ho drží, kde měl střed a jakou rozteč. */
  let gesto: { a: number; b: number; stred: Bod; roztec: number } | null = null;
  /** Po gestu zbylý prst nic nekreslí; čeká se, až se zvednou všechny. */
  let poGestu = false;
  /**
   * První dotyk, který se ještě neohlásil jako stisk. `jenTuknuti`: stisk by provedl akci hned,
   * proto čeká na zvednutí prstu; `pohnul`: prst se mezitím rozjel, akce se neprovede.
   */
  let cekajici: { ukazatel: number; x: number; y: number; misto: Bod; casovac: number; jenTuknuti: boolean; pohnul: boolean } | null = null;

  const mistoNaPlatne = (udalost: { clientX: number; clientY: number }): Bod => {
    const obrys = canvas.getBoundingClientRect();
    return { x: udalost.clientX - obrys.left, y: udalost.clientY - obrys.top };
  };
  const nastavKurzor = (): void => {
    canvas.style.cursor = tazeni ? "grabbing" : "crosshair";
  };

  /** Čekající dotyk se stane stiskem levého tlačítka. */
  const ohlasStisk = (): void => {
    if (!cekajici) return;
    window.clearTimeout(cekajici.casovac);
    const { ukazatel, misto } = cekajici;
    cekajici = null;
    // Levé tlačítko mezitím zabrala myš nebo se výkres táhne: dotyk se neohlásí.
    if (leve !== null || tazeni) return;
    leve = ukazatel;
    posluchac.leve?.stisk(misto, { shift: false, alt: false, dotyk: true });
  };
  const zahodCekajici = (): void => {
    if (!cekajici) return;
    window.clearTimeout(cekajici.casovac);
    cekajici = null;
  };

  /** Střed a rozteč páru prstů, který drží gesto. */
  const parPrstu = (a: number, b: number): { stred: Bod; roztec: number } | null => {
    const prvni = dotyky.get(a);
    const druhy = dotyky.get(b);
    if (!prvni || !druhy) return null;
    return {
      stred: { x: (prvni.x + druhy.x) / 2, y: (prvni.y + druhy.y) / 2 },
      roztec: Math.hypot(druhy.x - prvni.x, druhy.y - prvni.y),
    };
  };

  const dotykDolu = (udalost: PointerEvent): void => {
    dotyky.set(udalost.pointerId, { x: udalost.clientX, y: udalost.clientY });
    canvas.setPointerCapture(udalost.pointerId);
    udalost.preventDefault();
    if (dotyky.size === 2) {
      // Druhý prst: co první rozdělal, neplatí, a pár začíná gesto.
      zahodCekajici();
      if (leve !== null) {
        leve = null;
        posluchac.leve?.zruseni();
      }
      tazeni = null;
      const [a, b] = [...dotyky.keys()] as [number, number];
      const par = parPrstu(a, b);
      if (par) gesto = { a, b, ...par };
      posluchac.kurzor(null);
      return;
    }
    if (dotyky.size !== 1 || poGestu || leve !== null || tazeni) return;
    if (!posluchac.leve) {
      // Výkres, na kterém se nekreslí (zkušebna), jeden prst posouvá.
      tazeni = { ukazatel: udalost.pointerId, x: udalost.clientX, y: udalost.clientY };
      return;
    }
    const jenTuknuti = posluchac.leve.okamzity?.() ?? false;
    cekajici = {
      ukazatel: udalost.pointerId,
      x: udalost.clientX,
      y: udalost.clientY,
      misto: mistoNaPlatne(udalost),
      casovac: jenTuknuti ? 0 : window.setTimeout(ohlasStisk, PRODLEVA_DOTYKU),
      jenTuknuti,
      pohnul: false,
    };
  };

  /** Pohyb prstu; vrátí true, když ho spotřebovalo gesto nebo čekání a dál se nemá hlásit. */
  const dotykPohyb = (udalost: PointerEvent): boolean => {
    if (!dotyky.has(udalost.pointerId)) return false;
    dotyky.set(udalost.pointerId, { x: udalost.clientX, y: udalost.clientY });
    if (gesto) {
      if (udalost.pointerId !== gesto.a && udalost.pointerId !== gesto.b) return true;
      const par = parPrstu(gesto.a, gesto.b);
      if (!par) return true;
      posluchac.posun(par.stred.x - gesto.stred.x, par.stred.y - gesto.stred.y);
      if (par.roztec >= NEJMENSI_ROZTEC && gesto.roztec >= NEJMENSI_ROZTEC) {
        posluchac.zoom(mistoNaPlatne({ clientX: par.stred.x, clientY: par.stred.y }), par.roztec / gesto.roztec);
      }
      gesto.stred = par.stred;
      gesto.roztec = par.roztec;
      return true;
    }
    if (poGestu) return true;
    if (cekajici && udalost.pointerId === cekajici.ukazatel) {
      const dx = udalost.clientX - cekajici.x;
      const dy = udalost.clientY - cekajici.y;
      if (dx * dx + dy * dy < VULE_DOTYKU * VULE_DOTYKU) return true;
      if (cekajici.jenTuknuti) {
        // Prst se rozjel: nebylo to ťuknutí, akce se neprovede.
        cekajici.pohnul = true;
        return true;
      }
      ohlasStisk();
    }
    return false;
  };

  /** Zvednutý nebo ztracený prst; vrátí true, když patřil gestu a dál se nemá hlásit. */
  const dotykNahoru = (udalost: PointerEvent, zruseno: boolean): boolean => {
    if (!dotyky.delete(udalost.pointerId)) return false;
    if (gesto && (udalost.pointerId === gesto.a || udalost.pointerId === gesto.b)) {
      gesto = null;
      poGestu = dotyky.size > 0;
      return true;
    }
    if (dotyky.size === 0 && poGestu) {
      poGestu = false;
      return true;
    }
    if (cekajici && udalost.pointerId === cekajici.ukazatel) {
      // Krátké ťuknutí: stisk a hned puštění. Ztracený dotyk a prst, který se s nástrojem
      // jednající hned rozjel, se neohlásí vůbec.
      if (zruseno || cekajici.pohnul) {
        zahodCekajici();
        return true;
      }
      ohlasStisk();
    }
    return false;
  };

  canvas.addEventListener("contextmenu", (udalost) => udalost.preventDefault());

  canvas.addEventListener("pointerdown", (udalost) => {
    canvas.focus({ preventScroll: true });
    if (udalost.pointerType === "touch") {
      dotykDolu(udalost);
      return;
    }
    if (udalost.button === 0) {
      if (!posluchac.leve || tazeni || leve !== null) return;
      udalost.preventDefault();
      leve = udalost.pointerId;
      canvas.setPointerCapture(udalost.pointerId);
      posluchac.leve.stisk(mistoNaPlatne(udalost), { shift: udalost.shiftKey, alt: udalost.altKey, dotyk: false });
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
    if (udalost.pointerType === "touch" && dotykPohyb(udalost)) return;
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
    const dotyk = udalost.pointerType === "touch";
    if (dotyk && dotykNahoru(udalost, false)) {
      uvolni(udalost);
      return;
    }
    if (leve === udalost.pointerId && udalost.button === 0) {
      leve = null;
      uvolni(udalost);
      posluchac.leve?.pusteni(mistoNaPlatne(udalost));
      // Prst nad výkresem nezůstává jako kurzor myši: zvýraznění pod ním zhasne.
      if (dotyk) posluchac.kurzor(null);
      return;
    }
    if (tazeni && udalost.pointerId === tazeni.ukazatel && (dotyk || udalost.button !== 0)) {
      tazeni = null;
      uvolni(udalost);
      nastavKurzor();
    }
  });
  canvas.addEventListener("pointercancel", (udalost) => {
    if (udalost.pointerType === "touch" && dotykNahoru(udalost, true)) {
      uvolni(udalost);
      return;
    }
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
    const smer = SMERY_SIPEK[udalost.key];
    if (smer && posluchac.sipka?.(smer[0], smer[1])) {
      udalost.preventDefault();
      return;
    }
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
