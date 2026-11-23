// Výzvy o efektivitu: prahy odvozené z referenčních mostů a uložené výsledky zkoušky do zlomu.
import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cenaNavrhu, hmotnostNavrhu } from "../src/data/cena";
import {
  dalsiPrah,
  DRUHY_VYZEV,
  prahyVyzev,
  stupenVyzvy,
  unosnostNaKorunu,
  type PrahyVyzev,
  type ZakladVyzev,
} from "../src/data/vyzvy";
import { VERZE_FYZIKY } from "../src/jadro/verze";
import { Zkouska } from "../src/zkouska/zkouska";
import { ZKOUSKA_DO_ZLOMU } from "../src/zkouska/zlom";
import { nactiKampan, nasadaUrovne } from "../urovne/index";
import { RESENI } from "../urovne/reseni";
import { KLICE_RESENI, mostyProVyzvy, ULOZENE_ZLOMY, zakladVyzev, type UlozenyZlom } from "../urovne/vyzvy";
import type { NavrhMostu } from "../src/data/navrh";
import type { Uroven } from "../src/data/uroven";

const kampan = nactiKampan();

/** Únosnost na korunu referenčního mostu ze zkoušky do zlomu, N/Kč. */
function zmerZlom(uroven: Uroven, navrh: NavrhMostu): number {
  const zkouska = new Zkouska(uroven, navrh, nasadaUrovne(uroven), undefined, undefined, ZKOUSKA_DO_ZLOMU);
  let pojistka = 0;
  while (!zkouska.hotovo) {
    zkouska.pokracuj(1);
    if (pojistka++ > 200) throw new Error("zkouška do zlomu neskončila");
  }
  const vysledek = zkouska.vysledek();
  return unosnostNaKorunu(vysledek.zlom!.celkem, vysledek.cena);
}

const ZAKLAD: ZakladVyzev = { cena: 31_095, cenaMostovky: 20_000, hmotnost: 914, hmotnostMostovky: 857.6, zlom: 3.873 };

describe("prahy výzev", () => {
  const prahy = prahyVyzev(ZAKLAD);

  it("zlato odpovídá referenčnímu mostu, stříbro a bronz dávají rezervu jen na nosnou konstrukci", () => {
    // Cena: zlato 31 095 → 31 100; stříbro 20 000 + 1,15 · 11 095 = 32 759 → 32 800; bronz 35 533 → 35 600.
    expect(prahy.cena).toEqual([35_600, 32_800, 31_100]);
    // Hmotnost: mostovka 857,6 kg je daná; rezerva se počítá z 56,4 kg konstrukce.
    expect(prahy.hmotnost).toEqual([937, 923, 914]);
    // Únosnost na korunu: 45 %, 70 % a 95 % referenčního mostu, zaokrouhleno dolů.
    expect(prahy.zlom).toEqual([1.74, 2.71, 3.67]);
  });

  it("referenční most získá zlato ve všech třech výzvách", () => {
    expect(stupenVyzvy("cena", ZAKLAD.cena, prahy)).toBe(3);
    expect(stupenVyzvy("hmotnost", ZAKLAD.hmotnost, prahy)).toBe(3);
    expect(stupenVyzvy("zlom", ZAKLAD.zlom, prahy)).toBe(3);
  });

  it("stupně: u ceny a hmotnosti je lepší méně, u únosnosti více; nezměřeno není nic", () => {
    expect(stupenVyzvy("cena", 31_100, prahy)).toBe(3);
    expect(stupenVyzvy("cena", 31_101, prahy)).toBe(2);
    expect(stupenVyzvy("cena", 35_600, prahy)).toBe(1);
    expect(stupenVyzvy("cena", 35_601, prahy)).toBe(0);
    expect(stupenVyzvy("zlom", 3.67, prahy)).toBe(3);
    expect(stupenVyzvy("zlom", 3.66, prahy)).toBe(2);
    expect(stupenVyzvy("zlom", 1.73, prahy)).toBe(0);
    for (const druh of DRUHY_VYZEV) {
      expect(stupenVyzvy(druh, null, prahy)).toBe(0);
      expect(stupenVyzvy(druh, 0, prahy)).toBe(0);
    }
  });

  it("další práh je práh nejbližšího vyššího stupně; po zlatu už žádný není", () => {
    expect(dalsiPrah("cena", 0, prahy)).toBe(35_600);
    expect(dalsiPrah("cena", 1, prahy)).toBe(32_800);
    expect(dalsiPrah("cena", 2, prahy)).toBe(31_100);
    expect(dalsiPrah("cena", 3, prahy)).toBeNull();
  });

  it("most jen z mostovky má všechny prahy ceny stejné a zaokrouhlení nic nezhorší", () => {
    const jenMostovka = prahyVyzev({ ...ZAKLAD, cena: 20_000, cenaMostovky: 20_000 });
    expect(jenMostovka.cena).toEqual([20_000, 20_000, 20_000]);
    // Čísla, která už tři platné číslice mají, se zaokrouhlením nezmění.
    const kulata = prahyVyzev({ cena: 948_000, cenaMostovky: 948_000, hmotnost: 12_300, hmotnostMostovky: 12_300, zlom: 2 });
    expect(kulata.cena[2]).toBe(948_000);
    expect(kulata.hmotnost[2]).toBe(12_300);
    expect(kulata.zlom).toEqual([0.9, 1.4, 1.9]);
  });
});

describe("výzvy na úrovních kampaně", () => {
  it("každá úroveň má základ výzev a referenční mosty v nich získají zlato", () => {
    for (const uroven of kampan) {
      const zaklad = zakladVyzev(uroven);
      expect(zaklad, uroven.id).not.toBeNull();
      const prahy: PrahyVyzev = prahyVyzev(zaklad!);
      const mosty = mostyProVyzvy(uroven.id);
      const nejlevnejsi = Math.min(...mosty.map((m) => cenaNavrhu(m)));
      const nejlehci = Math.min(...mosty.map((m) => hmotnostNavrhu(m, uroven)));
      expect(stupenVyzvy("cena", nejlevnejsi, prahy), uroven.id).toBe(3);
      expect(stupenVyzvy("hmotnost", nejlehci, prahy), uroven.id).toBe(3);
      expect(stupenVyzvy("zlom", zaklad!.zlom, prahy), uroven.id).toBe(3);
      // Prahy jdou po sobě a zlato je nejpřísnější.
      for (const druh of ["cena", "hmotnost"] as const) {
        expect(prahy[druh][0], `${uroven.id} ${druh}`).toBeGreaterThanOrEqual(prahy[druh][1]);
        expect(prahy[druh][1], `${uroven.id} ${druh}`).toBeGreaterThanOrEqual(prahy[druh][2]);
      }
      expect(prahy.zlom[0], uroven.id).toBeLessThan(prahy.zlom[1]);
      expect(prahy.zlom[1], uroven.id).toBeLessThan(prahy.zlom[2]);
      // Nejlevnější referenční most se vejde do rozpočtu úrovně, jinak by výzva nešla hrát.
      if (uroven.rozpocet !== null) expect(nejlevnejsi, uroven.id).toBeLessThanOrEqual(uroven.rozpocet);
    }
  });

  // S proměnnou MM_ZAPIS_VYZEV=1 (`npm run vyzvy`) výsledky zkoušek do zlomu znovu změří na
  // všech referenčních mostech a zapíše; jinak ověří, že uložený nejúčinnější most každé
  // úrovně opravdu unese na korunu tolik, kolik je zapsáno.
  it(
    "uložená únosnost na korunu odpovídá zkoušce do zlomu referenčního mostu",
    () => {
      if (process.env.MM_ZAPIS_VYZEV === "1") {
        const urovne: Record<string, UlozenyZlom> = {};
        for (const uroven of kampan) {
          let nejlepsi: UlozenyZlom | null = null;
          for (const klic of KLICE_RESENI) {
            const naKorunu = zmerZlom(uroven, RESENI[uroven.id]![klic]);
            if (!nejlepsi || naKorunu > nejlepsi.naKorunu) nejlepsi = { reseni: klic, naKorunu };
          }
          urovne[uroven.id] = nejlepsi!;
        }
        writeFileSync(
          new URL("../urovne/zlomy.json", import.meta.url),
          `${JSON.stringify({ verzeFyziky: VERZE_FYZIKY, urovne }, null, 2)}\n`,
        );
        return;
      }
      expect(ULOZENE_ZLOMY.verzeFyziky, "po změně fyziky pusť npm run vyzvy").toBe(VERZE_FYZIKY);
      expect(Object.keys(ULOZENE_ZLOMY.urovne)).toEqual(kampan.map((u) => u.id));
      for (const uroven of kampan) {
        const ulozeny = ULOZENE_ZLOMY.urovne[uroven.id]!;
        const zmereno = zmerZlom(uroven, RESENI[uroven.id]![ulozeny.reseni]);
        expect(zmereno, `${uroven.id}: po změně úrovně nebo mostu pusť npm run vyzvy`).toBeCloseTo(ulozeny.naKorunu, 9);
        expect(zmereno, uroven.id).toBeGreaterThan(0);
      }
    },
    600_000,
  );
});
