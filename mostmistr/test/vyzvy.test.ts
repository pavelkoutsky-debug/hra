// Výzvy o efektivitu: prahy odvozené z referenčních mostů a uložené výsledky zkoušky do zlomu.
import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cenaNavrhu, hmotnostNavrhu } from "../src/data/cena";
import {
  dalsiPrah,
  DRUHY_VYZEV,
  prahyVyzev,
  stupenVyzvy,
  TIHA_PRO_VYZVY,
  tunNaStoTisic,
  unosnostNaKorunu,
  zobrazenaHodnota,
  type PrahyVyzev,
  type ZakladVyzev,
} from "../src/data/vyzvy";
import { TIHOVE_ZRYCHLENI } from "../src/jadro/integrator";
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

const ZAKLAD: ZakladVyzev = { cena: 31_095, cenaMostovky: 20_000, hmotnost: 914, hmotnostMostovky: 857.6, sampion: null, zlom: 3.873, rozpocet: 45_000 };

describe("prahy výzev", () => {
  const prahy = prahyVyzev(ZAKLAD);

  it("zlato odpovídá referenčnímu mostu, stříbro a bronz dávají rezervu na nosnou konstrukci", () => {
    // Cena: zlato 31 095 → 31 100; stříbro 20 000 + 1,15 · 11 095 = 32 759 → 32 800; bronz 35 533 → 35 600.
    expect(prahy.cena).toEqual([35_600, 32_800, 31_100]);
    // Hmotnost: mostovka 857,6 kg je daná a konstrukce váží jen 56,4 kg; rezerva z ní by dala
    // prahy po pár kilogramech, proto platí nejmenší odstup 2 % a 5 % celého mostu.
    expect(prahy.hmotnost).toEqual([960, 933, 914]);
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
    expect(stupenVyzvy("zlom", 3.65, prahy)).toBe(2);
    expect(stupenVyzvy("zlom", 1.73, prahy)).toBe(0);
    for (const druh of DRUHY_VYZEV) {
      expect(stupenVyzvy(druh, null, prahy)).toBe(0);
      expect(stupenVyzvy(druh, 0, prahy)).toBe(0);
    }
  });

  it("porovnává se číslo, které hráč vidí: stejně vypadající hodnota a práh stupeň dají", () => {
    // 960,4 kg se píše „960 kg“ a práh bronzu je „do 960 kg“: bronz platí. 960,6 kg je „961 kg“.
    expect(stupenVyzvy("hmotnost", 960.4, prahy)).toBe(1);
    expect(stupenVyzvy("hmotnost", 960.6, prahy)).toBe(0);
    // Nad tunu má hmotnost tři platné číslice: 20 140 kg je „20,1 t“.
    const tezke = prahyVyzev({ ...ZAKLAD, hmotnost: 20_100, hmotnostMostovky: 19_500 });
    expect(tezke.hmotnost).toEqual([21_200, 20_600, 20_100]);
    expect(stupenVyzvy("hmotnost", 20_140, tezke)).toBe(3);
    expect(stupenVyzvy("hmotnost", 20_160, tezke)).toBe(2);
    // Únosnost se píše v tunách na 100 000 Kč na desetinu; práh 3,67 N/Kč je „37,4 t“.
    expect(zobrazenaHodnota("zlom", 3.67)).toBe(37.4);
    expect(zobrazenaHodnota("zlom", 3.666)).toBe(37.4);
    expect(stupenVyzvy("zlom", 3.666, prahy)).toBe(3);
    expect(zobrazenaHodnota("cena", 31_094.6)).toBe(31_095);
    expect(zobrazenaHodnota("hmotnost", 936.4)).toBe(936);
  });

  it("tuny na 100 000 Kč počítá se stejným tíhovým zrychlením jako jádro", () => {
    expect(TIHA_PRO_VYZVY).toBe(TIHOVE_ZRYCHLENI);
    expect(tunNaStoTisic(TIHOVE_ZRYCHLENI / 100)).toBeCloseTo(1, 12);
  });

  it("další práh je práh nejbližšího vyššího stupně; po zlatu už žádný není", () => {
    expect(dalsiPrah("cena", 0, prahy)).toBe(35_600);
    expect(dalsiPrah("cena", 1, prahy)).toBe(32_800);
    expect(dalsiPrah("cena", 2, prahy)).toBe(31_100);
    expect(dalsiPrah("cena", 3, prahy)).toBeNull();
  });

  it("bronz ceny zůstává pod rozpočtem úrovně, jinak by ho dostal každý most, který projde", () => {
    // Rezerva na konstrukci by dala stříbro 32 800 a bronz 35 600; rozpočet 33 000 je srazí.
    const tesny = prahyVyzev({ ...ZAKLAD, rozpocet: 33_000 });
    expect(tesny.cena).toEqual([32_400, 31_800, 31_100]);
    // Bez rozpočtu (nebo s rozpočtem pod zlatem) platí jen rezerva.
    expect(prahyVyzev({ ...ZAKLAD, rozpocet: null }).cena).toEqual([35_600, 32_800, 31_100]);
  });

  it("se šampionem je zlato kousek nad ním, stříbro most autora a bronz jako dřív", () => {
    // Šampion stojí 27 000, z toho mostovka 20 000: zlato 20 000 + 1,1 · 7 000 = 27 700.
    const sampion = { cena: 27_000, cenaMostovky: 20_000, hmotnost: 890, hmotnostMostovky: 857.6 };
    const se = prahyVyzev({ ...ZAKLAD, sampion });
    expect(se.cena).toEqual([35_600, 31_100, 27_700]);
    // Hmotnost: konstrukce šampiona váží 32,4 kg a deset procent z ní je míň než 2 % mostu,
    // takže zlato je 2 % nad šampionem (907,8 → 908); stříbro most autora, bronz jako dřív.
    expect(se.hmotnost).toEqual([960, 914, 908]);
    // Most autora má stříbro, šampion zlato, a únosnost na korunu šampion nemění.
    expect(stupenVyzvy("cena", ZAKLAD.cena, se)).toBe(2);
    expect(stupenVyzvy("cena", sampion.cena, se)).toBe(3);
    expect(stupenVyzvy("hmotnost", ZAKLAD.hmotnost, se)).toBe(2);
    expect(stupenVyzvy("hmotnost", sampion.hmotnost, se)).toBe(3);
    expect(se.zlom).toEqual(prahy.zlom);
  });

  it("šampion, který most autora nepřekonal, prahy nemění; zlato nikdy není nad mostem autora", () => {
    const stejny = { cena: ZAKLAD.cena, cenaMostovky: ZAKLAD.cenaMostovky, hmotnost: ZAKLAD.hmotnost, hmotnostMostovky: ZAKLAD.hmotnostMostovky };
    expect(prahyVyzev({ ...ZAKLAD, sampion: stejny })).toEqual(prahy);
    // Šampion jen o pár korun lepší: rezerva nad ním by zlato vynesla nad most autora, a tak zůstane na něm.
    const tesny = prahyVyzev({ ...ZAKLAD, sampion: { ...stejny, cena: 30_900 } });
    expect(tesny.cena).toEqual(prahy.cena);
    // Šampion s levnější mostovkou, než má most autora: počítá se s tou jeho.
    const jinaMostovka = prahyVyzev({ ...ZAKLAD, sampion: { ...stejny, cena: 24_000, cenaMostovky: 16_000 } });
    expect(jinaMostovka.cena).toEqual([35_600, 31_100, 24_800]);
    // Bronz zůstává pod rozpočtem úrovně a nad stříbrem, i když je rozpočet těsný.
    const tesnyRozpocet = prahyVyzev({ ...ZAKLAD, rozpocet: 33_000, sampion: { ...stejny, cena: 27_000 } });
    expect(tesnyRozpocet.cena).toEqual([32_400, 31_100, 27_700]);
  });

  it("stupně nikdy nesplynou: ani u mostu jen z mostovky, ani s rozpočtem těsně nad zlatem", () => {
    const jenMostovka = prahyVyzev({ ...ZAKLAD, cena: 20_000, cenaMostovky: 20_000, rozpocet: null });
    expect(jenMostovka.cena).toEqual([21_000, 20_400, 20_000]);
    const naHrane = prahyVyzev({ ...ZAKLAD, rozpocet: 31_150 });
    expect(naHrane.cena[2]).toBe(31_100);
    expect(naHrane.cena[1]).toBeGreaterThan(naHrane.cena[2]);
    expect(naHrane.cena[0]).toBeGreaterThan(naHrane.cena[1]);
    // Čísla, která už tři platné číslice mají, se zaokrouhlením nezmění.
    const kulata = prahyVyzev({ cena: 948_000, cenaMostovky: 948_000, hmotnost: 12_300, hmotnostMostovky: 12_300, sampion: null, zlom: 2, rozpocet: null });
    expect(kulata.cena[2]).toBe(948_000);
    expect(kulata.hmotnost[2]).toBe(12_300);
    expect(kulata.zlom).toEqual([0.9, 1.4, 1.9]);
  });
});

describe("výzvy na úrovních kampaně", () => {
  it("každá úroveň má základ výzev: šampioni v nich získají zlato a mosty autora aspoň stříbro", () => {
    for (const uroven of kampan) {
      const zaklad = zakladVyzev(uroven);
      expect(zaklad, uroven.id).not.toBeNull();
      const prahy: PrahyVyzev = prahyVyzev(zaklad!);
      const mosty = mostyProVyzvy(uroven.id);
      const nejlevnejsi = Math.min(...mosty.map((m) => cenaNavrhu(m)));
      const nejlehci = Math.min(...mosty.map((m) => hmotnostNavrhu(m, uroven)));
      // Zlato je dosažitelné: šampion (most, který zkouškou projde, viz test šampionů) ho má.
      expect(zaklad!.sampion, `${uroven.id}: pusť npm run sampioni`).not.toBeNull();
      expect(stupenVyzvy("cena", zaklad!.sampion!.cena, prahy), uroven.id).toBe(3);
      expect(stupenVyzvy("hmotnost", zaklad!.sampion!.hmotnost, prahy), uroven.id).toBe(3);
      expect(zaklad!.sampion!.cena, uroven.id).toBeLessThanOrEqual(nejlevnejsi);
      expect(zaklad!.sampion!.hmotnost, uroven.id).toBeLessThanOrEqual(nejlehci);
      expect(stupenVyzvy("cena", nejlevnejsi, prahy), uroven.id).toBeGreaterThanOrEqual(2);
      expect(stupenVyzvy("hmotnost", nejlehci, prahy), uroven.id).toBeGreaterThanOrEqual(2);
      expect(stupenVyzvy("zlom", zaklad!.zlom, prahy), uroven.id).toBe(3);
      // Prahy jdou ostře po sobě i v číslech, která hráč vidí, a zlato je nejpřísnější.
      for (const druh of ["cena", "hmotnost"] as const) {
        const videt = prahy[druh].map((prah) => zobrazenaHodnota(druh, prah));
        expect(videt[0]!, `${uroven.id} ${druh}`).toBeGreaterThan(videt[1]!);
        expect(videt[1]!, `${uroven.id} ${druh}`).toBeGreaterThan(videt[2]!);
      }
      const videtZlom = prahy.zlom.map((prah) => zobrazenaHodnota("zlom", prah));
      expect(videtZlom[0]!, uroven.id).toBeLessThan(videtZlom[1]!);
      expect(videtZlom[1]!, uroven.id).toBeLessThan(videtZlom[2]!);
      // Nejlevnější referenční most se vejde do rozpočtu úrovně, jinak by výzva nešla hrát,
      // a bronz za cenu je pod rozpočtem: nedostane ho každý most, který projde.
      if (uroven.rozpocet !== null) {
        expect(nejlevnejsi, uroven.id).toBeLessThanOrEqual(uroven.rozpocet);
        expect(prahy.cena[0], uroven.id).toBeLessThan(uroven.rozpocet);
      }
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
        // Zlato výzvy je nejlepší ze tří referenčních mostů: měří se všechny, aby po úpravě
        // úrovně nezůstal v souboru most, který už nejlepší není.
        let nejlepsi: UlozenyZlom | null = null;
        for (const klic of KLICE_RESENI) {
          const naKorunu = zmerZlom(uroven, RESENI[uroven.id]![klic]);
          if (!nejlepsi || naKorunu > nejlepsi.naKorunu) nejlepsi = { reseni: klic, naKorunu };
        }
        const rada = `${uroven.id}: po změně úrovně nebo mostu pusť npm run vyzvy`;
        expect(nejlepsi!.naKorunu, rada).toBeCloseTo(ulozeny.naKorunu, 9);
        expect(nejlepsi!.reseni, rada).toBe(ulozeny.reseni);
        expect(ulozeny.naKorunu, uroven.id).toBeGreaterThan(0);
      }
    },
    600_000,
  );
});
