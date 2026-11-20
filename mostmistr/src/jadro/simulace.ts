// Řídicí smyčka simulace: krokuje soustavu, průběžně posuzuje namáhání, provádí porušení
// a po každé změně stavby znovu volí krok výpočtu a tlumení.

import { krok, spoctiSily, type NastaveniKroku } from "./integrator";
import { nejvyssiFrekvence, vlastniTvarySoustavy } from "./matice";
import { vyhodnotNamahani } from "./namahani";
import { najdiPoruseni, provedPoruseni, type Poruseni } from "./poruseni";
import { nastavTuhostPrvku, prepoctiHmoty, type Soustava } from "./soustava";
import { betaProUtlum, frekvenceProKrok, zvolKrok } from "./stabilita";
import { volneStupne } from "./stupne";
import { pridejTlumice } from "./tlumice";
import { vytvorModalniTlumeni } from "./tlumeni";

/** Po kolika krocích se posuzuje namáhání a hledá porušení. */
const INTERVAL_POSUDKU = 4;
/** Časová konstanta vyhlazení využití v sekundách: špičky kratší než tohle prut nezlomí. */
const VYHLAZENI = 0.005;
/** Nejvíc porušení zpracovaných při jednom posudku; další přijdou na řadu při příštím. */
const NEJVIC_PORUSENI_NAJEDNOU = 4;
/** Kolik vlastních tvarů dostane přímo zadaný útlum. */
const TLUMENYCH_TVARU = 10;

/**
 * Zatížení, které do soustavy vstupuje zvenčí: provoz, budič, zkušební síla.
 * Simulace ho volá v pevném pořadí, takže výsledek nezávisí na tom, kdy přišlo porušení.
 */
export interface Zatizeni {
  /**
   * Přičte síly ke styčníkům a prvkům podle okamžitého stavu soustavy v čase `cas`.
   * Volá se po každém výpočtu sil mostu, po porušení i dvakrát pro stejný čas,
   * proto nesmí měnit vlastní stav.
   */
  pridejSily(s: Soustava, cas: number): void;
  /** Posune vlastní stav z času `cas` o krok `dt`. Volá se jednou na začátku každého kroku. */
  posun?(s: Soustava, cas: number, dt: number): void;
  /** Stavba soustavy se změnila: indexy styčníků a prvků je třeba znovu dohledat. */
  poZmene?(s: Soustava): void;
  /** Krok výpočtu se změnil (na začátku a po porušení). */
  zmenaKroku?(dt: number): void;
}

export interface NastaveniSimulace {
  /** Tíhové zrychlení, m/s². */
  tiha: number;
  /** Poměrný útlum konstrukce (stejný pro všechny tlumené tvary). */
  utlum: number;
  zatizeni?: Zatizeni;
  /**
   * Volné stupně, ze kterých se počítají vlastní tvary pro tlumení. Výchozí jsou všechny;
   * vozidla a jiná tělesa s vlastními tlumiči se sem nedávají.
   */
  tlumeneStupne?: Int32Array;
}

/** Porušení i s časem, kdy nastalo. */
export interface UdalostPoruseni extends Poruseni {
  cas: number;
  krok: number;
}

export class Simulace {
  readonly soustava: Soustava;
  readonly udalosti: UdalostPoruseni[] = [];
  /** Výpočet se rozpadl na neplatná čísla; další krokování nemá smysl. */
  rozpadla = false;

  readonly #nastaveni: NastaveniSimulace;
  readonly #krok: NastaveniKroku;
  #cas = 0;
  #kroku = 0;
  #doPosudku = INTERVAL_POSUDKU;
  /** Nejvyšší frekvence neporušené soustavy; úlomky se změkčí tak, aby ji nepřevýšily. */
  #vychoziOmega = 0;
  /** Tlumení úměrné hmotě, které po prvním porušení nahradí tlumení vlastních tvarů. */
  #alfaPoPoruseni = 0;

  /**
   * Soustava má být ve výchozí rovnováze (viz `najdiRovnovahu`), jinak se na začátku
   * rozkmitá. Konstruktor určí krok, tlumení a výchozí síly.
   */
  constructor(soustava: Soustava, nastaveni: NastaveniSimulace) {
    this.soustava = soustava;
    this.#nastaveni = nastaveni;
    this.#krok = { dt: 0, tiha: nastaveni.tiha, alfa: 0 };
    const zatizeni = nastaveni.zatizeni;
    if (zatizeni) {
      // Integrátor volá další síly po posunu, tedy pro stav na konci kroku.
      this.#krok.dalsiSily = (s) => zatizeni.pridejSily(s, this.#cas + this.#krok.dt);
    }

    this.#vychoziOmega = nejvyssiFrekvence(soustava, volneStupne(soustava));
    this.#nastavKrokATlumeniPrvku(this.#vychoziOmega);

    // Tlumení vlastních tvarů; soustava, která není tvarově určitá, ho mít nemůže.
    const stupne = nastaveni.tlumeneStupne ?? volneStupne(soustava);
    const tvary = stupne.length > 0 ? vlastniTvarySoustavy(soustava, stupne, TLUMENYCH_TVARU) : null;
    if (tvary) {
      this.#krok.modalni = vytvorModalniTlumeni(soustava, stupne, tvary, nastaveni.utlum, this.#krok.dt);
      this.#alfaPoPoruseni = 2 * nastaveni.utlum * tvary.omega[0]!;
    } else {
      this.#alfaPoPoruseni = 2 * nastaveni.utlum * 2 * Math.PI;
      this.#krok.alfa = this.#alfaPoPoruseni;
    }
    this.#spoctiSily();
  }

  get cas(): number {
    return this.#cas;
  }

  get kroku(): number {
    return this.#kroku;
  }

  /** Aktuální krok výpočtu v sekundách; po porušení se může zkrátit. */
  get dt(): number {
    return this.#krok.dt;
  }

  get porusena(): boolean {
    return this.udalosti.length > 0;
  }

  /** Posune simulaci o jeden krok. */
  krok(): void {
    const s = this.soustava;
    this.#nastaveni.zatizeni?.posun?.(s, this.#cas, this.#krok.dt);
    krok(s, this.#krok);
    this.#kroku += 1;
    this.#cas += this.#krok.dt;

    this.#doPosudku -= 1;
    if (this.#doPosudku > 0) return;
    this.#doPosudku = INTERVAL_POSUDKU;

    const vaha = Math.min(1, (INTERVAL_POSUDKU * this.#krok.dt) / VYHLAZENI);
    vyhodnotNamahani(s, this.#nastaveni.tiha, vaha);

    let zmeneno = false;
    for (let i = 0; i < NEJVIC_PORUSENI_NAJEDNOU; i++) {
      const poruseni = najdiPoruseni(s);
      if (!poruseni) break;
      provedPoruseni(s, poruseni);
      this.udalosti.push({ ...poruseni, cas: this.#cas, krok: this.#kroku });
      zmeneno = true;
    }
    if (zmeneno) this.#poZmeneStavby();

    // Pojistka: neplatná čísla se šíří celou soustavou, stačí zkontrolovat jeden součet.
    let soucet = 0;
    for (let i = 0; i < s.pocetStycniku; i++) soucet += s.x[i]! + s.y[i]!;
    if (!Number.isFinite(soucet)) this.rozpadla = true;
  }

  /** Nastaví krok a tlumení úměrné tuhosti podle nejvyšší frekvence soustavy. */
  #nastavKrokATlumeniPrvku(omegaMax: number): void {
    const omega = frekvenceProKrok(omegaMax);
    this.#krok.dt = zvolKrok(omega);
    this.soustava.beta.fill(betaProUtlum(omega));
    this.#nastaveni.zatizeni?.zmenaKroku?.(this.#krok.dt);
  }

  /** Síly mostu i zatížení pro okamžitý stav; z nich vychází první půlkrok rychlostí. */
  #spoctiSily(): void {
    spoctiSily(this.soustava, this.#nastaveni.tiha, this.#krok.alfa, this.#krok.modalni);
    this.#nastaveni.zatizeni?.pridejSily(this.soustava, this.#cas);
    pridejTlumice(this.soustava, this.#krok.dt);
  }

  #poZmeneStavby(): void {
    const s = this.soustava;
    this.#nastaveni.zatizeni?.poZmene?.(s);
    // Vlastní tvary neporušené konstrukce už neplatí; dál tlumí jen hmota.
    delete this.#krok.modalni;
    this.#krok.alfa = this.#alfaPoPoruseni;

    // Utržené kusy nic nenesou. Když jsou krátké, změkčí se tak, aby jejich podélné
    // kmitání nebylo rychlejší než nejvyšší frekvence původní soustavy a nezkracovalo krok.
    let zmekceno = false;
    for (let e = 0; e < s.pocetPrvku; e++) {
      if (s.utrzeny[e] !== 1) continue;
      const delka = s.klidovaDelka[e]!;
      const omega2 = (4 * s.EA[e]!) / (s.hmotnostNaMetr[e]! * delka * delka);
      const mez2 = this.#vychoziOmega * this.#vychoziOmega;
      if (omega2 > mez2) {
        const pomer = mez2 / omega2;
        s.EA[e] = s.EA[e]! * pomer;
        s.EI[e] = s.EI[e]! * pomer;
        nastavTuhostPrvku(s, e);
        zmekceno = true;
      }
    }
    if (zmekceno) prepoctiHmoty(s);

    // Rozdělené pruty, které dál nesou, mají kratší díly a krok se podle nich zkrátí.
    const omegaMax = nejvyssiFrekvence(s, volneStupne(s));
    if (omegaMax > 0) this.#nastavKrokATlumeniPrvku(Math.max(omegaMax, this.#vychoziOmega));
    this.#spoctiSily();
  }
}
