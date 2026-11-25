// Okno žebříčku úrovně: tři měřítka (nejlevnější, nejlehčí, únosnost na korunu), nejlepší řádky
// všech hráčů a zápis mostu, který hráč právě zkouškou prošel. Výsledek nezapisuje hra: pošle
// serveru most a otisk zkoušky a server si ho přepočítá sám (`src/server/zebricek.ts`).
import { zobrazenaHodnota } from "../data/vyzvy";
import {
  MIRY_ZEBRICKU,
  NEJDELSI_PREZDIVKA,
  nactiOdpovedNaZapis,
  nactiZebricek,
  upravPrezdivku,
  znackaHrace,
  type MiraZebricku,
  type MistoHrace,
  type ZadostOZapis,
  type ZebricekUrovne,
} from "../data/zebricek";
import { VERZE_FYZIKY } from "../jadro/verze";
import { nadpisSJednotkou, prvek, udaj } from "../ui/dom";
import { celeCislo, cislo, datum } from "../ui/formaty";
import { jeKlicTextu, t } from "../ui/slovnik";
import type { Uloziste } from "./uloziste";
import { zapisVyzvy } from "./vyzvy";

/** Adresa žebříčků na serveru hry. */
const ADRESA = "/api/zebricek";
/** Jak dlouho se čeká na server, ms: zápis znamená zkoušku mostu na serveru. */
const CEKANI_NA_CTENI = 15_000;
const CEKANI_NA_ZAPIS = 70_000;
/**
 * Zkouška velkého mostu trvá na serveru déle, než Netlify čeká na odpověď: spojení po 30 s ukončí
 * chybou 504, funkce ale běží dál a výsledek si zapamatuje. Hra proto zápis po takové chybě (a po
 * odpovědi „pocita“: server týž most právě ověřuje) zkouší znovu, po `ZKUSIT_ZNOVU_PO` ms, dokud
 * od první žádosti neuplyne `NEJDELSI_ZAPIS`. Musí to být míň, než kolik na serveru platí značka
 * běžící zkoušky (`OVERUJE_NEJDELE` v `src/server/zebricek.ts`).
 */
const ZKUSIT_ZNOVU_PO = 5_000;
const NEJDELSI_ZAPIS = 100_000;

/** Most připravený k zápisu: kód a otisk zkoušky, kterou s ním hráč právě prošel. */
export interface MostKZapisu {
  kod: string;
  otisk: string;
}

/**
 * Proč most na výkresu zapsat nejde: ještě neprošel zkouškou (nebo se od ní změnil), při
 * poslední zkoušce neprošel, prošel, ale něco se na něm porušilo, je to cizí most z odkazu,
 * nebo je na zápis příliš velký.
 */
export type DuvodBezZapisu = "nezkouseno" | "neprosel" | "poruseny" | "host" | "velky";

export interface MoznostiZebricku {
  uroven: string;
  nazev: string;
  uloziste: Uloziste;
  /**
   * Co jde právě zapsat: most na výkresu, pokud s ním hráč v téhle návštěvě prošel běžnou
   * zkouškou bez porušení (cena a hmotnost), a k tomu zkouškou do zlomu (únosnost). Když
   * nejde nic, `duvod` říká proč.
   */
  kZapisu: () => { bezna: MostKZapisu | null; zlom: MostKZapisu | null; duvod: DuvodBezZapisu | null };
  /** Zápis do deníku hraní: jen kódy a čísla, nikdy přezdívka. */
  zapis: (data: Record<string, string | number | boolean>) => void;
}

/** Kód z odpovědi serveru (`KodOdmitnuti`), nebo undefined, když odpověď žádný nenese. */
function kodOdpovedi(odpoved: { stav: number; data: unknown } | null): unknown {
  return typeof odpoved?.data === "object" && odpoved.data !== null ? (odpoved.data as { kod?: unknown }).kod : undefined;
}

/**
 * Počítá server most dál? Řekne to sám (kód `pocita`), nebo místo něj odpoví brána hostingu,
 * která na odpověď funkce přestala čekat (502 a 504 bez kódu hry).
 */
function serverPocita(odpoved: { stav: number; data: unknown } | null): boolean {
  if (odpoved === null) return false;
  const kod = kodOdpovedi(odpoved);
  return kod === "pocita" || ((odpoved.stav === 502 || odpoved.stav === 504) && typeof kod !== "string");
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

/** Hodnota v řádku žebříčku: únosnost jen číslem (jednotku nese nadpis sloupce), jinak jako u výzev. */
function hodnotaRadku(mira: MiraZebricku, hodnota: number): string {
  return mira === "zlom" ? cislo(zobrazenaHodnota(mira, hodnota), 1) : zapisVyzvy(mira, hodnota);
}

/** Napojí okno `#okno-zebricek` a vrátí funkci, která ho otevře. */
export function pripojZebricek(m: MoznostiZebricku): { otevri(): void } {
  const okno = prvek("#okno-zebricek", HTMLDialogElement);
  const jmeno = prvek("#zebricek-jmeno", HTMLInputElement);
  const zapsat = prvek('[data-akce="zebricek-zapsat"]', HTMLButtonElement);
  const hlaseni = udaj("zebricek-hlaseni");
  const tabulky = udaj("zebricek-tabulky");
  jmeno.maxLength = NEJDELSI_PREZDIVKA * 2;
  /** Poslední žebříček ze serveru; null, dokud se nenačetl nebo když server neodpověděl. */
  let zebricek: ZebricekUrovne | null = null;
  /** Běží zápis: okno jde zavřít a otevřít, výsledek se ale nesmí ztratit ani přepsat načítáním. */
  let pracuje = false;
  /** Číslo posledního načítání: odpověď na starší se zahodí. */
  let nacitani = 0;

  function rekni(text: string, druh: "ok" | "varovani" = "ok"): void {
    hlaseni.dataset.druh = druh;
    hlaseni.textContent = text;
  }

  function vykresli(): void {
    const ja = m.uloziste.zebricek;
    const mojeZnacka = ja ? znackaHrace(ja.hrac, m.uroven) : null;
    const sloupce: HTMLElement[] = [];
    for (const mira of MIRY_ZEBRICKU) {
      const sloupec = document.createElement("section");
      sloupec.className = "zebricek__mira";
      sloupec.dataset.mira = mira;
      const nadpis = document.createElement("h3");
      if (mira === "zlom") nadpisSJednotkou(nadpis, t("zebricek.sloupec.zlom"));
      else nadpis.textContent = t(`zebricek.mira.${mira}`);
      // Nadpis a tělo zvlášť: nadpisy tří sloupců sdílejí řádek mřížky, i když se jeden zalomí.
      const telo = document.createElement("div");
      telo.className = "zebricek__telo";
      sloupec.append(nadpis, telo);
      const radky = zebricek?.miry[mira].radky ?? [];
      if (radky.length === 0) {
        const prazdno = document.createElement("p");
        prazdno.className = "okno__poznamka";
        prazdno.textContent = zebricek ? t("zebricek.prazdno") : "";
        telo.append(prazdno);
      } else {
        const seznam = document.createElement("ol");
        seznam.className = "zebricek__radky";
        radky.forEach((radek, i) => {
          const polozka = document.createElement("li");
          if (radek.znacka === mojeZnacka) polozka.dataset.ja = "ano";
          const poradi = document.createElement("span");
          poradi.className = "zebricek__poradi";
          poradi.textContent = `${i + 1}.`;
          const kdo = document.createElement("span");
          kdo.className = "zebricek__jmeno";
          // Přezdívka je text od cizího hráče: jen jako text, nikdy jako značky.
          kdo.textContent = radek.jmeno;
          kdo.title = radek.jmeno;
          const kolik = document.createElement("span");
          kolik.className = "zebricek__hodnota";
          kolik.textContent = hodnotaRadku(mira, radek.hodnota);
          kolik.title = `${zapisVyzvy(mira, radek.hodnota)} · ${datum(new Date(`${radek.kdy}T12:00:00Z`))}`;
          polozka.append(poradi, kdo, kolik);
          seznam.append(polozka);
        });
        telo.append(seznam);
        const hracu = zebricek?.miry[mira].hracu ?? 0;
        if (hracu > radky.length) {
          const dalsi = document.createElement("p");
          dalsi.className = "okno__poznamka";
          dalsi.textContent = t("zebricek.dalsi", { kolik: celeCislo(hracu - radky.length) });
          telo.append(dalsi);
        }
      }
      sloupce.push(sloupec);
    }
    tabulky.replaceChildren(...sloupce);
    okno.dataset.radku = String(MIRY_ZEBRICKU.reduce((n, mira) => n + (zebricek?.miry[mira].radky.length ?? 0), 0));
    const pripraveno = m.kZapisu();
    // Bez žebříčku ze serveru (neodpovídá) zapisovat nejde; jinak rozhoduje most na výkresu.
    zapsat.setAttribute("aria-disabled", String(pracuje || zebricek === null || pripraveno.bezna === null));
  }

  /** Co oknu říct o mostě na výkresu, když zrovna nic jiného neohlašuje. */
  function vetaOMoste(): { text: string; druh: "ok" | "varovani" } {
    const pripraveno = m.kZapisu();
    if (pripraveno.bezna) return { text: t(pripraveno.zlom ? "zebricek.pripraveno.zlom" : "zebricek.pripraveno"), druh: "ok" };
    return { text: t(`zebricek.nejde.${pripraveno.duvod ?? "nezkouseno"}`), druh: "ok" };
  }

  async function nacti(): Promise<void> {
    const moje = ++nacitani;
    okno.dataset.stav = "nacita";
    rekni(t("zebricek.nacitam"));
    const odpoved = await zadost(`${ADRESA}?uroven=${encodeURIComponent(m.uroven)}`, CEKANI_NA_CTENI);
    // Mezitím začal zápis nebo novější načítání: tahle odpověď už nic nepřepisuje.
    if (moje !== nacitani || pracuje) return;
    const novy = odpoved?.stav === 200 ? nactiZebricek(odpoved.data) : null;
    if (!novy) {
      zebricek = null;
      okno.dataset.stav = "nedostupny";
      rekni(t("zebricek.nedostupny"), "varovani");
      vykresli();
      return;
    }
    zebricek = novy;
    okno.dataset.stav = "nacten";
    const veta = vetaOMoste();
    rekni(veta.text, veta.druh);
    vykresli();
  }

  /** Věta o tom, kde hráč po zápisu stojí. */
  function vetaOMiste(mira: MiraZebricku, misto: MistoHrace): string {
    const hodnoty = { mira: t(`zebricek.mira.${mira}`), poradi: misto.poradi === null ? "" : celeCislo(misto.poradi), hodnota: zapisVyzvy(mira, misto.nejlepsi) };
    if (misto.obsazeno) return t("zebricek.misto.obsazeno", hodnoty);
    if (misto.poradi === null) return t("zebricek.misto.mimo", hodnoty);
    if (misto.zlepseni) return t("zebricek.misto.zlepseni", hodnoty);
    // Stejná hodnota, jakou už hráč zapsanou má, není „horší most“.
    const shoda = zobrazenaHodnota(mira, misto.hodnota) === zobrazenaHodnota(mira, misto.nejlepsi);
    return t(shoda ? "zebricek.misto.shoda" : "zebricek.misto.beze.zmeny", hodnoty);
  }

  async function posli(): Promise<void> {
    if (pracuje) return;
    if (zebricek === null) {
      rekni(t("zebricek.nedostupny"), "varovani");
      return;
    }
    const pripraveno = m.kZapisu();
    if (pripraveno.bezna === null) {
      rekni(t(`zebricek.nejde.${pripraveno.duvod ?? "nezkouseno"}`), "varovani");
      return;
    }
    const prezdivka = upravPrezdivku(jmeno.value);
    if (prezdivka === null) {
      rekni(t("zebricek.bezJmena"), "varovani");
      jmeno.focus();
      return;
    }
    // Co z přezdívky zbylo po vyčištění, to hráč uvidí: v poli i ve větě o zápisu.
    const upravena = prezdivka !== jmeno.value.trim();
    jmeno.value = prezdivka;
    const ja = m.uloziste.nastavPrezdivku(prezdivka);
    pracuje = true;
    nacitani += 1;
    okno.dataset.stav = "zapisuje";
    rekni(t("zebricek.overuji"));
    vykresli();
    const vety: string[] = upravena ? [t("zebricek.jmeno.upraveno", { jmeno: prezdivka })] : [];
    let chyba: string | null = null;
    // Nejdřív běžná zkouška (cena a hmotnost), potom zlom: server zlom bez ověřené běžné nepustí.
    for (const [zkouska, most] of [["bezna", pripraveno.bezna], ["zlom", pripraveno.zlom]] as const) {
      if (most === null) continue;
      const telo: ZadostOZapis = { uroven: m.uroven, kod: most.kod, zkouska, otisk: most.otisk, verze: VERZE_FYZIKY, hrac: ja.hrac, jmeno: ja.jmeno };
      const od = performance.now();
      let odpoved = await zadost(ADRESA, CEKANI_NA_ZAPIS, telo);
      while (serverPocita(odpoved) && performance.now() - od < NEJDELSI_ZAPIS) {
        okno.dataset.pocita = "ano";
        rekni(t("zebricek.pocita"));
        await new Promise((hotovo) => window.setTimeout(hotovo, ZKUSIT_ZNOVU_PO));
        odpoved = await zadost(ADRESA, CEKANI_NA_ZAPIS, telo);
      }
      const prijato = odpoved?.stav === 200 ? nactiOdpovedNaZapis(odpoved.data) : null;
      if (prijato) {
        zebricek = prijato.zebricek;
        for (const mira of MIRY_ZEBRICKU) {
          const misto = prijato.moje[mira];
          if (misto) vety.push(vetaOMiste(mira, misto));
        }
        m.zapis({ co: "zapis", zkouska, stav: "ok", poradi: Math.min(999, ...Object.values(prijato.moje).map((x) => x.poradi ?? 999)) });
        continue;
      }
      // Brána, která to vzdala i napodruhé, znamená totéž co „pocita“: server most nestihl.
      const kod = serverPocita(odpoved) ? "pocita" : kodOdpovedi(odpoved);
      const klic = `zebricek.odmitnuto.${typeof kod === "string" ? kod : ""}`;
      // Server neodpověděl včas: zápis se mohl i nemusel povést, a hráč to má vědět.
      chyba = odpoved === null ? t("zebricek.bezOdpovedi") : jeKlicTextu(klic) ? t(klic) : t("zebricek.odmitnuto.jine");
      m.zapis({ co: "zapis", zkouska, stav: odpoved === null ? "bez-odpovedi" : typeof kod === "string" && /^[a-z-]{1,12}$/.test(kod) ? kod : `http-${odpoved.stav}` });
      break;
    }
    pracuje = false;
    delete okno.dataset.pocita;
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
      if (!okno.open) okno.showModal();
      m.zapis({ co: "otevren" });
      // Otevření během zápisu nic nenačítá ani nemaže: okno ukáže, jak zápis dopadl (nebo že běží).
      if (pracuje) return;
      jmeno.value = m.uloziste.zebricek?.jmeno ?? "";
      zebricek = null;
      vykresli();
      void nacti();
    },
  };
}
