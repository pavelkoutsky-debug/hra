// Stránka zkušebny: pouští ověřovací případy v pracovním vlákně, přehrává jejich
// záznam na výkresu a ukazuje porovnání s teorií.
import type { Bod, Obdelnik } from "../data/geometrie";
import { doplnTexty, prvek, udaj } from "../ui/dom";
import { cislo } from "../ui/formaty";
import { posunPrehravani, zapisCasu, type StavPrehravani } from "../ui/prehravani";
import { t } from "../ui/slovnik";
import { celyVyrez, omezNaVyrez, posunO, zoomKolem, type Kamera } from "../vykres/kamera";
import { nakresliKonstrukci } from "../vykres/konstrukce";
import { pripojOvladani } from "../vykres/ovladani";
import { Platno } from "../vykres/platno";
import { nakresliPodklad, nakresliPopiskyRastru } from "../vykres/vykres";
import { prazdnySnimek, Zaznam, type Snimek, type Topologie } from "../zkouska/zaznam";
import { POLOMER_KOLA } from "./beh";
import { PRIPADY, vyhovuje, type Overeni } from "./pripady";
import type { ZpravaProZkusebnu, ZpravaZeZkusebny } from "./zpravy";

const OKRAJ_VYKRESU = 30;

doplnTexty();

const canvas = prvek(".vykres__platno", HTMLCanvasElement);
const vyber = prvek("#pripad", HTMLSelectElement);
const tlacitkoPrehrat = prvek("#prehrat", HTMLButtonElement);
const tlacitkoOdZacatku = prvek("#od-zacatku", HTMLButtonElement);
const tahlo = prvek("#cas", HTMLInputElement);
const pruhSpocitano = prvek(".osa__spocitano", HTMLElement);
const tabulka = prvek(".overeni", HTMLTableElement);
const teloTabulky = prvek(".overeni tbody", HTMLTableSectionElement);
const tlacitkaRychlosti = [...document.querySelectorAll<HTMLButtonElement>("[data-rychlost]")];

// Stav právě zobrazeného případu.
let idPripadu = "";
let topologie: Topologie | null = null;
let zaznam = new Zaznam();
let snimek: Snimek | null = null;
let vyrez: Obdelnik = { xMin: -1, xMax: 1, yMin: -1, yMax: 1 };
let trvani = 0;
let spocitanoVse = false;
let prehravani: StavPrehravani = { cas: 0, bezi: true, rychlost: 1 };

let kamera: Kamera = { x: 0, y: 0, meritko: 20 };
let pohledJeVychozi = true;

const platno = new Platno(
  canvas,
  (ctx, rozmer) => {
    nakresliPodklad(ctx, kamera, rozmer);
    if (topologie && snimek && zaznam.stavV(prehravani.cas, snimek)) {
      nakresliKonstrukci(ctx, kamera, rozmer, topologie, snimek, POLOMER_KOLA);
    }
    nakresliPopiskyRastru(ctx, kamera, rozmer);
  },
  () => {
    if (pohledJeVychozi) kamera = celyVyrez(vyrez, platno.rozmer, OKRAJ_VYKRESU);
    platno.prekresli();
  },
);

function zmenPohled(nova: Kamera): void {
  kamera = omezNaVyrez(nova, vyrez, platno.rozmer);
  pohledJeVychozi = false;
  platno.prekresli();
}

function ukazCelyVykres(): void {
  kamera = celyVyrez(vyrez, platno.rozmer, OKRAJ_VYKRESU);
  pohledJeVychozi = true;
  platno.prekresli();
}

function zoomuj(kotva: Bod, faktor: number): void {
  const nejmensi = celyVyrez(vyrez, platno.rozmer, OKRAJ_VYKRESU).meritko;
  const nova = zoomKolem(kamera, platno.rozmer, kotva, faktor, nejmensi);
  if (nova.meritko <= nejmensi) ukazCelyVykres();
  else zmenPohled(nova);
}

pripojOvladani(canvas, {
  posun: (dx, dy) => zmenPohled(posunO(kamera, dx, dy)),
  zoom: zoomuj,
  zoomNaStred: (faktor) => zoomuj({ x: platno.rozmer.sirka / 2, y: platno.rozmer.vyska / 2 }, faktor),
  celyVykres: ukazCelyVykres,
  kurzor: () => {},
});

/** Promítne stav přehrávání do ovládacích prvků a překreslí výkres. */
function obnovOvladani(): void {
  tlacitkoPrehrat.textContent = t(prehravani.bezi ? "zkusebna.zastavit" : "zkusebna.prehrat");
  tlacitkoPrehrat.dataset.bezi = String(prehravani.bezi);
  tahlo.value = String(prehravani.cas);
  udaj("cas").textContent = `${zapisCasu(prehravani.cas)} / ${zapisCasu(trvani)}`;
  for (const tlacitko of tlacitkaRychlosti) {
    tlacitko.setAttribute("aria-pressed", String(Number(tlacitko.dataset.rychlost) === prehravani.rychlost));
  }
  platno.prekresli();
}

let predchoziSnimekObrazu: number | null = null;
function snimekObrazu(ted: number): void {
  const uplynulo = predchoziSnimekObrazu === null ? 0 : Math.min(0.1, (ted - predchoziSnimekObrazu) / 1000);
  predchoziSnimekObrazu = ted;
  if (prehravani.bezi && trvani > 0) {
    // Dokud se počítá, lze přehrávat jen to, co už je v záznamu.
    const spocitano = spocitanoVse ? trvani : zaznam.konec;
    const novy = posunPrehravani(prehravani, uplynulo, spocitano, trvani);
    if (novy !== prehravani && (novy.cas !== prehravani.cas || novy.bezi !== prehravani.bezi)) {
      prehravani = novy;
      obnovOvladani();
    }
  }
  requestAnimationFrame(snimekObrazu);
}
requestAnimationFrame(snimekObrazu);

function zobrazOvereni(overeni: Overeni[]): void {
  teloTabulky.replaceChildren(
    ...overeni.map((o) => {
      const radek = document.createElement("tr");
      const sedi = vyhovuje(o);
      const bunky = [
        t(o.nazev),
        `${cislo(o.namereno, o.mist)} ${o.jednotka}`,
        `${cislo(o.ocekavano, o.mist)} ${o.jednotka}`,
        `${sedi ? "✓" : "✗"} ${t(sedi ? "zkusebna.sedi" : "zkusebna.nesedi")}`,
      ];
      bunky.forEach((text, i) => {
        const bunka = document.createElement("td");
        bunka.textContent = text;
        if (i === 3) bunka.dataset.shoda = sedi ? "ano" : "ne";
        radek.append(bunka);
      });
      return radek;
    }),
  );
  tabulka.hidden = false;
}

const pracovnik = new Worker(new URL("./pracovnik.ts", import.meta.url), { type: "module" });

function ukazChybu(duvod: string): void {
  const hlaseni = udaj("chyba");
  hlaseni.textContent = t("zkusebna.chyba", { duvod });
  hlaseni.hidden = false;
  udaj("prubeh").textContent = "";
}

pracovnik.onerror = (udalost) => ukazChybu(udalost.message);
pracovnik.onmessage = (udalost: MessageEvent<ZpravaZeZkusebny>) => {
  const zprava = udalost.data;
  if (zprava.pripad !== idPripadu) return; // odpověď na dřívější, už opuštěný případ

  switch (zprava.typ) {
    case "zacatek":
      topologie = zprava.topologie;
      snimek = prazdnySnimek(topologie.stycniku, topologie.prvekA.length, zprava.kol);
      vyrez = zprava.vyrez;
      trvani = zprava.trvani;
      tahlo.max = String(trvani);
      udaj("krok").textContent = t("zkusebna.krok", {
        mikro: cislo(zprava.dt * 1e6, 0),
        naSekundu: cislo(1 / zprava.dt, 0),
      });
      ukazCelyVykres();
      obnovOvladani();
      break;
    case "snimky":
      for (const s of zprava.snimky) zaznam.pridej(s);
      pruhSpocitano.style.setProperty("--spocitano", String(Math.min(1, zaznam.konec / trvani)));
      udaj("prubeh").textContent = t("zkusebna.pocitaSe", { procent: Math.round((100 * zaznam.konec) / trvani) });
      platno.prekresli();
      break;
    case "konec":
      spocitanoVse = true;
      pruhSpocitano.style.setProperty("--spocitano", "1");
      udaj("prubeh").textContent = "";
      zobrazOvereni(zprava.overeni);
      udaj("vypocet").textContent = t("zkusebna.vypocetUdaj", {
        kroku: cislo(zprava.kroku, 0),
        ms: cislo(zprava.ms, 0),
        nasobek: cislo((trvani * 1000) / zprava.ms, 0),
      });
      document.body.dataset.stav = "hotovo";
      break;
    case "chyba":
      ukazChybu(zprava.zprava);
      document.body.dataset.stav = "chyba";
      break;
  }
};

function spustPripad(id: string): void {
  const pripad = PRIPADY.find((p) => p.id === id) ?? PRIPADY[0]!;
  idPripadu = pripad.id;
  topologie = null;
  snimek = null;
  zaznam = new Zaznam();
  trvani = 0;
  spocitanoVse = false;
  prehravani = { ...prehravani, cas: 0, bezi: true };
  pohledJeVychozi = true;

  vyber.value = pripad.id;
  udaj("nazev").textContent = t(pripad.nazev);
  udaj("popis").textContent = t(pripad.popis);
  udaj("chyba").hidden = true;
  udaj("krok").textContent = "";
  udaj("vypocet").textContent = "";
  udaj("prubeh").textContent = t("zkusebna.pocitaSe", { procent: 0 });
  tabulka.hidden = true;
  pruhSpocitano.style.setProperty("--spocitano", "0");
  document.body.dataset.stav = "pocita";
  history.replaceState(null, "", `?pripad=${pripad.id}`);
  obnovOvladani();

  const zprava: ZpravaProZkusebnu = { typ: "spust", pripad: pripad.id };
  pracovnik.postMessage(zprava);
}

for (const pripad of PRIPADY) {
  const volba = document.createElement("option");
  volba.value = pripad.id;
  volba.textContent = t(pripad.nazev);
  vyber.append(volba);
}
vyber.addEventListener("change", () => spustPripad(vyber.value));

tlacitkoPrehrat.addEventListener("click", () => {
  // Na konci děje tlačítko přehraje záznam znovu od začátku.
  const naKonci = trvani > 0 && prehravani.cas >= trvani;
  prehravani = { ...prehravani, bezi: !prehravani.bezi, cas: naKonci ? 0 : prehravani.cas };
  obnovOvladani();
});
tlacitkoOdZacatku.addEventListener("click", () => {
  prehravani = { ...prehravani, cas: 0, bezi: true };
  obnovOvladani();
});
for (const tlacitko of tlacitkaRychlosti) {
  tlacitko.addEventListener("click", () => {
    prehravani = { ...prehravani, rychlost: Number(tlacitko.dataset.rychlost) };
    obnovOvladani();
  });
}
tahlo.addEventListener("input", () => {
  // Tažením po ose se přehrávání zastaví; nelze skočit za spočítanou část.
  const spocitano = spocitanoVse ? trvani : zaznam.konec;
  prehravani = { ...prehravani, cas: Math.min(Number(tahlo.value), spocitano), bezi: false };
  obnovOvladani();
});

spustPripad(new URLSearchParams(location.search).get("pripad") ?? PRIPADY[0]!.id);
