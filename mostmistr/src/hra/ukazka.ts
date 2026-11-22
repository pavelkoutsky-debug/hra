// Ukázka v okně se zadáním: dva mosty vedle sebe ve stejné situaci, jeden bez prvku, který
// úroveň učí, a druhý s ním. Oba se doopravdy spočítají v pracovním vlákně a přehrávají se
// dokola současně; pohyb mostu je zvětšený, aby bylo houpání vidět.

import type { Obdelnik } from "../data/geometrie";
import type { Uroven } from "../data/uroven";
import { VERZE_FYZIKY } from "../jadro/verze";
import { cislo } from "../ui/formaty";
import { t } from "../ui/slovnik";
import { celyVyrez } from "../vykres/kamera";
import { nakresliKonstrukci } from "../vykres/konstrukce";
import { tloustkaPrutu } from "../vykres/navrh";
import { nakresliProvoz } from "../vykres/provoz";
import { nakresliVykres } from "../vykres/vykres";
import { hezkeZvetseni, nejvetsiVychylka, zvetsiPohyb } from "../vykres/zvetseni";
import { KlientZkousky } from "../zkouska/klient";
import type { PopisUcastnika } from "../zkouska/provoz";
import type { VysledekZkousky } from "../zkouska/protokol";
import { prazdnySnimek, Zaznam, type Snimek } from "../zkouska/zaznam";
import { nasadaUrovne } from "../../urovne/index";
import type { StranaUkazky, UkazkaUrovne } from "../../urovne/ukazky";

/** Jak velká má největší výchylka mostu po zvětšení vypadat, v metrech světa. */
const VIDITELNA_VYCHYLKA = 1.1;
/** Pauza mezi koncem přehrávání a novým začátkem, v sekundách. */
const PAUZA = 1.6;

interface Strana {
  zadani: StranaUkazky;
  canvas: HTMLCanvasElement;
  stav: HTMLElement;
  koren: HTMLElement;
  klient: KlientZkousky | null;
  zaznam: Zaznam;
  ucastnici: PopisUcastnika[];
  vysledek: VysledekZkousky | null;
  /** Polohy z prvního snímku; proti nim se zvětšuje pohyb. */
  vychozi: Float32Array | null;
  snimek: Snimek;
  zvetsene: Float32Array;
}

/** Výřez světa, který ukázka kreslí: most s kouskem břehů a s tím, co je pod ním. */
function vyrezUkazky(uroven: Uroven): Obdelnik {
  const trasa = uroven.trasy[0]!;
  const rozpeti = trasa.konec.x - trasa.zacatek.x;
  const okraj = Math.max(3, 0.14 * rozpeti);
  let dno = trasa.zacatek.y - 0.2 * rozpeti;
  for (const kotva of uroven.kotvy) dno = Math.min(dno, kotva.y - 1.5);
  return {
    xMin: trasa.zacatek.x - okraj,
    xMax: trasa.konec.x + okraj,
    yMin: dno,
    yMax: trasa.zacatek.y + 0.22 * rozpeti,
  };
}

export class Ukazka {
  readonly #koren: HTMLElement;
  readonly #strany: Strana[];
  readonly #poznamka: HTMLElement;
  #snimekObrazu = 0;
  #bezi = false;
  #cas = 0;
  #minuly: number | null = null;
  #zvetseni = 1;
  #delka = 0;
  /** Kolikrát rychleji než ve skutečnosti se děj přehrává. */
  readonly #rychlost: number;

  /**
   * `koren` je oddíl okna s ukázkou: obsahuje dva prvky `[data-strana]`, každý s plátnem
   * a s výstupem `[data-stav]`, a poznámku `[data-poznamka]` o zvětšení pohybu.
   */
  constructor(koren: HTMLElement, zadani: UkazkaUrovne) {
    this.#koren = koren;
    this.#rychlost = zadani.rychlost ?? 1;
    this.#poznamka = koren.querySelector<HTMLElement>("[data-poznamka]")!;
    this.#strany = (["a", "b"] as const).map((ktera) => {
      const uzel = koren.querySelector<HTMLElement>(`[data-strana="${ktera}"]`)!;
      return {
        zadani: zadani[ktera],
        koren: uzel,
        canvas: uzel.querySelector("canvas")!,
        stav: uzel.querySelector<HTMLElement>("[data-stav]")!,
        klient: null,
        zaznam: new Zaznam(),
        ucastnici: [],
        vysledek: null,
        vychozi: null,
        snimek: prazdnySnimek(),
        zvetsene: new Float32Array(0),
      };
    });
  }

  /** Spočítá obě strany a začne je přehrávat dokola. */
  spust(): void {
    if (this.#bezi) return;
    this.#bezi = true;
    this.#koren.dataset.stav = "pocita";
    this.#poznamka.textContent = "";
    for (const strana of this.#strany) {
      strana.zaznam = new Zaznam();
      strana.vysledek = null;
      strana.vychozi = null;
      strana.stav.textContent = t("ukazka.pocitaSe");
      delete strana.koren.dataset.pruchod;
      const klient = new KlientZkousky();
      strana.klient = klient;
      klient.poslouchej((zprava) => {
        if (strana.klient !== klient) return;
        if (zprava.typ === "zacatek") strana.ucastnici = zprava.ucastnici;
        else if (zprava.typ === "zaznam") {
          for (const stavba of zprava.topologie) strana.zaznam.pridejTopologii(stavba);
          for (const s of zprava.snimky) {
            if (!strana.vychozi) strana.vychozi = s.polohy.slice();
            strana.zaznam.pridej(s);
          }
        } else if (zprava.typ === "konec") {
          strana.vysledek = zprava.vysledek;
          klient.ukonci();
          strana.klient = null;
          this.#poVypoctu();
        } else if (zprava.typ === "chyba") {
          strana.stav.textContent = t("ukazka.nejde");
          klient.ukonci();
          strana.klient = null;
        }
      });
      const { uroven, navrh } = strana.zadani;
      klient.posli({ typ: "start", vstup: { uroven, navrh, nasada: nasadaUrovne(uroven), verzeFyziky: VERZE_FYZIKY } });
    }
    this.#nakresli();
  }

  /** Zastaví přehrávání i rozpočítané výpočty. */
  zastav(): void {
    this.#bezi = false;
    cancelAnimationFrame(this.#snimekObrazu);
    for (const strana of this.#strany) {
      strana.klient?.ukonci();
      strana.klient = null;
    }
  }

  /** Když jsou spočítané obě strany: zvolí zvětšení a pustí přehrávání. */
  #poVypoctu(): void {
    if (!this.#bezi || this.#strany.some((s) => s.vysledek === null)) return;
    // Zvětšuje se jen pohyb celého mostu; jakmile se něco zlomí nebo sjede z podpory,
    // je pád vidět i bez zvětšení.
    const cely = this.#strany.every((s) => s.zaznam.topologie.length === 1);
    let vychylka = 0;
    if (cely) {
      for (const strana of this.#strany) {
        const stavba = strana.zaznam.topologie[0];
        if (!stavba || !strana.vychozi) continue;
        for (const s of strana.zaznam.snimky) {
          vychylka = Math.max(vychylka, nejvetsiVychylka(stavba, strana.vychozi, s.polohy));
        }
      }
    }
    this.#zvetseni = cely ? hezkeZvetseni(vychylka, VIDITELNA_VYCHYLKA) : 1;
    this.#delka = Math.max(...this.#strany.map((s) => s.vysledek!.trvani));
    const poznamky: string[] = [];
    if (this.#zvetseni > 1) poznamky.push(t("ukazka.zvetseni", { nasobek: this.#zvetseni }));
    if (this.#rychlost !== 1) poznamky.push(t("ukazka.zrychleni", { nasobek: this.#rychlost }));
    this.#poznamka.textContent = poznamky.join(" ");
    for (const strana of this.#strany) {
      const v = strana.vysledek!;
      strana.koren.dataset.pruchod = String(v.pruchod);
      if (v.komfort) strana.koren.dataset.kmitani = v.komfort.zrychleni.toFixed(2);
    }
    this.#koren.dataset.stav = "hraje";
    this.#koren.dataset.zvetseni = String(this.#zvetseni);
    this.#cas = 0;
    this.#minuly = null;
    const krok = (ted: number): void => {
      if (!this.#bezi) return;
      const uplynulo = this.#minuly === null ? 0 : Math.min(0.1, (ted - this.#minuly) / 1000);
      this.#minuly = ted;
      this.#cas += uplynulo * this.#rychlost;
      if (this.#cas > this.#delka + PAUZA * this.#rychlost) this.#cas = 0;
      this.#nakresli();
      this.#snimekObrazu = requestAnimationFrame(krok);
    };
    this.#snimekObrazu = requestAnimationFrame(krok);
  }

  #nakresli(): void {
    for (const strana of this.#strany) this.#nakresliStranu(strana);
  }

  #nakresliStranu(strana: Strana): void {
    const { canvas } = strana;
    const hustota = window.devicePixelRatio || 1;
    const obrys = canvas.getBoundingClientRect();
    const rozmer = { sirka: Math.max(1, obrys.width), vyska: Math.max(1, obrys.height) };
    const sirka = Math.round(rozmer.sirka * hustota);
    const vyska = Math.round(rozmer.vyska * hustota);
    if (canvas.width !== sirka) canvas.width = sirka;
    if (canvas.height !== vyska) canvas.height = vyska;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;
    ctx.setTransform(hustota, 0, 0, hustota, 0, 0);

    const { uroven, navrh } = strana.zadani;
    const kamera = celyVyrez(vyrezUkazky(uroven), rozmer, 2);
    nakresliVykres(ctx, { uroven, kamera, rozmer, kurzor: null, nahled: true, bezKot: true });

    const cas = Math.min(this.#cas, strana.vysledek?.trvani ?? 0);
    const stavba = strana.zaznam.stavV(cas, strana.snimek);
    if (!stavba) return;
    const snimek = strana.snimek;
    // Zvětšený pohyb jen u celého mostu; po porušení se kreslí skutečné polohy.
    let kresleny = snimek;
    if (this.#zvetseni > 1 && strana.vychozi && snimek.topologie === 0) {
      strana.zvetsene = zvetsiPohyb(stavba, strana.vychozi, snimek.polohy, this.#zvetseni, strana.zvetsene);
      kresleny = { ...snimek, polohy: strana.zvetsene };
    }
    nakresliKonstrukci(ctx, kamera, rozmer, stavba, kresleny, 0, (e) => {
      const prut = navrh.pruty[stavba.prut[e]!];
      return prut ? tloustkaPrutu(prut.prvek, kamera.meritko) : undefined;
    });
    nakresliProvoz(ctx, kamera, rozmer, strana.ucastnici, kresleny);

    // Pod plátnem: během děje okamžité kmitání, na konci verdikt.
    const vysledek = strana.vysledek;
    if (!vysledek) return;
    let text: string;
    if (this.#cas >= vysledek.trvani) {
      const verdikt = t(vysledek.pruchod ? "ukazka.obstal" : "ukazka.neobstal");
      const podrobnost =
        vysledek.spadlo > 0
          ? t("ukazka.spadlo", { spadlo: vysledek.spadlo, pocet: vysledek.ucastniku })
          : vysledek.komfort
            ? t("ukazka.nejvic", { zrychleni: cislo(vysledek.komfort.zrychleni, 1) })
            : "";
      text = podrobnost ? `${verdikt} · ${podrobnost}` : verdikt;
      strana.stav.dataset.verdikt = vysledek.pruchod ? "obstal" : "neobstal";
    } else {
      text = vysledek.komfort ? t("ukazka.kmitani", { zrychleni: cislo(snimek.kmitani, 1) }) : "";
      delete strana.stav.dataset.verdikt;
    }
    if (strana.stav.textContent !== text) strana.stav.textContent = text;
  }
}
