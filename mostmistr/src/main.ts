import { nactiUrovne } from "../urovne/index";
import type { Bod } from "./data/geometrie";
import { jeUvnitr } from "./data/geometrie";
import type { Uroven } from "./data/uroven";
import { cislo, datum, meritkoVykresu } from "./ui/formaty";
import { doplnTexty, prvek, udaj } from "./ui/dom";
import { t } from "./ui/slovnik";
import { celyVyrez, obrazNaSvet, omezNaVyrez, posunO, zoomKolem, type Kamera } from "./vykres/kamera";
import { pripojOvladani } from "./vykres/ovladani";
import { Platno } from "./vykres/platno";
import { nakresliVykres } from "./vykres/vykres";
import { KlientZkousky } from "./zkouska/klient";

/** Volný okraj kolem výřezu při zobrazení celého výkresu, v pixelech. */
const OKRAJ_VYKRESU = 28;
const KROK_ZOOMU_TLACITKEM = 1.25;

function spust(uroven: Uroven): void {
  const canvas = prvek(".vykres__platno", HTMLCanvasElement);
  const poleSouradnic = udaj("souradnice");
  const poleMeritka = udaj("meritko");

  // Skutečný výchozí pohled nastaví až `ukazCelyVykres` na konci, kdy je známá velikost plátna.
  let kamera: Kamera = { x: 0, y: 0, meritko: 20 };
  /** Dokud hráč pohled nezměnil, drží se při změně velikosti okna celý výkres. */
  let pohledJeVychozi = true;
  /** Poslední místo kurzoru na plátně v pixelech; null, když je mimo plátno. */
  let mistoKurzoru: Bod | null = null;
  /** Bod rastru pod kurzorem; null mimo výřez úrovně. */
  let kurzor: Bod | null = null;

  const platno = new Platno(
    canvas,
    (ctx, rozmer) => nakresliVykres(ctx, { uroven, kamera, rozmer, kurzor }),
    () => {
      if (pohledJeVychozi) kamera = pohledNaCelyVykres();
      obnov();
    },
  );

  function pohledNaCelyVykres(): Kamera {
    return celyVyrez(uroven.vyrez, platno.rozmer, OKRAJ_VYKRESU);
  }

  /** Přepočítá vše, co závisí na kameře a kurzoru, a požádá o překreslení. */
  function obnov(): void {
    kurzor = null;
    if (mistoKurzoru) {
      const svet = obrazNaSvet(kamera, platno.rozmer, mistoKurzoru);
      const bod = { x: Math.round(svet.x), y: Math.round(svet.y) };
      if (jeUvnitr(uroven.vyrez, bod)) kurzor = bod;
    }
    poleMeritka.textContent = meritkoVykresu(kamera.meritko);
    poleSouradnic.textContent = kurzor
      ? t("souradnice.bod", { x: cislo(kurzor.x, 0), y: cislo(kurzor.y, 0) })
      : "";
    platno.prekresli();
  }

  function zmenPohled(nova: Kamera): void {
    kamera = omezNaVyrez(nova, uroven.vyrez, platno.rozmer);
    pohledJeVychozi = false;
    obnov();
  }

  function zoomuj(kotva: Bod, faktor: number): void {
    // Oddálit lze nejvýš na celý výkres; na té mezi se pohled rovnou vystředí.
    const nejmensi = pohledNaCelyVykres().meritko;
    const nova = zoomKolem(kamera, platno.rozmer, kotva, faktor, nejmensi);
    if (nova.meritko <= nejmensi) ukazCelyVykres();
    else zmenPohled(nova);
  }

  function zoomujNaStred(faktor: number): void {
    zoomuj({ x: platno.rozmer.sirka / 2, y: platno.rozmer.vyska / 2 }, faktor);
  }

  function ukazCelyVykres(): void {
    kamera = pohledNaCelyVykres();
    pohledJeVychozi = true;
    obnov();
  }

  pripojOvladani(canvas, {
    posun: (dx, dy) => zmenPohled(posunO(kamera, dx, dy)),
    zoom: zoomuj,
    zoomNaStred: zoomujNaStred,
    celyVykres: ukazCelyVykres,
    kurzor: (misto) => {
      mistoKurzoru = misto;
      obnov();
    },
  });

  prvek('[data-akce="oddalit"]', HTMLButtonElement).addEventListener("click", () =>
    zoomujNaStred(1 / KROK_ZOOMU_TLACITKEM),
  );
  prvek('[data-akce="priblizit"]', HTMLButtonElement).addEventListener("click", () =>
    zoomujNaStred(KROK_ZOOMU_TLACITKEM),
  );
  prvek('[data-akce="cely-vykres"]', HTMLButtonElement).addEventListener("click", ukazCelyVykres);

  udaj("uroven").textContent = `${uroven.id}  ${uroven.nazev}`;
  udaj("nazev").textContent = uroven.nazev;
  udaj("list").textContent = uroven.id;
  udaj("verze").textContent = `${__VERZE_HRY__} · ${__OTISK_SESTAVENI__}`;
  udaj("datum").textContent = datum(new Date());
  ukazCelyVykres();

  // Simulace běží v pracovním vlákně. Dotaz na verzi zároveň ověří, že vlákno funguje.
  new KlientZkousky()
    .zjistiVerziFyziky()
    .then((verze) => {
      udaj("fyzika").textContent = `v${verze}`;
    })
    .catch(() => {
      udaj("fyzika").textContent = t("pole.fyzikaNedostupna");
    });
}

doplnTexty();
try {
  const uroven = nactiUrovne()[0];
  if (!uroven) throw new Error("žádná úroveň");
  spust(uroven);
} catch (chyba) {
  const hlaseni = udaj("chyba");
  hlaseni.textContent = t("chyba.nacteni", { duvod: chyba instanceof Error ? chyba.message : String(chyba) });
  hlaseni.hidden = false;
  throw chyba;
}
