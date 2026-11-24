// Podmínky medailí slovy: číslo, které hráč čte, je přesně to, podle kterého hra rozhoduje.
import { describe, expect, it } from "vitest";
import type { NavrhMostu } from "../src/data/navrh";
import { podminkaMistrovske, procNeziskal } from "../src/hra/medaile";
import { VERZE_FYZIKY } from "../src/jadro/verze";
import { nastavJazyk } from "../src/ui/slovnik";
import { BehZkousky } from "../src/zkouska/beh";
import type { VysledekZkousky, ZpravaZeZkousky } from "../src/zkouska/protokol";
import { nactiKampan, nasadaUrovne } from "../urovne/index";
import { RESENI } from "../urovne/reseni";

const kampan = nactiKampan();

describe("podmínka mistrovské medaile", () => {
  it("píše limit bonusu beze ztráty: 0,25 m/s² není 0,3", () => {
    nastavJazyk("cs");
    for (const uroven of kampan) {
      const bonus = uroven.mistrovska!;
      const text = podminkaMistrovske(uroven)!;
      // Poslední číslo ve větě je limit: v procentech, m/s² nebo kN.
      const cisla = [...text.matchAll(/\d+(?:,\d+)?/g)].map((m) => Number(m[0].replace(",", ".")));
      const psano = cisla.at(-1)!;
      const hodnota = bonus.druh === "rezerva" ? psano / 100 : bonus.druh === "dosednuti" ? psano * 1000 : psano;
      expect(hodnota, `${uroven.id}: ${text}`).toBeCloseTo(bonus.limit, 9);
    }
    const nabrezi = kampan.find((u) => u.id === "5-01")!;
    expect(podminkaMistrovske(nabrezi)).toBe("rozpočtová medaile a k ní kmitání mostovky nejvýš 0,25 m/s²");
  });

  it("mistrovská je vždycky rozpočtová a něco k ní, česky i anglicky", () => {
    for (const uroven of kampan) {
      nastavJazyk("cs");
      expect(podminkaMistrovske(uroven), uroven.id).toMatch(/^rozpočtová medaile a k ní /);
      nastavJazyk("en");
      expect(podminkaMistrovske(uroven), uroven.id).toMatch(/^the Budget medal plus /);
    }
    nastavJazyk("cs");
  });
});

/** Spočítá zkoušku mostu stejnou cestou jako hra (zprávou „start“). */
function zkousej(id: string, navrh: NavrhMostu): VysledekZkousky {
  const uroven = kampan.find((u) => u.id === id)!;
  const zpravy: ZpravaZeZkousky[] = [];
  const beh = new BehZkousky((zprava) => zpravy.push(zprava));
  beh.prijmi({ typ: "start", vstup: { uroven, navrh, nasada: nasadaUrovne(uroven), verzeFyziky: VERZE_FYZIKY } });
  let pojistka = 0;
  while (beh.pokracuj(1)) expect(pojistka++).toBeLessThan(400);
  const konec = zpravy.at(-1)!;
  if (konec.typ !== "konec") throw new Error(JSON.stringify(konec));
  return konec.vysledek;
}

describe("proč medaile nepřišla", () => {
  it("u každé nezískané medaile řekne důvod s čísly; získaná důvod nemá", () => {
    nastavJazyk("cs");
    const uroven = kampan.find((u) => u.id === "1-01")!;
    const reseni = RESENI["1-01"]!;
    const mistrovska = zkousej("1-01", reseni.mistrovska);
    expect(procNeziskal(uroven, mistrovska)).toEqual({ pruchod: null, rozpocet: null, mistrovska: null });

    const rozpoctovy = zkousej("1-01", reseni.rozpocet);
    const proc = procNeziskal(uroven, rozpoctovy);
    expect(proc.pruchod).toBeNull();
    expect(proc.rozpocet).toBeNull();
    expect(proc.mistrovska).toMatch(/^využití \d+(,\d+)? %, smí nejvýš 30 %$/);

    const pad = zkousej("1-01", reseni.pady[0]!.navrh);
    expect(procNeziskal(uroven, pad)).toEqual({
      pruchod: "most zkouškou neprošel (proč, říká věta nahoře)",
      rozpocet: "nejdřív musí most projít",
      mistrovska: "nejdřív rozpočtová medaile",
    });
  }, 120_000);

  it("počítá stejně jako zkouška a píše stejnými formáty jako výsledek", () => {
    nastavJazyk("cs");
    const uroven = kampan.find((u) => u.id === "1-01")!;
    const rozpocet = uroven.inzenyrskyRozpocet!;
    const zaklad = {
      pruchod: true,
      neporuseny: true,
      poruseni: 0,
      cena: rozpocet + 633,
      nejvetsiVyuziti: 0.303,
      obalka: [{ vyuziti: 0.303 }],
      komfort: null,
      komfortCestujicich: null,
      pohyb: null,
      medaile: { pruchod: true, rozpocet: false, mistrovska: false },
    } as unknown as VysledekZkousky;
    expect(procNeziskal(uroven, zaklad).rozpocet).toBe("o 633\u00a0Kč dražší než inženýrský rozpočet");
    expect(procNeziskal(uroven, zaklad).mistrovska).toBe("nejdřív rozpočtová medaile");
    // Těsně u meze na setiny procenta, jako řádek Největší využití.
    const levny = { ...zaklad, cena: rozpocet, medaile: { pruchod: true, rozpocet: true, mistrovska: false } } as VysledekZkousky;
    expect(procNeziskal(uroven, levny).mistrovska).toBe("využití 30,30 %, smí nejvýš 30 %");
    const pretizeny = { ...zaklad, neporuseny: false, nejvetsiVyuziti: 1.04, obalka: [{ vyuziti: 0.5 }, { vyuziti: 1.04 }] } as unknown as VysledekZkousky;
    expect(procNeziskal(uroven, pretizeny).rozpocet).toBe(
      "na mostě se něco porušilo (prut 2 využitý na 104 %, přes 100 %); o 633\u00a0Kč dražší než inženýrský rozpočet",
    );
    nastavJazyk("en");
    expect(procNeziskal(uroven, levny).mistrovska).toBe("utilisation 30.30%, at most 30% allowed");
    nastavJazyk("cs");
  });
});
