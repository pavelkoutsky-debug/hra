// Nápověda k úrovni: most autora hry po třech krocích. Nejdřív princip (věta a skica, čím
// most nese), pak materiál (soupis prvků a cena) a nakonec obrys na výkresu. Co který prut
// v obrysu je, už hráč musí vymyslet sám. Zvlášť je nápověda k medailím: most pro medaili
// za rozpočet a most pro mistrovskou, až když hráč úrovní jednou projde.
//
// Všechno, co nápověda o mostě tvrdí, se počítá z něj: věta o principu z jeho rysů
// (`src/data/rysy.ts`), soupis a cena z návrhu. Ručně psané rady tu nejsou.

import type { NavrhMostu } from "../data/navrh";
import { principMostu, rysyMostu, type RysyMostu } from "../data/rysy";
import { soupisMostu } from "../data/soupis";
import type { Uroven } from "../data/uroven";
import { prvek, udaj } from "../ui/dom";
import { celeCislo, cislo, koruny } from "../ui/formaty";
import { t, type KlicTextu } from "../ui/slovnik";
import { nakresliSkicu } from "../vykres/skica";
import { podminkaMistrovske } from "./medaile";

/** Ke kterému mostu autora nápověda patří: k tomu, který projde, nebo k některé medaili. */
export type MostNapovedy = "pruchod" | "rozpocet" | "mistrovska";
export const MOSTY_NAPOVEDY: readonly MostNapovedy[] = ["pruchod", "rozpocet", "mistrovska"];

/** Krok nápovědy: 1 princip, 2 materiál, 3 obrys na výkresu. */
export type KrokNapovedy = 1 | 2 | 3;

export interface MoznostiNapovedy {
  /** Obrys na výkresu se změnil (ukázal, schoval, patří jinému mostu): překreslit. */
  zmenaObrysu: () => void;
  /** Hráč došel v nápovědě k dalšímu kroku. */
  pouzita: (krok: KrokNapovedy, most: MostNapovedy) => void;
  /** Má hráč úroveň projitou? Nápověda k medailím je až potom. */
  projito: () => boolean;
}

export interface Napoveda {
  otevri(): void;
  /** Most, jehož obrys je právě vidět na výkresu; null, když žádný. */
  readonly obrys: NavrhMostu | null;
}

/** Soupis mostu jako řádky seznamu. */
function radkySoupisu(navrh: NavrhMostu): string[] {
  const soupis = soupisMostu(navrh);
  const radky = soupis.prvky.map((r) =>
    t("napoveda.prvek", { prvek: t(`prvek.${r.prvek}`), prutu: r.prutu, metru: cislo(r.metru, r.metru % 1 === 0 ? 0 : 1) }),
  );
  // Zdvih pístu, hmotnost závaží a ladění tlumiče se z obrysu vyčíst nedají: patří do soupisu.
  if (soupis.zdvihy.length > 0) {
    radky.push(t("napoveda.zdvih", { zdvihy: soupis.zdvihy.map((z) => `${z > 0 ? "+" : z < 0 ? "−" : ""}${cislo(Math.abs(z), 1)} m`).join(", ") }));
  }
  if (soupis.svaru > 0) radky.push(t("napoveda.svaru", { pocet: soupis.svaru }));
  if (soupis.zamku > 0) radky.push(t("napoveda.zamku", { pocet: soupis.zamku }));
  if (soupis.napinaku > 0) radky.push(t("napoveda.napinaku", { pocet: soupis.napinaku }));
  if (soupis.zavazi > 0) {
    const hmoty = soupis.zavaziPodleHmoty.map((r) => `${r.pocet}× ${celeCislo(r.kg)} kg`).join(", ");
    radky.push(t("napoveda.zavazi", { pocet: soupis.zavazi, hmoty }));
  }
  if (soupis.tlumicu > 0) {
    const ladeni = soupis.tlumicePodleNastaveni
      .map((r) => t("napoveda.tlumic", { pocet: r.pocet, kg: celeCislo(r.kg), hz: cislo(r.hz, 2) }))
      .join(", ");
    radky.push(t("napoveda.tlumicu", { pocet: soupis.tlumicu, ladeni }));
  }
  return radky;
}

/** Věta o principu mostu složená z jeho rysů. */
export function vetaOPrincipu(rysy: RysyMostu): string {
  return principMostu(rysy)
    .map((klic) => t(`napoveda.princip.${klic}` as KlicTextu))
    .join(" ");
}

/**
 * Napojí okno `#okno-napoveda` na mosty autora hry pro úroveň `uroven`: ten, který projde,
 * a mosty pro obě medaile.
 */
export function pripojNapovedu(reseni: Readonly<Record<MostNapovedy, NavrhMostu>>, uroven: Uroven, moznosti: MoznostiNapovedy): Napoveda {
  const okno = prvek("#okno-napoveda", HTMLDialogElement);
  const seznam = udaj("napoveda-soupis");
  const tlacitkoObrysu = prvek('[data-akce="napoveda-obrys"]', HTMLButtonElement);
  const tlacitkoDalsi = prvek('[data-akce="napoveda-dalsi"]', HTMLButtonElement);
  const skica = prvek('[data-udaj="napoveda-skica"]', HTMLCanvasElement);
  const mosty = udaj("napoveda-mosty");

  /** Které mosty úroveň má: medaile za rozpočet a mistrovská nejsou všude. */
  const dostupne = MOSTY_NAPOVEDY.filter(
    (m) => m === "pruchod" || (m === "rozpocet" ? uroven.inzenyrskyRozpocet !== null : uroven.mistrovska !== null),
  );
  let vybrany: MostNapovedy = "pruchod";
  /** Ke kterému kroku hráč u kterého mostu došel. */
  const kroky: Record<MostNapovedy, KrokNapovedy> = { pruchod: 1, rozpocet: 1, mistrovska: 1 };
  /** Most, jehož obrys je na výkresu. */
  let obrys: MostNapovedy | null = null;

  /** Krok, který hráč u vybraného mostu právě vidí; třetí se počítá, až když si obrys nechá ukázat. */
  const videnyKrok = (): KrokNapovedy => (obrys === vybrany ? 3 : kroky[vybrany] === 1 ? 1 : 2);

  const tlacitkaMostu = new Map<MostNapovedy, HTMLButtonElement>();
  for (const most of dostupne) {
    const tlacitko = document.createElement("button");
    tlacitko.type = "button";
    tlacitko.className = "tlacitko";
    tlacitko.dataset.most = most;
    tlacitko.textContent = t(`napoveda.most.${most}`);
    tlacitko.addEventListener("click", () => {
      if (most !== "pruchod" && !moznosti.projito()) return;
      vybrany = most;
      moznosti.pouzita(videnyKrok(), most);
      obnov();
    });
    tlacitkaMostu.set(most, tlacitko);
  }
  mosty.replaceChildren(...tlacitkaMostu.values());
  // Jediný most (pískoviště medaile nemá): není z čeho vybírat.
  mosty.hidden = dostupne.length < 2;

  /** Co most z nápovědy stojí a co s ním hráč získá: počítá se z něj. */
  const vetaOCene = (most: MostNapovedy): string => {
    const cena = soupisMostu(reseni[most]).cena;
    const limit = uroven.inzenyrskyRozpocet;
    if (most === "rozpocet" && limit !== null) return t("napoveda.cena.rozpocet", { cena: koruny(cena), limit: koruny(limit) });
    if (most === "mistrovska") return t("napoveda.cena.mistrovska", { cena: koruny(cena), podminka: podminkaMistrovske(uroven) ?? "" });
    if (limit === null) return t("napoveda.cena", { cena: koruny(cena) });
    return t(cena <= limit ? "napoveda.cena.vejdeSe" : "napoveda.cena.draha", { cena: koruny(cena), limit: koruny(limit) });
  };

  const nakresli = (): void => {
    const hustota = window.devicePixelRatio || 1;
    const rozmer = skica.getBoundingClientRect();
    if (rozmer.width < 2 || rozmer.height < 2) return;
    skica.width = Math.round(rozmer.width * hustota);
    skica.height = Math.round(rozmer.height * hustota);
    const ctx = skica.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(hustota, 0, 0, hustota, 0, 0);
    nakresliSkicu(ctx, rozmer.width, rozmer.height, rysyMostu(reseni[vybrany], uroven));
  };

  const obnov = (): void => {
    const projito = moznosti.projito();
    for (const [most, tlacitko] of tlacitkaMostu) {
      tlacitko.setAttribute("aria-pressed", String(most === vybrany));
      tlacitko.setAttribute("aria-disabled", String(most !== "pruchod" && !projito));
    }
    // Zamčená nápověda k medailím nesmí být zašedlá bez vysvětlení.
    udaj("napoveda-zamceno").hidden = projito || dostupne.length < 2;
    const krok = kroky[vybrany];
    const rysy = rysyMostu(reseni[vybrany], uroven);
    udaj("napoveda-uvod").textContent = t(`napoveda.uvod.${vybrany}`);
    // Most pro medaili často nese stejně jako ten pro průchod: řekne se to, ať hráč nehledá rozdíl ve větě.
    const stejny = vybrany !== "pruchod" && principMostu(rysy).join("|") === principMostu(rysyMostu(reseni.pruchod, uroven)).join("|");
    udaj("napoveda-princip").textContent = stejny ? `${vetaOPrincipu(rysy)} ${t("napoveda.princip.stejny")}` : vetaOPrincipu(rysy);
    okno.dataset.soustava = rysy.soustava;
    for (const cast of okno.querySelectorAll<HTMLElement>("[data-krok]")) cast.hidden = Number(cast.dataset.krok) > krok;
    if (krok >= 2) {
      seznam.replaceChildren(
        ...radkySoupisu(reseni[vybrany]).map((text) => {
          const uzel = document.createElement("li");
          uzel.textContent = text;
          return uzel;
        }),
      );
      udaj("napoveda-cena").textContent = vetaOCene(vybrany);
    }
    tlacitkoDalsi.hidden = krok >= 3;
    tlacitkoDalsi.textContent = t(krok === 1 ? "napoveda.dalsi.material" : "napoveda.dalsi.obrys");
    tlacitkoObrysu.hidden = krok < 3;
    const videt = obrys === vybrany;
    tlacitkoObrysu.textContent = t(videt ? "napoveda.obrys.schovat" : "napoveda.obrys.ukazat");
    tlacitkoObrysu.setAttribute("aria-pressed", String(videt));
    document.body.dataset.napoveda = obrys !== null ? "obrys" : krok === 1 ? "princip" : krok === 2 ? "material" : "obrys-nabidka";
    document.body.dataset.napovedaMost = obrys ?? vybrany;
    if (okno.open) nakresli();
  };

  tlacitkoDalsi.addEventListener("click", () => {
    const krok = kroky[vybrany];
    if (krok >= 3) return;
    kroky[vybrany] = (krok + 1) as KrokNapovedy;
    // Třetí krok se počítá, až když si hráč obrys opravdu nechá ukázat.
    if (kroky[vybrany] === 2) moznosti.pouzita(2, vybrany);
    obnov();
  });

  tlacitkoObrysu.addEventListener("click", () => {
    const ukazat = obrys !== vybrany;
    obrys = ukazat ? vybrany : null;
    if (ukazat) moznosti.pouzita(3, vybrany);
    moznosti.zmenaObrysu();
    obnov();
    // S obrysem se má stavět: okno uhne, ať je výkres vidět.
    if (ukazat) okno.close();
  });

  return {
    otevri(): void {
      // Kdo má obrys na výkresu, otevírá nápovědu u jeho mostu.
      if (obrys !== null) vybrany = obrys;
      moznosti.pouzita(videnyKrok(), vybrany);
      okno.showModal();
      obnov();
    },
    get obrys(): NavrhMostu | null {
      return obrys === null ? null : reseni[obrys];
    },
  };
}
