// Pracovní vlákno stránky „shoda výpočtu“: spočítá scénáře regresní sady a posílá otisky.
import { SCENARE, spustScenar, type VysledekScenare } from "../src/zkouska/regrese";

export type ZpravaOtisku =
  | { typ: "vysledek"; vysledek: VysledekScenare; ms: number }
  | { typ: "hotovo" }
  | { typ: "chyba"; id: string; zprava: string };

interface Prostredi {
  postMessage(zprava: ZpravaOtisku): void;
  onmessage: (() => void) | null;
}

const prostredi = self as unknown as Prostredi;

prostredi.onmessage = () => {
  let dalsi = 0;
  // Scénáře se počítají po jednom s přestávkou, aby stránka stihla ukazovat průběh.
  const krok = (): void => {
    const scenar = SCENARE[dalsi++];
    if (!scenar) {
      prostredi.postMessage({ typ: "hotovo" });
      return;
    }
    try {
      const zacatek = performance.now();
      const vysledek = spustScenar(scenar);
      prostredi.postMessage({ typ: "vysledek", vysledek, ms: performance.now() - zacatek });
    } catch (chyba) {
      prostredi.postMessage({ typ: "chyba", id: scenar.id, zprava: chyba instanceof Error ? chyba.message : String(chyba) });
    }
    setTimeout(krok, 0);
  };
  krok();
};
