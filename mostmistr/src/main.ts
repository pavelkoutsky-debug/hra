// Vstupní bod hry: podle adresy otevře přehled kampaně, obrazovku úrovně (`?uroven=1-02`)
// nebo sandbox (`?sandbox`). Zkušební výkres 0-00 do kampaně nepatří, ale adresou otevřít jde.

import { nactiKampan, nactiUrovne } from "../urovne/index";
import { jeSandboxVAdrese, PARAMETR_SANDBOXU, sandboxZAdresy } from "./data/dilna";
import { ChybaDat } from "./data/kontrola";
import { PARAMETR_MOSTU, rozkodujMost, ocistiKodMostu } from "./data/sdileni";
import { ID_SANDBOXU, sandboxZTextu, urovenSandboxu } from "./data/sandbox";
import { denikHry } from "./denik/prohlizec";
import { spustList } from "./hra/list";
import { spustPrehled } from "./hra/prehled";
import { skladProhlizece, Uloziste } from "./hra/uloziste";
import { spustUroven, type MostZOdkazu } from "./hra/uroven";
import { doplnTexty } from "./ui/dom";
import { pripojPojmy } from "./ui/pojmy";
import { prepnutyJazyk, pripravJazyk } from "./ui/jazyk";
import { t } from "./ui/slovnik";

// Jazyk musí být známý dřív, než se do stránky doplní první text.
pripravJazyk();
doplnTexty();
pripojPojmy();
try {
  const uloziste = new Uloziste(skladProhlizece());
  const kampan = nactiKampan();
  // Most z odkazu (sdílení): kód v adrese nese most i jeho úroveň. Poškozený odkaz hru
  // nezastaví: otevře se úroveň z adresy (nebo přehled) a hráč se dozví, co se stalo.
  const kodZAdresy = new URLSearchParams(window.location.search).get(PARAMETR_MOSTU);
  const kodMostu = kodZAdresy === null ? null : ocistiKodMostu(kodZAdresy);
  let mostZOdkazu: MostZOdkazu | null = null;
  if (kodMostu !== null) {
    try {
      mostZOdkazu = { kod: kodMostu, navrh: rozkodujMost(kodMostu) };
    } catch (chyba) {
      mostZOdkazu = { chyba: chyba instanceof ChybaDat && chyba.kod === "novejsi-verze" ? "novejsi" : "poskozeny" };
    }
  }
  const id = (mostZOdkazu && "navrh" in mostZOdkazu ? mostZOdkazu.navrh.uroven : null) ?? new URLSearchParams(window.location.search).get("uroven");
  // Deník hraní: anonymní záznam toho, co se ve hře děje (viz src/denik/).
  const denik = denikHry();
  const prepnuto = prepnutyJazyk();
  if (prepnuto) denik.zapis("ovladani", { co: "jazyk", jazyk: prepnuto });
  const sandboxVAdrese = new URLSearchParams(window.location.search).get(PARAMETR_SANDBOXU);
  const mostPiskoviste = mostZOdkazu !== null && "navrh" in mostZOdkazu && mostZOdkazu.navrh.uroven === ID_SANDBOXU;
  if (sandboxVAdrese !== null) {
    // Sandbox: úroveň se vyrobí z nastavení, které si hráč uložil. Kde prohlížeč nedá paměť,
    // nese nastavení adresa; ta má pak přednost.
    let nastaveni = uloziste.sandbox;
    // Scénář z odkazu (dílna): adresa nese údolí i most. Pískoviště hráče zůstává, jak bylo;
    // scénář se otevře jako návštěva. Když údolí nejde přečíst, most by do cizího nepasoval.
    let scenar: typeof mostZOdkazu = null;
    try {
      if (sandboxVAdrese.startsWith("{")) nastaveni = sandboxZTextu(sandboxVAdrese);
      else if (jeSandboxVAdrese(sandboxVAdrese)) {
        nastaveni = sandboxZAdresy(sandboxVAdrese);
        if (mostPiskoviste) scenar = mostZOdkazu;
      }
      if (mostZOdkazu !== null && !mostPiskoviste) scenar = "chyba" in mostZOdkazu ? mostZOdkazu : { chyba: "poskozeny" };
    } catch {
      // Nastavení v adrese nejde přečíst: platí uložené a hráč se dozví, že odkaz nebyl celý.
      if (mostZOdkazu !== null || jeSandboxVAdrese(sandboxVAdrese)) scenar = { chyba: "poskozeny" };
    }
    spustUroven(urovenSandboxu(nastaveni), kampan, uloziste, denik, nastaveni, scenar);
  } else if (mostPiskoviste) {
    // Odkaz na scénář, ze kterého cestou vypadlo údolí: most sám do žádného údolí nepatří.
    spustPrehled(kampan, uloziste, denik, t("sdileni.chyba.poskozeny"));
  } else if (id === null && new URLSearchParams(window.location.search).has("list")) {
    // Závěrečný list kampaně: souhrn a galerie mostů hráče.
    spustList(kampan, uloziste, denik);
  } else if (id === null) {
    spustPrehled(kampan, uloziste, denik, mostZOdkazu && "chyba" in mostZOdkazu ? t(`sdileni.chyba.${mostZOdkazu.chyba}`) : undefined);
  } else {
    const uroven = nactiUrovne().find((u) => u.id === id);
    if (uroven) spustUroven(uroven, kampan, uloziste, denik, null, mostZOdkazu);
    else spustPrehled(kampan, uloziste, denik, t("prehled.neznamaUroven", { uroven: id }));
  }
} catch (chyba) {
  // Chyba při startu (poškozený soubor úrovně, chybějící prvek stránky) se ukáže přímo na stránce.
  const hlaseni = document.createElement("p");
  hlaseni.className = "vykres__chyba";
  hlaseni.setAttribute("role", "alert");
  hlaseni.textContent = t("chyba.nacteni", { duvod: chyba instanceof Error ? chyba.message : String(chyba) });
  document.body.append(hlaseni);
  throw chyba;
}
