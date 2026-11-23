// Šampioni výzev: strojově zeštíhlené referenční mosty, podle kterých se měří zlato výzev
// o cenu a o hmotnost (`urovne/hubnuti.ts`, `urovne/sampioni.json`).
//
// Běžně test ověří, že každý uložený šampion projde zkouškou své úrovně bez porušeného prutu
// a není horší než most, ze kterého vznikl. S proměnnou MM_ZAPIS_SAMPIONU=1 (`npm run sampioni`)
// šampiony hledá znovu a zapíše; trvá to minuty. Hledání jde rozdělit mezi procesy:
// MM_CAST=1/4 až 4/4 zpracuje každou čtvrtou úroveň a zapíše `urovne/sampioni.cast-N.json`,
// MM_ZAPIS_SAMPIONU=sloz pak části vloží do `urovne/sampioni.json` a smaže je. MM_UROVNE=3-,4-03
// omezí hledání na úrovně, jejichž id tak začíná (po změně jedné kapitoly netřeba hledat všude);
// ostatní úrovně v souboru zůstanou, jak byly. Každý šampion nese otisk mostu, ze kterého
// vznikl: po změně referenčního mostu se jeho úpravy nepoužijí (zlato je pak most autora)
// a test řekne, že je čas hledat znovu. MM_ZAPIS_SAMPIONU=otisky otisky jen přepíše, a to
// šampionům, kteří s dnešním referenčním mostem stále obstojí.
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { zkontrolujNavrh, type NavrhMostu } from "../src/data/navrh";
import type { Uroven } from "../src/data/uroven";
import { VERZE_FYZIKY } from "../src/jadro/verze";
import { Zkouska } from "../src/zkouska/zkouska";
import { hodnotaMostu, otiskMostu, pouzijUpravy, svarMostovky, zestihli, type Meritko, type Uprava } from "../urovne/hubnuti";
import { nactiKampan, nasadaUrovne } from "../urovne/index";
import { RESENI } from "../urovne/reseni";
import { MERITKA_SAMPIONU, sampionUrovne, ULOZENI_SAMPIONI, vychoziMost, vychoziMosty, type UlozenySampion } from "../urovne/vyzvy";

const kampan = nactiKampan();

/** Projde most zkouškou úrovně, aniž by se na něm cokoli porušilo nebo trvale ohnulo, a stojí sám? */
function obstoji(uroven: Uroven, navrh: NavrhMostu): boolean {
  if (zkontrolujNavrh(navrh, uroven).length > 0) return false;
  let zkouska: Zkouska;
  try {
    zkouska = new Zkouska(uroven, navrh, nasadaUrovne(uroven));
  } catch {
    return false; // most, který se nedá ani postavit (třeba lano bez opory)
  }
  let pojistka = 0;
  while (!zkouska.hotovo) {
    zkouska.pokracuj(1);
    // První porušení nebo kmitání pod lidmi nad mezí úrovně rozhodlo; zbytek zkoušky netřeba počítat.
    if (zkouska.simulace.udalosti.length > 0 || zkouska.kmitaniNadMezi) return false;
    if (pojistka++ > 400) throw new Error("zkouška neskončila");
  }
  const vysledek = zkouska.vysledek();
  // Šampion je most, který by hra hráči pochválila: stojí sám (má klidovou polohu, nevisí na něm
  // volný prut) a nic se na něm neporušilo ani trvale neohnulo. První šampioni M12 takoví nebyli
  // všichni: čtyři neměli klidovou polohu a čtyři měli plastické klouby (kontrola obtížnosti).
  return vysledek.pruchod && vysledek.neporuseny && !vysledek.bezRovnovahy;
}

const soubor = (cast?: number): URL => new URL(cast ? `../urovne/sampioni.cast-${cast}.json` : "../urovne/sampioni.json", import.meta.url);

function zapis(kam: URL, urovne: Record<string, Record<Meritko, UlozenySampion>>): void {
  // Jedna úprava na řádek: rozdíl po dalším hledání pak jde přečíst.
  const radky = Object.entries(urovne).map(([id, sampioni]) => {
    const meritka = MERITKA_SAMPIONU.map((m) => {
      const s = sampioni[m];
      const upravy = s.upravy.map((u) => `          ${JSON.stringify(u)}`).join(",\n");
      return `      ${JSON.stringify(m)}: {\n        "z": ${JSON.stringify(s.z)},\n        "otisk": ${JSON.stringify(s.otisk)},\n        "upravy": [${upravy ? `\n${upravy}\n        ` : ""}]\n      }`;
    });
    return `    ${JSON.stringify(id)}: {\n${meritka.join(",\n")}\n    }`;
  });
  writeFileSync(kam, `{\n  "verzeFyziky": ${VERZE_FYZIKY},\n  "urovne": {\n${radky.join(",\n")}\n  }\n}\n`);
}

/**
 * Najde šampiona úrovně v měřítku: zeštíhlí každý most autora, na kterém se nic neporuší
 * (mosty pro medaile i další mosty pro výzvy), jednou tak, jak je, a jednou se svařenou
 * mostovkou (kde úroveň svary dovoluje), a vezme nejlepší výsledek.
 */
function najdi(uroven: Uroven, meritko: Meritko): UlozenySampion {
  let nejlepsi: (UlozenySampion & { hodnota: number }) | null = null;
  for (const { z, navrh: most } of vychoziMosty(uroven.id)) {
    const zacatky: Uprava[][] = [[]];
    const svary = svarMostovky(most);
    if (uroven.povoleneSvary && svary.length > 0) zacatky.push(svary);
    for (const uvod of zacatky) {
      const vychozi = pouzijUpravy(most, uvod);
      if (!obstoji(uroven, vychozi)) continue;
      const { upravy, navrh } = zestihli(
        uroven,
        vychozi,
        meritko,
        (zkus) => obstoji(uroven, zkus),
        (zkus) => zkontrolujNavrh(zkus, uroven).length === 0,
      );
      const hodnota = hodnotaMostu(navrh, uroven, meritko);
      if (!nejlepsi || hodnota < nejlepsi.hodnota - 1e-9) nejlepsi = { z, otisk: otiskMostu(most), upravy: [...uvod, ...upravy], hodnota };
    }
  }
  if (!nejlepsi) throw new Error(`${uroven.id}: žádný referenční most neprojde bez porušení`);
  return { z: nejlepsi.z, otisk: nejlepsi.otisk, upravy: nejlepsi.upravy };
}

describe("šampioni výzev", () => {
  it(
    "uložení šampioni projdou zkouškou bez porušení a nejsou horší než most, ze kterého vznikli",
    () => {
      const rezim = process.env.MM_ZAPIS_SAMPIONU;
      /** Uložení šampioni doplnění o nově nalezené, v pořadí kampaně. */
      const sNovymi = (nove: Record<string, Record<Meritko, UlozenySampion>>): Record<string, Record<Meritko, UlozenySampion>> => {
        const vsichni = { ...ULOZENI_SAMPIONI.urovne, ...nove };
        return Object.fromEntries(kampan.filter((u) => vsichni[u.id]).map((u) => [u.id, vsichni[u.id]!]));
      };
      if (rezim === "sloz") {
        const nove: Record<string, Record<Meritko, UlozenySampion>> = {};
        const casti: URL[] = [];
        for (let cast = 1; cast <= 64; cast++) {
          if (!existsSync(soubor(cast))) continue;
          Object.assign(nove, JSON.parse(readFileSync(soubor(cast), "utf8")).urovne);
          casti.push(soubor(cast));
        }
        expect(casti.length, "žádná část k vložení").toBeGreaterThan(0);
        zapis(soubor(), sNovymi(nove));
        for (const cast of casti) rmSync(cast);
        return;
      }
      if (rezim === "otisky") {
        // Referenční most se změnil jen zápisem (jiné pořadí prutů, komentář v kódu): úpravy
        // sedí dál, jen otisk ne. Znovu ho zapíše, ale jen šampionům, kteří stále obstojí.
        const nove: Record<string, Record<Meritko, UlozenySampion>> = {};
        for (const uroven of kampan) {
          const ulozeny = ULOZENI_SAMPIONI.urovne[uroven.id];
          if (!ulozeny) continue;
          const zaznam = {} as Record<Meritko, UlozenySampion>;
          for (const meritko of MERITKA_SAMPIONU) {
            const vychozi = vychoziMost(uroven.id, ulozeny[meritko].z)!;
            const sampion = pouzijUpravy(vychozi, ulozeny[meritko].upravy);
            expect(obstoji(uroven, sampion), `${uroven.id} ${meritko}: šampion neobstojí, pusť npm run sampioni`).toBe(true);
            expect(hodnotaMostu(sampion, uroven, meritko)).toBeLessThanOrEqual(hodnotaMostu(vychozi, uroven, meritko));
            zaznam[meritko] = { ...ulozeny[meritko], otisk: otiskMostu(vychozi) };
          }
          nove[uroven.id] = zaznam;
        }
        zapis(soubor(), nove);
        return;
      }
      if (rezim === "1") {
        const [cast, casti] = (process.env.MM_CAST ?? "1/1").split("/").map(Number) as [number, number];
        const jen = (process.env.MM_UROVNE ?? "").split(",").filter((x) => x !== "");
        const vybrane = kampan.filter((u) => jen.length === 0 || jen.some((zacatek) => u.id.startsWith(zacatek)));
        const nove: Record<string, Record<Meritko, UlozenySampion>> = {};
        vybrane.forEach((uroven, poradi) => {
          if (poradi % casti !== cast - 1) return;
          nove[uroven.id] = { cena: najdi(uroven, "cena"), hmotnost: najdi(uroven, "hmotnost") };
          // Zapisuje se průběžně: hledání je dlouhé a přerušené nemá přijít nazmar. Část nese
          // jen své úrovně; celý soubor se píše, jen když hledá jediný proces.
          if (casti > 1) zapis(soubor(cast), nove);
          else zapis(soubor(), sNovymi(nove));
        });
        return;
      }
      expect(ULOZENI_SAMPIONI.verzeFyziky, "po změně fyziky pusť npm run sampioni").toBe(VERZE_FYZIKY);
      expect(Object.keys(ULOZENI_SAMPIONI.urovne)).toEqual(kampan.map((u) => u.id));
      for (const uroven of kampan) {
        for (const meritko of MERITKA_SAMPIONU) {
          const ulozeny = ULOZENI_SAMPIONI.urovne[uroven.id]![meritko];
          const rada = `${uroven.id} ${meritko}: po změně úrovně nebo referenčního mostu pusť npm run sampioni`;
          const sampion = sampionUrovne(uroven.id, meritko);
          expect(sampion, rada).not.toBeNull();
          expect(obstoji(uroven, sampion!), rada).toBe(true);
          const vychozi = vychoziMost(uroven.id, ulozeny.z)!;
          expect(hodnotaMostu(sampion!, uroven, meritko), rada).toBeLessThanOrEqual(hodnotaMostu(vychozi, uroven, meritko));
        }
        // Další mosty pro výzvy mají důvod: obstojí a jsou levnější nebo lehčí než mosty pro medaile.
        const proMedaile = [RESENI[uroven.id]!.pruchod, RESENI[uroven.id]!.rozpocet, RESENI[uroven.id]!.mistrovska];
        for (const dalsi of RESENI[uroven.id]!.vyzvy ?? []) {
          expect(obstoji(uroven, dalsi.navrh), `${uroven.id} „${dalsi.nazev}“ neobstojí`).toBe(true);
          const lepsi = MERITKA_SAMPIONU.some((m) => proMedaile.every((most) => hodnotaMostu(dalsi.navrh, uroven, m) < hodnotaMostu(most, uroven, m)));
          expect(lepsi, `${uroven.id} „${dalsi.nazev}“ není levnější ani lehčí než mosty pro medaile`).toBe(true);
        }
      }
    },
    7_200_000,
  );
});

describe("zeštíhlení mostu", () => {
  const uroven = kampan.find((u) => u.id === "1-01")!;
  const most = RESENI["1-01"]!.pruchod;

  it("úpravy jmenují pruty a styčníky jejich id a původní návrh nemění", () => {
    const prut = most.pruty.find((p) => p.prvek !== "mostovka-drevo")!;
    const bez = pouzijUpravy(most, [{ prut: prut.id, pryc: true }]);
    expect(bez.pruty).toHaveLength(most.pruty.length - 1);
    expect(bez.pruty.some((p) => p.id === prut.id)).toBe(false);
    expect(most.pruty.some((p) => p.id === prut.id)).toBe(true);
    // Styčník, na kterém po odstranění prutu nic nezbylo, zmizí s ním.
    for (const s of bez.stycniky) expect(bez.pruty.some((p) => p.a === s.id || p.b === s.id)).toBe(true);
    expect(() => pouzijUpravy(most, [{ prut: 9999, pryc: true }])).toThrow(/prut 9999/);
    expect(() => pouzijUpravy(most, [{ stycnik: 9999, zavazi: 0 }])).toThrow(/styčník 9999/);
  });

  it("otisk mostu se změní s každou změnou prutu nebo styčníku a šampion z jiného mostu se nepoužije", () => {
    const jiny = { ...most, pruty: most.pruty.map((p, i) => (i === 0 ? { ...p, prvek: "drevo-lehke" as const } : p)) };
    const posunuty = { ...most, stycniky: most.stycniky.map((s, i) => (i === most.stycniky.length - 1 ? { ...s, y: s.y + 1 } : s)) };
    expect(otiskMostu(most)).toMatch(/^[0-9a-f]{8}$/);
    expect(otiskMostu({ ...most })).toBe(otiskMostu(most));
    expect(otiskMostu(jiny)).not.toBe(otiskMostu(most));
    expect(otiskMostu(posunuty)).not.toBe(otiskMostu(most));
    // Všichni uložení šampioni nesou otisk svého dnešního referenčního mostu.
    for (const [id, zaznam] of Object.entries(ULOZENI_SAMPIONI.urovne)) {
      for (const meritko of MERITKA_SAMPIONU) expect(zaznam[meritko].otisk, `${id} ${meritko}`).toBe(otiskMostu(vychoziMost(id, zaznam[meritko].z)!));
    }
  });

  it("ubírá, jen dokud most obstojí, a stejný vstup dá stejný výsledek", () => {
    const prvni = zestihli(uroven, most, "cena", (navrh) => obstoji(uroven, navrh));
    const druhy = zestihli(uroven, most, "cena", (navrh) => obstoji(uroven, navrh));
    expect(prvni.upravy).toEqual(druhy.upravy);
    expect(obstoji(uroven, prvni.navrh)).toBe(true);
    expect(hodnotaMostu(prvni.navrh, uroven, "cena")).toBeLessThanOrEqual(hodnotaMostu(most, uroven, "cena"));
    // Most, který neobstojí po žádné úpravě, zůstane, jak byl.
    const nic = zestihli(uroven, most, "cena", () => false);
    expect(nic.upravy).toEqual([]);
    expect(nic.navrh).toBe(most);
  }, 60_000);
});
