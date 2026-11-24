// Okno dílny: uložené práce z pískoviště (údolí s provozem a most) s náhledy. Práci jde uložit
// pod jménem, otevřít na stůl, smazat a poslat dál odkazem na scénář. Samo nic nepočítá:
// pravidla seznamu jsou v `src/data/dilna.ts`, paměť v `Uloziste`.

import { cenaNavrhu } from "../data/cena";
import {
  jeStejnaPrace,
  NEJVIC_PRACI,
  odkazNaScenar,
  smazPraci,
  ulozPraci,
  volnyNazevPrace,
  type PraceDilny,
} from "../data/dilna";
import type { NavrhMostu } from "../data/navrh";
import { urovenSandboxu, type NastaveniSandboxu } from "../data/sandbox";
import { NEJDELSI_KOD_MOSTU, rozkodujMost, zakodujMost } from "../data/sdileni";
import { prvek, udaj } from "../ui/dom";
import { celeCislo, datum, koruny } from "../ui/formaty";
import { t } from "../ui/slovnik";
import { nakresliNahledMostu } from "../vykres/list";
import type { Uloziste } from "./uloziste";

const SIRKA_NAHLEDU = 200;
const VYSKA_NAHLEDU = 116;

export interface MoznostiDilny {
  uloziste: Uloziste;
  /** Údolí a most, které má hráč právě na stole. */
  nastaveni: () => NastaveniSandboxu;
  navrh: () => NavrhMostu;
  /**
   * Hráč je na návštěvě ve scénáři z odkazu: na stole je cizí most, na který se okno neptá.
   * Jeho vlastní pískoviště je uložené stranou a před přepsáním ho hlídá `otevri`.
   */
  naNavsteve: () => boolean;
  /**
   * Položí práci na stůl (uloží nastavení i most jako pískoviště hráče a načte ho znovu). Vrací
   * false, když to odmítlo: hráč je na návštěvě a jeho vlastní rozestavěný most se nepodařilo
   * uložit do dílny (plná dílna nebo paměť prohlížeče), takže se nic nepřepsalo.
   */
  otevri: (prace: PraceDilny) => boolean;
  /** Zápis do deníku hraní: jen kódy a čísla, nikdy jméno práce. */
  zapis: (data: Record<string, string | number | boolean>) => void;
}

/** Kód mostu, nebo null, když most nejde zapsat (příliš velký). */
function kodMostu(navrh: NavrhMostu): string | null {
  try {
    const kod = zakodujMost(navrh);
    return kod.length <= NEJDELSI_KOD_MOSTU ? kod : null;
  } catch {
    return null;
  }
}

/** Druhý řádek karty: co přes údolí vede, jak je široké, co most stojí a kdy byl uložen. */
function popisPrace(prace: PraceDilny, navrh: NavrhMostu): string {
  return t(prace.nastaveni.zvedani ? "dilna.karta.popis.zvedaci" : "dilna.karta.popis", {
    druh: t(`sandbox.druh.${prace.nastaveni.druh}`),
    rozpeti: celeCislo(prace.nastaveni.rozpeti),
    cena: koruny(cenaNavrhu(navrh)),
    kdy: datum(new Date(prace.ulozeno)),
  });
}

/** Napojí okno `#okno-dilna` a vrátí funkci, která ho otevře. */
export function pripojDilnu(m: MoznostiDilny): { otevri(): void } {
  const okno = prvek("#okno-dilna", HTMLDialogElement);
  const nazev = prvek("#dilna-nazev", HTMLInputElement);
  const odkaz = prvek("#dilna-odkaz", HTMLInputElement);
  const seznam = udaj("dilna-prace");
  const hlaseni = udaj("dilna-hlaseni");
  const ulozit = prvek('[data-akce="dilna-ulozit"]', HTMLButtonElement);
  const kopirovat = prvek('[data-akce="dilna-kopirovat"]', HTMLButtonElement);
  /** Práce, u které hráč jedním kliknutím dostal varování a druhým ho potvrzuje. */
  let potvrzuje: { nazev: string; co: "otevrit" | "smazat" } | null = null;

  function rekni(text: string, druh: "ok" | "varovani" = "ok"): void {
    hlaseni.dataset.druh = druh;
    hlaseni.textContent = text;
  }

  /** Adresa hry bez dotazu: z ní se skládá odkaz na scénář. */
  const zaklad = (): string => window.location.origin + window.location.pathname;

  async function zkopiruj(text: string, hotovo: string): Promise<void> {
    odkaz.value = text;
    okno.dataset.zkopirovano = "ne";
    try {
      await navigator.clipboard.writeText(text);
      okno.dataset.zkopirovano = "ano";
      rekni(hotovo);
    } catch {
      // Schránka není k dispozici (starý prohlížeč, nezabezpečená stránka): odkaz je v poli označený.
      odkaz.focus();
      odkaz.select();
      rekni(t("dilna.odkaz.rucne"));
    }
  }

  /** Je to, co má hráč na stole, v dílně uložené? Prázdný stůl není co ztratit. */
  function stulJeUlozeny(): boolean {
    const navrh = m.navrh();
    if (navrh.pruty.length === 0 || m.naNavsteve()) return true;
    const kod = kodMostu(navrh);
    return kod !== null && m.uloziste.dilna.prace.some((p) => jeStejnaPrace(p, m.nastaveni(), kod));
  }

  function karta(prace: PraceDilny): HTMLLIElement {
    const polozka = document.createElement("li");
    polozka.className = "dilna__karta";
    polozka.dataset.prace = prace.nazev;
    const navrh = rozkodujMost(prace.kod);

    const nahled = document.createElement("canvas");
    nahled.className = "dilna__nahled";
    nahled.setAttribute("aria-hidden", "true");
    const hustota = window.devicePixelRatio || 1;
    nahled.width = Math.round(SIRKA_NAHLEDU * hustota);
    nahled.height = Math.round(VYSKA_NAHLEDU * hustota);
    const ctx = nahled.getContext("2d", { alpha: false });
    if (ctx) {
      ctx.setTransform(hustota, 0, 0, hustota, 0, 0);
      nakresliNahledMostu(ctx, urovenSandboxu(prace.nastaveni), navrh, SIRKA_NAHLEDU, VYSKA_NAHLEDU);
    }

    const texty = document.createElement("div");
    texty.className = "dilna__texty";
    const jmeno = document.createElement("strong");
    jmeno.className = "dilna__jmeno";
    jmeno.textContent = prace.nazev;
    const popis = document.createElement("span");
    popis.className = "dilna__popis";
    popis.textContent = popisPrace(prace, navrh);
    const tlacitka = document.createElement("div");
    tlacitka.className = "dilna__tlacitka";
    const tlacitko = (akce: string, text: string, obsluha: () => void): HTMLButtonElement => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "tlacitko";
      b.dataset.akce = akce;
      b.textContent = text;
      b.addEventListener("click", obsluha);
      return b;
    };
    const otevrit = tlacitko("dilna-otevrit", t("dilna.otevrit"), () => {
      const ceka = potvrzuje?.nazev === prace.nazev && potvrzuje.co === "otevrit";
      if (!ceka && !stulJeUlozeny()) {
        // Otevření položí práci na stůl místo rozestavěného mostu: ten by zmizel bez stopy.
        potvrzuje = { nazev: prace.nazev, co: "otevrit" };
        otevrit.textContent = t("dilna.otevrit.zahodit");
        rekni(t("dilna.otevrit.varovani"), "varovani");
        return;
      }
      m.zapis({ co: "otevrit", praci: m.uloziste.dilna.prace.length, prutu: navrh.pruty.length });
      if (!m.otevri(prace)) {
        // Vlastní most hráče se nevešel do dílny: nic se nepřepsalo a okno řekne proč.
        obnov();
        rekni(t("dilna.host.neniKam"), "varovani");
        return;
      }
      okno.close();
    });
    const poslat = tlacitko("dilna-odkaz-prace", t("dilna.karta.odkaz"), () => {
      m.zapis({ co: "odkaz", prutu: navrh.pruty.length, ze: "prace" });
      void zkopiruj(odkazNaScenar(zaklad(), prace.nastaveni, prace.kod), t("dilna.odkaz.zkopirovan.prace", { nazev: prace.nazev }));
    });
    const smazat = tlacitko("dilna-smazat", t("dilna.smazat"), () => {
      const ceka = potvrzuje?.nazev === prace.nazev && potvrzuje.co === "smazat";
      if (!ceka) {
        potvrzuje = { nazev: prace.nazev, co: "smazat" };
        smazat.textContent = t("dilna.smazat.opravdu");
        rekni(t("dilna.smazat.varovani", { nazev: prace.nazev }), "varovani");
        return;
      }
      m.uloziste.dilna = smazPraci(m.uloziste.dilna, prace.nazev);
      m.zapis({ co: "smazat", praci: m.uloziste.dilna.prace.length });
      obnov();
      rekni(t("dilna.smazano", { nazev: prace.nazev }));
    });
    tlacitka.append(otevrit, poslat, smazat);
    texty.append(jmeno, popis, tlacitka);
    polozka.append(nahled, texty);
    return polozka;
  }

  /** Překreslí seznam prací, počet a odkaz na to, co je na stole. */
  function obnov(): void {
    potvrzuje = null;
    const dilna = m.uloziste.dilna;
    seznam.replaceChildren(...dilna.prace.map(karta));
    udaj("dilna-pocet").textContent = t("dilna.pocet", { kolik: celeCislo(dilna.prace.length), nejvic: celeCislo(NEJVIC_PRACI) });
    udaj("dilna-prazdno").hidden = dilna.prace.length > 0;
    okno.dataset.praci = String(dilna.prace.length);
    const navrh = m.navrh();
    const kod = navrh.pruty.length > 0 ? kodMostu(navrh) : null;
    odkaz.value = kod === null ? "" : odkazNaScenar(zaklad(), m.nastaveni(), kod);
    odkaz.placeholder = t(navrh.pruty.length === 0 ? "dilna.odkaz.bezMostu" : "dilna.odkaz.velky");
    kopirovat.setAttribute("aria-disabled", String(kod === null));
    ulozit.setAttribute("aria-disabled", String(navrh.pruty.length === 0));
  }

  ulozit.addEventListener("click", () => {
    const navrh = m.navrh();
    if (navrh.pruty.length === 0) {
      rekni(t("dilna.ulozit.bezMostu"), "varovani");
      return;
    }
    const vysledek = ulozPraci(m.uloziste.dilna, nazev.value, m.nastaveni(), navrh, Date.now());
    if (vysledek.stav === "bez-jmena") rekni(t("dilna.ulozit.bezJmena"), "varovani");
    else if (vysledek.stav === "velky") rekni(t("dilna.ulozit.velky"), "varovani");
    else if (vysledek.stav === "plno") rekni(t("dilna.ulozit.plno", { nejvic: celeCislo(NEJVIC_PRACI) }), "varovani");
    else {
      m.uloziste.dilna = vysledek.dilna;
      // Plná nebo zakázaná paměť prohlížeče zápis potichu zahodí: hráč se to má dozvědět.
      const zapsano = m.uloziste.dilna.prace.some((p) => p.nazev === vysledek.dilna.prace[0]!.nazev && p.ulozeno === vysledek.dilna.prace[0]!.ulozeno);
      m.zapis({ co: vysledek.stav === "prepsano" ? "prepsat" : "ulozit", praci: vysledek.dilna.prace.length, prutu: navrh.pruty.length, zapsano });
      const ulozene = vysledek.dilna.prace[0]!.nazev;
      obnov();
      if (!zapsano) rekni(t("dilna.ulozit.nejde"), "varovani");
      else rekni(t(vysledek.stav === "prepsano" ? "dilna.prepsano" : "dilna.ulozeno", { nazev: ulozene }));
      nazev.value = volnyNazevPrace(m.uloziste.dilna, t("dilna.nazev.vychozi"));
    }
  });

  kopirovat.addEventListener("click", () => {
    if (odkaz.value === "") {
      rekni(odkaz.placeholder, "varovani");
      return;
    }
    m.zapis({ co: "odkaz", prutu: m.navrh().pruty.length, ze: "stul" });
    void zkopiruj(odkaz.value, t("dilna.odkaz.zkopirovan"));
  });

  return {
    otevri(): void {
      nazev.value = volnyNazevPrace(m.uloziste.dilna, t("dilna.nazev.vychozi"));
      rekni("");
      delete okno.dataset.zkopirovano;
      obnov();
      m.zapis({ co: "okno", praci: m.uloziste.dilna.prace.length });
      okno.showModal();
    },
  };
}
