// Vstupní bod hry: podle adresy otevře přehled kampaně, obrazovku úrovně (`?uroven=1-02`)
// nebo sandbox (`?sandbox`). Zkušební výkres 0-00 do kampaně nepatří, ale adresou otevřít jde.

import { nactiKampan, nactiUrovne } from "../urovne/index";
import { sandboxZTextu, urovenSandboxu } from "./data/sandbox";
import { denikHry } from "./denik/prohlizec";
import { spustPrehled } from "./hra/prehled";
import { skladProhlizece, Uloziste } from "./hra/uloziste";
import { spustUroven } from "./hra/uroven";
import { doplnTexty } from "./ui/dom";
import { t } from "./ui/slovnik";

doplnTexty();
try {
  const uloziste = new Uloziste(skladProhlizece());
  const kampan = nactiKampan();
  const id = new URLSearchParams(window.location.search).get("uroven");
  // Deník hraní: anonymní záznam toho, co se ve hře děje (viz src/denik/).
  const denik = denikHry();
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
  } else if (id === null) {
    spustPrehled(kampan, uloziste, denik);
  } else {
    const uroven = nactiUrovne().find((u) => u.id === id);
    if (uroven) spustUroven(uroven, kampan, uloziste, denik);
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
