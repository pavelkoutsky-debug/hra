// Okno žebříčku úrovně: tři měřítka (nejlevnější, nejlehčí, únosnost na korunu), nejlepší řádky
// všech hráčů a zápis mostu, který hráč právě zkouškou prošel. Výsledek nezapisuje hra: pošle
// serveru most a otisk zkoušky a server si ho přepočítá sám (`src/server/zebricek.ts`).
import {
  MIRY_ZEBRICKU,
  NEJDELSI_PREZDIVKA,
  nactiOdpovedNaZapis,
  nactiZebricek,
  upravPrezdivku,
  znackaHrace,
  type KodOdmitnuti,
  type MiraZebricku,
  type MistoHrace,
  type ZadostOZapis,
  type ZebricekUrovne,
} from "../data/zebricek";
import { VERZE_FYZIKY } from "../jadro/verze";
import { prvek, udaj } from "../ui/dom";
import { celeCislo, datum } from "../ui/formaty";
import { jeKlicTextu, t } from "../ui/slovnik";
import type { Uloziste } from "./uloziste";
import { zapisVyzvy } from "./vyzvy";

/** Adresa žebříčků na serveru hry. */
const ADRESA = "/api/zebricek";
/** Jak dlouho se čeká na server, ms: zápis znamená zkoušku mostu na serveru. */
const CEKANI_NA_CTENI = 15_000;
const CEKANI_NA_ZAPIS = 75_000;

/** Most připravený k zápisu: kód a otisk zkoušky, kterou s ním hráč právě prošel. */
export interface MostKZapisu {
  kod: string;
  otisk: string;
}

export interface MoznostiZebricku {
  uroven: string;
  nazev: string;
  uloziste: Uloziste;
  /**
   * Co jde právě zapsat: most na výkresu, pokud s ním hráč v téhle návštěvě prošel běžnou
   * zkouškou bez porušení (cena a hmotnost), a zkouškou do zlomu, která se počítá (únosnost).
   */
  kZapisu: () => { bezna: MostKZapisu | null; zlom: MostKZapisu | null };
  /** Zápis do deníku hraní: jen kódy a čísla, nikdy přezdívka. */
  zapis: (data: Record<string, string | number | boolean>) => void;
}

async function zadost(adresa: string, cekani: number, telo?: unknown): Promise<{ stav: number; data: unknown } | null> {
  const prerus = new AbortController();
  const casovac = window.setTimeout(() => prerus.abort(), cekani);
  try {
    const odpoved = await fetch(adresa, {
      method: telo === undefined ? "GET" : "POST",
      signal: prerus.signal,
      ...(telo === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(telo) }),
    });
    let data: unknown = null;
    try {
      data = await odpoved.json();
    } catch {
      data = null;
    }
    return { stav: odpoved.status, data };
  } catch {
    return null;
  } finally {
    window.clearTimeout(casovac);
  }
}

/** Napojí okno `#okno-zebricek` a vrátí funkci, která ho otevře. */
export function pripojZebricek(m: MoznostiZebricku): { otevri(): void } {
  const okno = prvek("#okno-zebricek", HTMLDialogElement);
  const jmeno = prvek("#zebricek-jmeno", HTMLInputElement);
  const zapsat = prvek('[data-akce="zebricek-zapsat"]', HTMLButtonElement);
  const hlaseni = udaj("zebricek-hlaseni");
  const tabulky = udaj("zebricek-tabulky");
  jmeno.maxLength = NEJDELSI_PREZDIVKA;
  /** Poslední žebříček ze serveru a místa hráče z posledního zápisu. */
  let zebricek: ZebricekUrovne | null = null;
  let pracuje = false;

  function rekni(text: string, druh: "ok" | "varovani" = "ok"): void {
    hlaseni.dataset.druh = druh;
    hlaseni.textContent = text;
  }

  function vykresli(): void {
    const ja = m.uloziste.zebricek;
    const mojeZnacka = ja ? znackaHrace(ja.hrac) : null;
    const sloupce: HTMLElement[] = [];
    for (const mira of MIRY_ZEBRICKU) {
      const sloupec = document.createElement("section");
      sloupec.className = "zebricek__mira";
      sloupec.dataset.mira = mira;
      const nadpis = document.createElement("h3");
      nadpis.textContent = t(`zebricek.mira.${mira}`);
      sloupec.append(nadpis);
      const radky = zebricek?.miry[mira].radky ?? [];
      if (radky.length === 0) {
        const prazdno = document.createElement("p");
        prazdno.className = "okno__poznamka";
        prazdno.textContent = zebricek ? t("zebricek.prazdno") : "";
        sloupec.append(prazdno);
      } else {
        const seznam = document.createElement("ol");
        seznam.className = "zebricek__radky";
        for (const radek of radky) {
          const polozka = document.createElement("li");
          if (radek.znacka === mojeZnacka) polozka.dataset.ja = "ano";
          const kdo = document.createElement("span");
          kdo.className = "zebricek__jmeno";
          // Přezdívka je text od cizího hráče: jen jako text, nikdy jako značky.
          kdo.textContent = radek.jmeno;
          const kolik = document.createElement("span");
          kolik.className = "zebricek__hodnota";
          kolik.textContent = zapisVyzvy(mira, radek.hodnota);
          kolik.title = datum(new Date(`${radek.kdy}T12:00:00Z`));
          polozka.append(kdo, kolik);
          seznam.append(polozka);
        }
        sloupec.append(seznam);
        const hracu = zebricek?.miry[mira].hracu ?? 0;
        if (hracu > radky.length) {
          const dalsi = document.createElement("p");
          dalsi.className = "okno__poznamka";
          dalsi.textContent = t("zebricek.dalsi", { kolik: celeCislo(hracu - radky.length) });
          sloupec.append(dalsi);
        }
      }
      sloupce.push(sloupec);
    }
    tabulky.replaceChildren(...sloupce);
    okno.dataset.radku = String(MIRY_ZEBRICKU.reduce((n, mira) => n + (zebricek?.miry[mira].radky.length ?? 0), 0));
    const pripraveno = m.kZapisu();
    zapsat.setAttribute("aria-disabled", String(pracuje || (pripraveno.bezna === null && pripraveno.zlom === null)));
  }

  async function nacti(): Promise<void> {
    okno.dataset.stav = "nacita";
    rekni(t("zebricek.nacitam"));
    const odpoved = await zadost(`${ADRESA}?uroven=${encodeURIComponent(m.uroven)}`, CEKANI_NA_CTENI);
    const novy = odpoved?.stav === 200 ? nactiZebricek(odpoved.data) : null;
    if (!novy) {
      okno.dataset.stav = "nedostupny";
      rekni(t("zebricek.nedostupny"), "varovani");
      vykresli();
      return;
    }
    zebricek = novy;
    okno.dataset.stav = "nacten";
    const pripraveno = m.kZapisu();
    rekni(pripraveno.bezna || pripraveno.zlom ? t("zebricek.pripraveno") : t("zebricek.nicKZapisu"));
    vykresli();
  }

  /** Věta o tom, kde hráč po zápisu stojí. */
  function vetaOMiste(mira: MiraZebricku, misto: MistoHrace): string {
    const hodnoty = { mira: t(`zebricek.mira.${mira}`), poradi: misto.poradi === null ? "" : celeCislo(misto.poradi), hodnota: zapisVyzvy(mira, misto.nejlepsi) };
    if (misto.poradi === null) return t("zebricek.misto.mimo", hodnoty);
    return t(misto.zlepseni ? "zebricek.misto.zlepseni" : "zebricek.misto.beze.zmeny", hodnoty);
  }

  async function posli(): Promise<void> {
    if (pracuje) return;
    const pripraveno = m.kZapisu();
    if (pripraveno.bezna === null && pripraveno.zlom === null) {
      rekni(t("zebricek.nicKZapisu"), "varovani");
      return;
    }
    const prezdivka = upravPrezdivku(jmeno.value);
    if (prezdivka === null) {
      rekni(t("zebricek.bezJmena"), "varovani");
      jmeno.focus();
      return;
    }
    jmeno.value = prezdivka;
    const ja = m.uloziste.nastavPrezdivku(prezdivka);
    pracuje = true;
    okno.dataset.stav = "zapisuje";
    rekni(t("zebricek.overuji"));
    vykresli();
    const vety: string[] = [];
    let chyba: string | null = null;
    for (const [zkouska, most] of [["bezna", pripraveno.bezna], ["zlom", pripraveno.zlom]] as const) {
      if (most === null) continue;
      const telo: ZadostOZapis = { uroven: m.uroven, kod: most.kod, zkouska, otisk: most.otisk, verze: VERZE_FYZIKY, hrac: ja.hrac, jmeno: ja.jmeno };
      const odpoved = await zadost(ADRESA, CEKANI_NA_ZAPIS, telo);
      const prijato = odpoved?.stav === 200 ? nactiOdpovedNaZapis(odpoved.data) : null;
      if (prijato) {
        zebricek = prijato.zebricek;
        for (const mira of MIRY_ZEBRICKU) {
          const misto = prijato.moje[mira];
          if (misto) vety.push(vetaOMiste(mira, misto));
        }
        m.zapis({ co: "zapis", zkouska, stav: "ok", poradi: Math.min(...Object.values(prijato.moje).map((x) => x.poradi ?? 999)) });
        continue;
      }
      const kod = typeof odpoved?.data === "object" && odpoved.data !== null ? (odpoved.data as { kod?: unknown }).kod : undefined;
      const klic = `zebricek.odmitnuto.${typeof kod === "string" ? kod : ""}`;
      chyba = odpoved === null ? t("zebricek.nedostupny") : jeKlicTextu(klic) ? t(klic) : t("zebricek.odmitnuto.jine");
      m.zapis({ co: "zapis", zkouska, stav: odpoved === null ? "bez-odpovedi" : typeof kod === "string" ? (kod as KodOdmitnuti) : `http-${odpoved.stav}` });
      break;
    }
    pracuje = false;
    okno.dataset.stav = chyba === null ? "zapsano" : "odmitnuto";
    if (chyba !== null) rekni([...vety, chyba].join(" "), "varovani");
    else rekni(vety.join(" "));
    vykresli();
  }

  zapsat.addEventListener("click", () => void posli());
  jmeno.addEventListener("keydown", (udalost) => {
    if (udalost.key !== "Enter") return;
    udalost.preventDefault();
    void posli();
  });

  return {
    otevri(): void {
      udaj("zebricek-uroven").textContent = m.nazev;
      jmeno.value = m.uloziste.zebricek?.jmeno ?? "";
      zebricek = null;
      vykresli();
      if (!okno.open) okno.showModal();
      m.zapis({ co: "otevren" });
      void nacti();
    },
  };
}
