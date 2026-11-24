// Žebříček stojí na tom, že server a hra spočítají témuž mostu stejný otisk zkoušky, i když
// zkoušku krokují jinak: hra po čtvrtsekundách v pracovním vlákně (`BehZkousky`), server po
// sekundách (`overovacKampane`). Tady to hlídá jeden most každé úrovně kampaně; kdyby se otisk
// s délkou dávky měnil, server by poctivé zápisy odmítal jako podvržené.
import { describe, expect, it } from "vitest";
import { cenaNavrhu, hmotnostNavrhu } from "../src/data/cena";
import { zakodujMost } from "../src/data/sdileni";
import { VERZE_FYZIKY } from "../src/jadro/verze";
import { otiskZadani, overovacKampane } from "../src/server/overeni";
import { BehZkousky } from "../src/zkouska/beh";
import type { VysledekZkousky, ZpravaZeZkousky } from "../src/zkouska/protokol";
import { nactiKampan, nasadaUrovne } from "../urovne/index";
import { RESENI } from "../urovne/reseni";

/** Dávka děje, po které počítá pracovní vlákno hry (`src/zkouska/pracovnik.ts`). */
const DAVKA_HRY = 0.25;

const kampan = nactiKampan();
const over = overovacKampane();

function vysledekVeHre(id: string): VysledekZkousky {
  const uroven = kampan.find((u) => u.id === id)!;
  const zpravy: ZpravaZeZkousky[] = [];
  const beh = new BehZkousky((zprava) => {
    // Záznam snímků test nepotřebuje a je velký: nechává si jen konec a chyby.
    if (zprava.typ !== "zaznam") zpravy.push(zprava);
  });
  beh.prijmi({ typ: "start", vstup: { uroven, navrh: RESENI[id]!.mistrovska, nasada: nasadaUrovne(uroven), verzeFyziky: VERZE_FYZIKY } });
  while (beh.pokracuj(DAVKA_HRY));
  const konec = zpravy.find((z) => z.typ === "konec");
  if (!konec || konec.typ !== "konec") throw new Error(`zkouška ${id} neskončila výsledkem: ${JSON.stringify(zpravy.filter((z) => z.typ === "chyba"))}`);
  return konec.vysledek;
}

describe("otisk zkoušky na serveru a ve hře", () => {
  it("kampaň má úrovně, které server zná, a každá má jiný klíč žebříčku", () => {
    expect(kampan.length).toBeGreaterThanOrEqual(38);
    const klice = new Set(kampan.map((u) => over.klicUrovne(u)));
    expect(klice.size).toBe(kampan.length);
    for (const u of kampan) expect(over.uroven(u.id)?.id).toBe(u.id);
    expect(over.uroven("9-01")).toBeNull();
    // Název, ladění medailí ani štítek zkoušky žebříček nemažou; změna zadání ano.
    const u = kampan[0]!;
    expect(otiskZadani({ ...u, nazev: "Jinak", inzenyrskyRozpocet: 1 })).toBe(otiskZadani(u));
    // Mez průhybu mostovky (formát úrovně 9): úrovni bez ní nové pole klíč nezmění (žebříčky
    // ostatních úrovní zůstávají), úrovni s ní ano.
    const { nejvetsiPruhyb: _mez, ...bezPole } = u;
    expect(otiskZadani({ ...u, nejvetsiPruhyb: null })).toBe(otiskZadani(bezPole as typeof u));
    expect(otiskZadani({ ...u, nejvetsiPruhyb: 0.1 })).not.toBe(otiskZadani({ ...u, nejvetsiPruhyb: null }));
    expect(otiskZadani({ ...u, rozpocet: (u.rozpocet ?? 0) + 1 })).not.toBe(otiskZadani(u));
  });

  for (const uroven of kampan) {
    it(`${uroven.id}: mistrovský most dostane na serveru stejný otisk jako ve hře a platí`, () => {
      const navrh = RESENI[uroven.id]!.mistrovska;
      const kod = zakodujMost(navrh);
      expect(over.priprav(uroven, kod).stav).toBe("pripraven");
      const server = over.bezna(uroven, kod);
      const hra = vysledekVeHre(uroven.id);
      expect(server.otisk).toBe(hra.otisk);
      expect(server.plati).toBe(true);
      expect(hra.pruchod && hra.neporuseny).toBe(true);
      expect(server.cena).toBe(cenaNavrhu(navrh));
      expect(server.cena).toBe(hra.cena);
      expect(server.hmotnost).toBe(hmotnostNavrhu(navrh, uroven));
    }, 120_000);
  }
});
