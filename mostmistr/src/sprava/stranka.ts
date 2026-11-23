// Stránka správce: zpětná vazba hráčů se stavem řešení a deník hraní po dnech a sezeních.
// Je to nástroj pro zadavatele, ne součást hry; proto má texty přímo u sebe. Se serverem
// mluví přes /api/sprava a každou žádost podepisuje heslem správce.

import { navrhZTextu, type NavrhMostu } from "../data/navrh";
import type { Uroven } from "../data/uroven";
import { STAVY_VAZBY, type EvidovanaVazba, type HlavickaDeniku, type StavVazby, type UdalostDeniku } from "../denik/udalosti";
import type { OdpovedSouhrnu, PolozkaSeznamuVazeb, SezeniDne } from "../server/obsluha";
import { celyVyrez } from "../vykres/kamera";
import { nakresliNavrh } from "../vykres/navrh";
import { nakresliVykres } from "../vykres/vykres";
import { nactiUrovne } from "../../urovne/index";

const KLIC_HESLA = "mostmistr.sprava.heslo";
const NAZVY_STAVU: Record<StavVazby, string> = { nova: "nová", "resi-se": "řeší se", vyreseno: "vyřešeno", zamitnuto: "zamítnuto" };
const NAZVY_DRUHU: Record<string, string> = { chyba: "chyba", napad: "nápad", obtiznost: "obtížnost", pochvala: "pochvala", jine: "jiné" };

const prvek = <T extends HTMLElement>(volic: string): T => {
  const nalezeny = document.querySelector<T>(volic);
  if (!nalezeny) throw new Error(`Na stránce chybí prvek ${volic}.`);
  return nalezeny;
};

const hlaseni = prvek<HTMLElement>("#hlaseni");
const obsah = prvek<HTMLElement>("#obsah");
const poleHesla = prvek<HTMLInputElement>("#heslo");
const urovne = new Map<string, Uroven>(nactiUrovne().map((u) => [u.id, u]));

let heslo = "";
try {
  heslo = window.sessionStorage.getItem(KLIC_HESLA) ?? "";
} catch {
  heslo = "";
}

class ChybaSpravy extends Error {
  constructor(
    readonly stav: number,
    zprava: string,
  ) {
    super(zprava);
  }
}

/** Zavolá správu; `telo` znamená zápis (POST). Chybu serveru vyhodí i s jeho vysvětlením. */
async function sprava<T>(dotaz: string, telo?: unknown): Promise<T> {
  const odpoved = await fetch(`/api/sprava?${dotaz}`, {
    method: telo === undefined ? "GET" : "POST",
    headers: { authorization: `Bearer ${heslo}`, ...(telo === undefined ? {} : { "content-type": "application/json" }) },
    ...(telo === undefined ? {} : { body: JSON.stringify(telo) }),
  });
  let data: unknown = null;
  try {
    data = await odpoved.json();
  } catch {
    data = null;
  }
  if (!odpoved.ok) {
    const zprava = (data as { chyba?: unknown } | null)?.chyba;
    throw new ChybaSpravy(odpoved.status, typeof zprava === "string" ? zprava : `server odpověděl ${odpoved.status}`);
  }
  return data as T;
}

function ohlas(text: string): void {
  hlaseni.textContent = text;
}

function cas(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("cs-CZ", { dateStyle: "short", timeStyle: "short" });
}

/** Počet se slovem ve správném tvaru: 1 hráč, 3 hráči, 5 hráčů. */
function pocet(kolik: number, jeden: string, dva: string, pet: string): string {
  return `${kolik.toLocaleString("cs-CZ")} ${kolik === 1 ? jeden : kolik >= 2 && kolik <= 4 ? dva : pet}`;
}

/** Hodiny a minuty času v milisekundách (místní čas prohlížeče). */
function hodina(ms: number): string {
  return new Date(ms).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
}

function bunka(text: string, trida?: string): HTMLTableCellElement {
  const td = document.createElement("td");
  td.textContent = text;
  if (trida) td.className = trida;
  return td;
}

function znackaStavu(stav: StavVazby): HTMLElement {
  const znacka = document.createElement("span");
  znacka.className = "stav";
  znacka.dataset.stav = stav;
  znacka.textContent = NAZVY_STAVU[stav] ?? stav;
  return znacka;
}

function udaje(seznam: HTMLElement, polozky: [string, string][]): void {
  seznam.replaceChildren(
    ...polozky.flatMap(([nazev, hodnota]) => {
      const dt = document.createElement("dt");
      dt.textContent = nazev;
      const dd = document.createElement("dd");
      dd.textContent = hodnota;
      return [dt, dd];
    }),
  );
}

function zarizeni(h: HlavickaDeniku): string {
  return `hra ${h.hra} (${h.sestaveni}) · okno ${h.okno[0]}×${h.okno[1]} · ${h.dotyk ? "dotyk" : "myš"} · ${h.jazyk}`;
}

/** Nakreslí most do plátna; vrací false, když zápis mostu nejde přečíst nebo úroveň není známá. */
function nakresliMost(platno: HTMLCanvasElement, zapis: string | undefined, idUrovne: string | undefined): NavrhMostu | null {
  platno.hidden = true;
  if (!zapis) return null;
  let navrh: NavrhMostu;
  try {
    navrh = navrhZTextu(zapis);
  } catch {
    return null;
  }
  const uroven = urovne.get(idUrovne ?? navrh.uroven) ?? urovne.get(navrh.uroven);
  if (!uroven) return null;
  platno.hidden = false;
  const hustota = window.devicePixelRatio || 1;
  const obrys = platno.getBoundingClientRect();
  const rozmer = { sirka: Math.max(1, obrys.width), vyska: Math.max(1, obrys.height) };
  platno.width = Math.round(rozmer.sirka * hustota);
  platno.height = Math.round(rozmer.vyska * hustota);
  const ctx = platno.getContext("2d", { alpha: false });
  if (!ctx) return navrh;
  ctx.setTransform(hustota, 0, 0, hustota, 0, 0);
  const kamera = celyVyrez(uroven.vyrez, rozmer, 6);
  nakresliVykres(ctx, { uroven, kamera, rozmer, kurzor: null, nahled: true });
  nakresliNavrh(ctx, kamera, rozmer, {
    navrh,
    vybranePruty: new Set(),
    vybraneStycniky: new Set(),
    tah: null,
    zacatek: null,
    problemy: [],
    obalka: null,
  });
  return navrh;
}

function casUdalosti(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Podrobnosti události na jeden řádek; zápis mostu se nahradí jeho velikostí. */
function popisDat(u: UdalostDeniku): string {
  if (!u.data) return "";
  const data: Record<string, unknown> = { ...u.data };
  if (typeof data.navrh === "string") {
    try {
      const navrh = navrhZTextu(data.navrh);
      data.navrh = `most: ${navrh.pruty.length} prutů`;
    } catch {
      data.navrh = "most (nečitelný)";
    }
  }
  return JSON.stringify(data);
}

/** Tabulka událostí; klik na řádek se zápisem mostu most nakreslí do `platno`. */
function vypisUdalosti(kam: HTMLElement, udalosti: readonly UdalostDeniku[], platno: HTMLCanvasElement | null): void {
  const tabulka = document.createElement("table");
  const telo = document.createElement("tbody");
  for (const u of udalosti) {
    const radek = document.createElement("tr");
    radek.append(bunka(casUdalosti(u.t), "cislo"), bunka(u.uroven ?? ""), bunka(u.druh), bunka(popisDat(u)));
    const zapis = u.data?.navrh;
    if (platno && typeof zapis === "string") {
      radek.dataset.vyber = "most";
      radek.title = "Klikni: nakreslit tento most";
      radek.addEventListener("click", () => {
        for (const r of telo.querySelectorAll("tr[aria-selected]")) r.removeAttribute("aria-selected");
        radek.setAttribute("aria-selected", "true");
        nakresliMost(platno, zapis, u.uroven);
      });
    }
    telo.append(radek);
  }
  tabulka.append(telo);
  kam.replaceChildren(tabulka);
}

// ---- Zpětná vazba ----

let vazby: PolozkaSeznamuVazeb[] = [];
let filtr: StavVazby | "vse" = "vse";
let vybrana: EvidovanaVazba | null = null;
let zvolenyStav: StavVazby = "nova";

function vykresliFiltr(): void {
  const pocty = new Map<string, number>();
  for (const v of vazby) pocty.set(v.stav, (pocty.get(v.stav) ?? 0) + 1);
  const moznosti: (StavVazby | "vse")[] = ["vse", ...STAVY_VAZBY];
  prvek("#filtr-stavu").replaceChildren(
    ...moznosti.map((stav) => {
      const tlacitko = document.createElement("button");
      tlacitko.type = "button";
      tlacitko.dataset.filtr = stav;
      tlacitko.setAttribute("aria-pressed", String(filtr === stav));
      const pocet = stav === "vse" ? vazby.length : (pocty.get(stav) ?? 0);
      tlacitko.textContent = `${stav === "vse" ? "vše" : NAZVY_STAVU[stav]} (${pocet})`;
      tlacitko.addEventListener("click", () => {
        filtr = stav;
        vykresliVazby();
      });
      return tlacitko;
    }),
  );
}

function vykresliVazby(): void {
  vykresliFiltr();
  const telo = prvek<HTMLTableSectionElement>("#vazby tbody");
  const viditelne = vazby.filter((v) => filtr === "vse" || v.stav === filtr);
  telo.replaceChildren(
    ...viditelne.map((v) => {
      const radek = document.createElement("tr");
      radek.dataset.vyber = v.id;
      radek.setAttribute("aria-selected", String(vybrana?.id === v.id));
      const stav = document.createElement("td");
      stav.append(znackaStavu(v.stav));
      radek.append(
        bunka(cas(v.prijato)),
        stav,
        bunka(NAZVY_DRUHU[v.druh] ?? v.druh),
        bunka(v.uroven ?? "—"),
        bunka(v.hodnoceni === null ? "—" : `${v.hodnoceni}/5`, "cislo"),
        bunka(`${v.ukazka}${v.maNavrh ? " [most]" : ""}${v.maKontakt ? " [kontakt]" : ""}`),
      );
      radek.addEventListener("click", () => void otevriVazbu(v.id));
      return radek;
    }),
  );
  if (viditelne.length === 0) {
    const radek = document.createElement("tr");
    const prazdno = bunka(vazby.length === 0 ? "Zatím žádná zpětná vazba nepřišla." : "V tomto stavu žádná zpětná vazba není.");
    prazdno.colSpan = 6;
    radek.append(prazdno);
    telo.append(radek);
  }
}

function vykresliStavy(): void {
  prvek("#vazba-stavy").replaceChildren(
    ...STAVY_VAZBY.map((stav) => {
      const tlacitko = document.createElement("button");
      tlacitko.type = "button";
      tlacitko.dataset.stav = stav;
      tlacitko.setAttribute("aria-pressed", String(zvolenyStav === stav));
      tlacitko.textContent = NAZVY_STAVU[stav];
      tlacitko.addEventListener("click", () => {
        zvolenyStav = stav;
        vykresliStavy();
      });
      return tlacitko;
    }),
  );
}

function vykresliDetailVazby(v: EvidovanaVazba): void {
  vybrana = v;
  zvolenyStav = v.stav;
  prvek("#detail-vazby").hidden = false;
  udaje(prvek("#vazba-udaje"), [
    ["Číslo", v.id],
    ["Přijato", `${cas(v.prijato)} · ${v.prostredi}`],
    ["Druh", NAZVY_DRUHU[v.druh] ?? v.druh],
    ["Úroveň", v.uroven ?? "—"],
    ["Jak hra baví", v.hodnoceni === undefined ? "neuvedeno" : `${v.hodnoceni} z 5`],
    ["Kontakt", v.kontakt ?? "neuveden"],
    ["Zařízení", zarizeni(v.hlavicka)],
    ["Hráč", `${v.hlavicka.hrac} · sezení ${v.hlavicka.sezeni}`],
    ["Upraveno", v.upraveno ? cas(v.upraveno) : "—"],
  ]);
  prvek("#vazba-text").textContent = v.text;
  const navrh = nakresliMost(prvek<HTMLCanvasElement>("#vazba-most"), v.navrh, v.uroven);
  prvek("#vazba-kopirovat").hidden = v.navrh === undefined;
  const odkaz = prvek<HTMLAnchorElement>("#vazba-uroven");
  const idUrovne = v.uroven ?? navrh?.uroven;
  odkaz.hidden = idUrovne === undefined;
  // Hra se otevře s vypnutým záznamem: zkoušení zadavatele nemá kazit čísla o hráčích.
  if (idUrovne !== undefined) odkaz.href = `/?uroven=${encodeURIComponent(idUrovne)}&zaznam=vypnout`;
  prvek<HTMLTextAreaElement>("#vazba-poznamka").value = v.poznamka;
  vykresliStavy();
  const udalosti = v.udalosti ?? [];
  prvek("#vazba-udalosti-nadpis").hidden = udalosti.length === 0;
  const seznam = prvek("#vazba-udalosti");
  seznam.hidden = udalosti.length === 0;
  if (udalosti.length > 0) vypisUdalosti(seznam, udalosti, prvek<HTMLCanvasElement>("#vazba-most"));
  vykresliVazby();
}

async function otevriVazbu(id: string): Promise<void> {
  // Než se nová zpráva načte, detail té předchozí zmizí: tlačítka Uložit a Smazat se tak
  // nemůžou splést a zasáhnout zprávu, na kterou se už nikdo nedívá.
  vybrana = null;
  prvek("#detail-vazby").hidden = true;
  try {
    const { vazba } = await sprava<{ vazba: EvidovanaVazba }>(`co=vazba&id=${encodeURIComponent(id)}`);
    vykresliDetailVazby(vazba);
    // Na úzkém okně je detail až pod seznamem: posune se k němu.
    prvek("#detail-vazby").scrollIntoView({ block: "nearest" });
    ohlas("");
  } catch (chyba) {
    ohlas(`Zpětnou vazbu se nepodařilo načíst: ${(chyba as Error).message}`);
  }
}

/** Číslo nejstarší načtené zprávy, za kterou jsou na serveru ještě starší; null, když je načteno vše. */
let starsiNez: string | null = null;

async function nactiVazby(): Promise<void> {
  const odpoved = await sprava<{ vazby: PolozkaSeznamuVazeb[]; celkem: number; dalsi: string | null }>("co=vazby");
  vazby = odpoved.vazby;
  starsiNez = odpoved.dalsi;
  vykresliVazby();
  vykresliStarsi(odpoved.celkem);
}

function vykresliStarsi(celkem: number): void {
  const tlacitko = prvek<HTMLButtonElement>("#vazby-starsi");
  tlacitko.hidden = starsiNez === null;
  tlacitko.textContent = `Načíst starší (zobrazeno ${vazby.length} z ${celkem})`;
}

prvek("#vazby-starsi").addEventListener("click", () => {
  const pred = starsiNez;
  if (pred === null) return;
  void (async () => {
    try {
      const odpoved = await sprava<{ vazby: PolozkaSeznamuVazeb[]; celkem: number; dalsi: string | null }>(`co=vazby&pred=${pred}`);
      vazby = [...vazby, ...odpoved.vazby];
      starsiNez = odpoved.dalsi;
      vykresliVazby();
      vykresliStarsi(odpoved.celkem);
    } catch (chyba) {
      ohlas(`Starší zprávy se nepodařilo načíst: ${(chyba as Error).message}`);
    }
  })();
});

prvek("#vazba-ulozit").addEventListener("click", () => {
  const v = vybrana;
  if (!v) return;
  void (async () => {
    try {
      const poznamka = prvek<HTMLTextAreaElement>("#vazba-poznamka").value;
      const { vazba } = await sprava<{ vazba: EvidovanaVazba }>("co=vazba", { id: v.id, stav: zvolenyStav, poznamka });
      vazby = vazby.map((p) => (p.id === vazba.id ? { ...p, stav: vazba.stav } : p));
      vykresliDetailVazby(vazba);
      ohlas(`Uloženo: ${vazba.id} – stav „${NAZVY_STAVU[vazba.stav]}“.`);
    } catch (chyba) {
      ohlas(`Uložit se nepodařilo: ${(chyba as Error).message}`);
    }
  })();
});

prvek("#vazba-smazat").addEventListener("click", () => {
  const v = vybrana;
  if (!v || !window.confirm(`Smazat zpětnou vazbu ${v.id}? Nejde to vrátit.`)) return;
  void (async () => {
    try {
      await sprava("co=smazat", { vazba: v.id });
      vybrana = null;
      prvek("#detail-vazby").hidden = true;
      await nactiVazby();
      ohlas(`Smazáno: ${v.id}.`);
    } catch (chyba) {
      ohlas(`Smazat se nepodařilo: ${(chyba as Error).message}`);
    }
  })();
});

prvek("#vazba-kopirovat").addEventListener("click", () => {
  const zapis = vybrana?.navrh;
  if (!zapis) return;
  void navigator.clipboard.writeText(zapis).then(
    () => ohlas("Most je ve schránce. Ve hře ho načteš tlačítkem Import."),
    () => ohlas("Zkopírovat se nepodařilo; prohlížeč nepustil do schránky."),
  );
});

// ---- Deník hraní ----

const vyberDne = prvek<HTMLSelectElement>("#den");

function prepniZalozku(ktera: string): void {
  for (const z of document.querySelectorAll<HTMLButtonElement>("[data-zalozka]")) {
    z.setAttribute("aria-selected", String(z.dataset.zalozka === ktera));
  }
  for (const panel of document.querySelectorAll<HTMLElement>("[data-panel]")) {
    panel.hidden = panel.dataset.panel !== ktera;
  }
}

// Od zprávy k tomu, co hráč ten den ve hře dělal: otevře deník dne, kdy zpráva přišla, a
// v něm sezení, ze kterého ji hráč poslal.
prvek("#vazba-sezeni").addEventListener("click", () => {
  const v = vybrana;
  if (!v) return;
  const den = v.prijato.slice(0, 10);
  void (async () => {
    try {
      if (![...vyberDne.options].some((m) => m.value === den)) await nactiDny();
      if (![...vyberDne.options].some((m) => m.value === den)) {
        ohlas(`Ze dne ${den} v deníku nic není: hráč měl záznam vypnutý, nebo byl deník toho dne smazán.`);
        return;
      }
      vyberDne.value = den;
      await nactiDen(den);
      const radek = [...prvek("#sezeni tbody").querySelectorAll<HTMLTableRowElement>("tr")].find(
        (r) => r.dataset.vyber === `${v.hlavicka.hrac}/${v.hlavicka.sezeni}`,
      );
      if (!radek) {
        ohlas(`Sezení této zprávy v deníku dne ${den} není: hráč měl nejspíš záznam vypnutý.`);
        return;
      }
      prepniZalozku("denik");
      radek.click();
      radek.scrollIntoView({ block: "center" });
    } catch (chyba) {
      ohlas(`Deník se nepodařilo načíst: ${(chyba as Error).message}`);
    }
  })();
});

function cislo(hodnota: number | null, mist = 0): string {
  return hodnota === null ? "—" : hodnota.toLocaleString("cs-CZ", { maximumFractionDigits: mist });
}

const koruny = (hodnota: number | null): string => (hodnota === null ? "—" : `${hodnota.toLocaleString("cs-CZ")} Kč`);

function vykresliSouhrn(odpoved: OdpovedSouhrnu): void {
  const { souhrn, davek, neuplne } = odpoved;
  const obdobi = odpoved.od === odpoved.do ? odpoved.do : `${odpoved.dny[0] ?? odpoved.od} až ${odpoved.do} (${odpoved.dny.length} dní s deníkem)`;
  prvek("#souhrn-nadpis").textContent = `Souhrn po úrovních · ${obdobi}`;
  prvek("#den-pocty").textContent =
    `${pocet(souhrn.hracu, "hráč", "hráči", "hráčů")} (z toho nových ${souhrn.novych}, na dotyku ${souhrn.dotykovych}) · ` +
    `${souhrn.sezeni} sezení · ${pocet(souhrn.udalosti, "událost", "události", "událostí")} ` +
    `v ${davek === 1 ? "1 dávce" : `${davek.toLocaleString("cs-CZ")} dávkách`} · ` +
    `záznam si ${souhrn.vypnuli === 1 ? "vypnul 1 hráč" : souhrn.vypnuli >= 2 && souhrn.vypnuli <= 4 ? `vypnuli ${souhrn.vypnuli} hráči` : `vypnulo ${souhrn.vypnuli} hráčů`}` +
    (neuplne ? ` · NEÚPLNÉ: ${odpoved.nedokonceno.join(", ")} – dávek je víc, než se stihlo přečíst; zkus souhrn načíst znovu` : "");
  const telo = prvek<HTMLTableSectionElement>("#souhrn tbody");
  telo.replaceChildren(
    ...souhrn.urovne.map((u) => {
      const radek = document.createElement("tr");
      radek.dataset.uroven = u.uroven;
      const vypis = (pocty: Record<string, number>): string =>
        Object.entries(pocty)
          .slice(0, 4)
          .map(([co, pocet]) => `${co} ${pocet}×`)
          .join(", ");
      const zadani = urovne.get(u.uroven);
      const rozpocty = zadani?.rozpocet ? ` · rozpočet ${koruny(zadani.rozpocet)}${zadani.inzenyrskyRozpocet ? `, inž. ${koruny(zadani.inzenyrskyRozpocet)}` : ""}` : "";
      const ceny = u.nejlevnejsiPruchod === null ? "—" : `${koruny(u.nejlevnejsiPruchod)} · ${koruny(u.cenaPruchodu)}${rozpocty}`;
      radek.append(
        bunka(`${u.uroven} ${urovne.get(u.uroven)?.nazev ?? ""}`),
        bunka(cislo(u.hracu), "cislo"),
        bunka(cislo(u.zkousek), "cislo"),
        bunka(cislo(u.pruchodu), "cislo"),
        bunka(cislo(u.hracuSPruchodem), "cislo"),
        bunka(cislo(u.hracuBezZkousky), "cislo"),
        bunka(cislo(u.zkousekDoPruchodu, 1), "cislo"),
        bunka(cislo(u.minutDoPruchodu, 1), "cislo"),
        bunka(`${u.medaile.pruchod} / ${u.medaile.rozpocet} / ${u.medaile.mistrovska}`, "cislo"),
        bunka(`${u.hracuSNapovedou ?? 0} / ${u.hracuSObrysem ?? 0}`, "cislo"),
        bunka(`${u.hracuDoZlomu ?? 0} / ${u.zkousekDoZlomu ?? 0}`, "cislo"),
        bunka(ceny),
        bunka(vypis(u.prvky)),
        bunka(vypis(u.selhani)),
      );
      return radek;
    }),
  );
  prvek("#souhrn-chyby").textContent =
    souhrn.chyb === 0
      ? "Prohlížeče neohlásily žádnou chybu."
      : `Chyby ohlášené prohlížeči (${souhrn.chyb}): ${souhrn.chyby.map((c) => `${c.zprava} (${c.pocet}×)`).join(" · ")}.`;
}

async function otevriSezeni(den: string, s: SezeniDne, radek: HTMLTableRowElement): Promise<void> {
  try {
    const data = await sprava<{ hlavicka: HlavickaDeniku; udalosti: UdalostDeniku[]; neuplne: boolean }>(
      `co=sezeni&den=${den}&hrac=${s.hrac}&slozka=${s.slozka}`,
    );
    for (const r of prvek("#sezeni tbody").querySelectorAll("tr[aria-selected]")) r.setAttribute("aria-selected", "false");
    radek.setAttribute("aria-selected", "true");
    prvek("#detail-sezeni").hidden = false;
    udaje(prvek("#sezeni-udaje"), [
      ["Hráč", s.hrac],
      ["Sezení", s.sezeni],
      ["Zařízení", zarizeni(data.hlavicka)],
      ["Událostí", `${data.udalosti.length}${data.neuplne ? " (neúplné)" : ""}`],
    ]);
    const platno = prvek<HTMLCanvasElement>("#sezeni-most");
    platno.hidden = true;
    vypisUdalosti(prvek("#sezeni-udalosti"), data.udalosti, platno);
    ohlas("");
  } catch (chyba) {
    ohlas(`Sezení se nepodařilo načíst: ${(chyba as Error).message}`);
  }
}

const vyberObdobi = prvek<HTMLSelectElement>("#obdobi");

/** První den období, které končí dnem `den` a trvá zvolený počet dní (0 = od začátku). */
function zacatekObdobi(den: string): string {
  const dni = Number(vyberObdobi.value);
  if (dni === 0) return "2000-01-01";
  const zacatek = new Date(`${den}T00:00:00Z`);
  zacatek.setUTCDate(zacatek.getUTCDate() - (dni - 1));
  return zacatek.toISOString().slice(0, 10);
}

/**
 * Souhrn za období. Server na jednu žádost přečte jen omezený počet dávek a ukládá si, kam
 * u kterého dne došel; žádost se proto opakuje, dokud má co dopočítat.
 */
async function nactiSouhrn(den: string): Promise<void> {
  const dotaz = `co=souhrn&od=${zacatekObdobi(den)}&do=${den}`;
  let odpoved = await sprava<OdpovedSouhrnu>(dotaz);
  // Opakuje se, dokud je co dopočítat a každé kolo něco přidá.
  for (let kolo = 0; kolo < 200 && odpoved.neuplne; kolo++) {
    ohlas(`Počítám souhrn: přečteno ${odpoved.davek.toLocaleString("cs-CZ")} dávek, zbývá dopočítat ${pocet(odpoved.nedokonceno.length, "den", "dny", "dní")}…`);
    const dalsi = await sprava<OdpovedSouhrnu>(dotaz);
    const pokrok = dalsi.davek > odpoved.davek || dalsi.nedokonceno.length < odpoved.nedokonceno.length;
    odpoved = dalsi;
    if (!pokrok) break;
  }
  vykresliSouhrn(odpoved);
  ohlas("");
}

async function nactiDen(den: string): Promise<void> {
  prvek("#detail-sezeni").hidden = true;
  const [, seznam] = await Promise.all([nactiSouhrn(den), sprava<{ sezeni: SezeniDne[] }>(`co=den&den=${den}`)]);
  prvek<HTMLTableSectionElement>("#sezeni tbody").replaceChildren(
    ...seznam.sezeni.map((s) => {
      const radek = document.createElement("tr");
      radek.dataset.vyber = `${s.hrac}/${s.sezeni}`;
      radek.append(
        bunka(s.hrac),
        bunka(`${cas(new Date(s.zacatek).toISOString())} · ${s.sezeni}`),
        bunka(hodina(s.prvni) === hodina(s.posledni) ? hodina(s.prvni) : `${hodina(s.prvni)}–${hodina(s.posledni)}`),
        bunka(String(s.davek), "cislo"),
      );
      radek.addEventListener("click", () => void otevriSezeni(den, s, radek));
      return radek;
    }),
  );
}

async function nactiDny(): Promise<void> {
  const { dny } = await sprava<{ dny: string[] }>("co=dny");
  vyberDne.replaceChildren(
    ...dny.map((den) => {
      const moznost = document.createElement("option");
      moznost.value = den;
      moznost.textContent = den;
      return moznost;
    }),
  );
  if (dny.length === 0) {
    prvek("#den-pocty").textContent = "Deník je zatím prázdný.";
    prvek("#souhrn tbody").replaceChildren();
    prvek("#sezeni tbody").replaceChildren();
    prvek("#souhrn-chyby").textContent = "";
    prvek("#detail-sezeni").hidden = true;
    return;
  }
  await nactiDen(dny[0]!);
}

vyberDne.addEventListener("change", () => {
  void nactiDen(vyberDne.value).catch((chyba: unknown) => ohlas(`Den se nepodařilo načíst: ${(chyba as Error).message}`));
});

vyberObdobi.addEventListener("change", () => {
  if (!vyberDne.value) return;
  void nactiSouhrn(vyberDne.value).catch((chyba: unknown) => ohlas(`Souhrn se nepodařilo načíst: ${(chyba as Error).message}`));
});

prvek("#smazat-den").addEventListener("click", () => {
  const den = vyberDne.value;
  if (!den || !window.confirm(`Smazat celý deník hraní ze dne ${den}? Nejde to vrátit.`)) return;
  void (async () => {
    try {
      let smazano = 0;
      for (let kolo = 0; kolo < 200; kolo++) {
        const odpoved = await sprava<{ smazano: number; zbyva: number }>("co=smazat", { den });
        smazano += odpoved.smazano;
        if (odpoved.zbyva === 0) break;
        ohlas(`Mažu deník ${den}: zbývá ${odpoved.zbyva} dávek…`);
      }
      await nactiDny();
      ohlas(`Smazáno: deník ${den} (${smazano} dávek).`);
    } catch (chyba) {
      ohlas(`Smazat se nepodařilo: ${(chyba as Error).message}`);
    }
  })();
});

prvek("#export").addEventListener("click", () => {
  const den = vyberDne.value;
  if (!den) return;
  void (async () => {
    try {
      // Den s mnoha dávkami server vydává po částech.
      const davky: unknown[] = [];
      let preskocit: number | null = 0;
      while (preskocit !== null) {
        const cast: { davky: unknown[]; dalsi: number | null } = await sprava(`co=export&den=${den}&preskocit=${preskocit}`);
        davky.push(...cast.davky);
        preskocit = cast.dalsi;
        if (preskocit !== null) ohlas(`Stahuji deník ${den}: ${davky.length} dávek…`);
      }
      ohlas("");
      const odkaz = document.createElement("a");
      odkaz.href = URL.createObjectURL(new Blob([JSON.stringify({ den, davky })], { type: "application/json" }));
      odkaz.download = `mostmistr-denik-${den}.json`;
      odkaz.click();
      URL.revokeObjectURL(odkaz.href);
    } catch (chyba) {
      ohlas(`Stáhnout se nepodařilo: ${(chyba as Error).message}`);
    }
  })();
});

// ---- Přihlášení a záložky ----

for (const zalozka of document.querySelectorAll<HTMLButtonElement>("[data-zalozka]")) {
  zalozka.addEventListener("click", () => prepniZalozku(zalozka.dataset.zalozka ?? ""));
}

async function prihlas(): Promise<void> {
  // Heslo jde v hlavičce žádosti a ta snese jen znaky bez diakritiky.
  if (/[^\x20-\x7e]/.test(heslo)) {
    obsah.hidden = true;
    document.body.dataset.sprava = "odmitnuto";
    ohlas("Heslo správce smí obsahovat jen písmena bez diakritiky, číslice a běžné znaky.");
    return;
  }
  ohlas("Přihlašuji…");
  try {
    const overeni = await sprava<{ prostredi: string }>("co=overeni");
    prvek("#uloziste").textContent =
      overeni.prostredi === "production"
        ? "Data ostrého webu."
        : `Data náhledů a pokusných nasazení (${overeni.prostredi}); ostrý web má vlastní úložiště.`;
  } catch (chyba) {
    obsah.hidden = true;
    document.body.dataset.sprava = "odmitnuto";
    const stav = chyba instanceof ChybaSpravy ? chyba.stav : 0;
    if (stav === 401) ohlas("Nesprávné heslo správce.");
    else if (stav === 429) ohlas("Příliš mnoho pokusů za sebou. Chvíli počkej a zkus to znovu.");
    else if (stav === 503) ohlas(`Server heslo správce nezná: ${(chyba as Error).message}.`);
    else if (stav === 404 || stav === 0) ohlas("Správa na této adrese neběží (funkce Netlify nejsou nasazené, nebo je stránka otevřená mimo Netlify).");
    else ohlas(`Přihlášení se nepovedlo: ${(chyba as Error).message}`);
    return;
  }
  // Heslo sedí: stránka se ukáže, i kdyby se některá data načíst nepodařila (jinak by se
  // k tlačítkům na mazání nešlo dostat právě tehdy, když je dat příliš).
  obsah.hidden = false;
  prvek("#odhlasit").hidden = false;
  document.body.dataset.sprava = "prihlaseno";
  try {
    window.sessionStorage.setItem(KLIC_HESLA, heslo);
  } catch {
    // Bez paměti panelu se heslo po obnovení stránky zadá znovu.
  }
  ohlas("");
  const potize: string[] = [];
  await nactiVazby().catch((chyba: unknown) => potize.push(`zpětnou vazbu (${(chyba as Error).message})`));
  await nactiDny().catch((chyba: unknown) => potize.push(`deník (${(chyba as Error).message})`));
  if (potize.length > 0) ohlas(`Nepodařilo se načíst ${potize.join(" a ")}.`);
}

prvek<HTMLFormElement>("#prihlaseni").addEventListener("submit", (udalost) => {
  udalost.preventDefault();
  heslo = poleHesla.value;
  void prihlas();
});

prvek("#odhlasit").addEventListener("click", () => {
  heslo = "";
  poleHesla.value = "";
  try {
    window.sessionStorage.removeItem(KLIC_HESLA);
  } catch {
    // Nic k odstranění.
  }
  obsah.hidden = true;
  prvek("#odhlasit").hidden = true;
  document.body.dataset.sprava = "odhlaseno";
  ohlas("Odhlášeno.");
});

if (heslo) {
  poleHesla.value = heslo;
  void prihlas();
}
