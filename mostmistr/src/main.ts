// Vstupní bod hry: podle adresy otevře přehled kampaně, nebo obrazovku úrovně
// (`?uroven=1-02`). Zkušební výkres 0-00 do kampaně nepatří, ale adresou otevřít jde.

import { nactiKampan, nactiUrovne } from "../urovne/index";
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
  if (id === null) {
    spustPrehled(kampan, uloziste);
  } else {
    const uroven = nactiUrovne().find((u) => u.id === id);
    if (uroven) spustUroven(uroven, kampan, uloziste);
    else spustPrehled(kampan, uloziste, t("prehled.neznamaUroven", { uroven: id }));
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
