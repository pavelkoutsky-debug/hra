// Vstupní bod hry: podle adresy otevře přehled kampaně, obrazovku úrovně (`?uroven=1-02`)
// nebo sandbox (`?sandbox`). Zkušební výkres 0-00 do kampaně nepatří, ale adresou otevřít jde.

import { nactiKampan, nactiUrovne } from "../urovne/index";
import { ChybaDat } from "./data/kontrola";
import { PARAMETR_MOSTU, rozkodujMost, ocistiKodMostu } from "./data/sdileni";
import { sandboxZTextu, urovenSandboxu } from "./data/sandbox";
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
  const sandboxZAdresy = new URLSearchParams(window.location.search).get("sandbox");
  if (sandboxZAdresy !== null) {
    // Sandbox: úroveň se vyrobí z nastavení, které si hráč uložil. Kde prohlížeč nedá paměť,
    // nese nastavení adresa; ta má pak přednost.
    let nastaveni = uloziste.sandbox;
    try {
      if (sandboxZAdresy.startsWith("{")) nastaveni = sandboxZTextu(sandboxZAdresy);
    } catch {
      // Nastavení v adrese nejde přečíst: platí uložené.
    }
    spustUroven(urovenSandboxu(nastaveni), kampan, uloziste, denik, nastaveni);
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
