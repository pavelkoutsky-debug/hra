// Řídicí smyčka simulace: krokuje soustavu, průběžně posuzuje namáhání, provádí porušení
// a po každé změně stavby znovu volí krok výpočtu a tlumení.

import { krok, spoctiSily, type NastaveniKroku } from "./integrator";
import { uvolniSjeta, type Loziska } from "./loziska";
import { frekvenceProKrokovani, vlastniTvarySoustavy } from "./matice";
import { rozhodujiciVelicina, vnitrniSily, vyhodnotNamahani } from "./namahani";
import { najdiPoruseni, provedPoruseni, type Poruseni } from "./poruseni";
import { nastavTuhostPrvku, prepoctiHmoty, type Soustava } from "./soustava";
import { betaProUtlum, frekvenceProKrok, UTLUM_NEJVYSSI_FREKVENCE, zvolKrok } from "./stabilita";
import { volneStupne } from "./stupne";
import { pridejTlumice } from "./tlumice";
import { utlumyTvaru, vytvorModalniTlumeni } from "./tlumeni";
import {
  NEJVYSSI_ALFA,
  pridejTlumeniHmotou,
  vytvorTlumeniHmotou,
  type TlumeniHmotou,
} from "./tlumeniHmotou";

/** Po kolika krocích se posuzuje namáhání a hledá porušení. */
const INTERVAL_POSUDKU = 4;
/** Časová konstanta vyhlazení využití v sekundách: špičky kratší než tohle prut nezlomí. */
const VYHLAZENI = 0.005;
/** Nejvíc porušení zpracovaných při jednom posudku; další přijdou na řadu při příštím. */
const NEJVIC_PORUSENI_NAJEDNOU = 4;
/** Kolik vlastních tvarů dostane přímo zadaný útlum. */
const TLUMENYCH_TVARU = 10;
/**
 * Rychlost styčníku v m/s, nad kterou se výpočet považuje za rozpadlý. Troska padající
 * z půlkilometrové výšky má 100 m/s; švihnutí přetrženého lana pár set.
 */
const NEJVYSSI_RYCHLOST = 2000;

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
  /**
   * O kolik zatížení zvýší čtverec nejvyšší frekvence soustavy (rad²/s²), když na ni působí
   * přes pružiny (pneumatiky). Simulace podle toho zkrátí krok.
   */
  pridavnaFrekvence?(s: Soustava): number;
}

export interface NastaveniSimulace {
  /** Tíhové zrychlení, m/s². */
  tiha: number;
  /** Poměrný útlum konstrukce (stejný pro všechny tlumené tvary). */
  utlum: number;
  /**
   * Poměrný útlum materiálu každého prvku. Když je zadán, dostane každý tlumený tvar
   * útlum vážený podle toho, které prvky se v něm deformují, a `utlum` se použije
   * jen tam, kde tvary nejsou (po porušení).
   */
  utlumPrvku?: Float64Array;
  zatizeni?: Zatizeni;
  /**
   * Volné stupně, ze kterých se počítají vlastní tvary pro tlumení. Výchozí jsou všechny;
   * vozidla a jiná tělesa s vlastními tlumiči se sem nedávají.
   */
  tlumeneStupne?: Int32Array;
  /**
   * Poměrný útlum, který tlumení úměrné tuhosti prvků dodá nejvyšší frekvenci soustavy.
   * Výchozí hodnota potlačuje numerické zvonění; nula ho vypne (ověřování zachování energie).
   */
  utlumNejvyssi?: number;
  /**
   * Násobek zvoleného kroku, nejvýš 1. Slouží ke kontrole, že výsledek na kroku
   * nezávisí: s polovičním krokem má vyjít v toleranci totéž.
   */
  zkraceniKroku?: number;
  /** Posuvné podpory s konečnou úložnou délkou; konec mostu, který z nich sjede, podporu ztratí. */
  loziska?: Loziska;
}

/** Konec mostu sjel z posuvné podpory. */
export interface UdalostSjeti {
  cas: number;
  krok: number;
  stycnik: number;
}

/** Porušení i s časem, kdy nastalo, a s tím, co prut v tu chvíli nesl. */
export interface UdalostPoruseni extends Poruseni {
  cas: number;
  krok: number;
  /** Veličina, která rozhodla (N u tahu, tlaku, vzpěru a smyku, N·m u ohybu), a únosnost prutu v ní. */
  velicina: number;
  unosnost: number;
}

export class Simulace {
  readonly soustava: Soustava;
  readonly udalosti: UdalostPoruseni[] = [];
  /** Konce mostu, které sjely z posuvné podpory. */
  readonly sjeti: UdalostSjeti[] = [];
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
  #hmotou: TlumeniHmotou | null = null;
  /** Styčníky konstrukce (1) a břemen (0); břemena mají vlastní tlumiče a tady se netlumí. */
  #tlumeny: Uint8Array | null = null;

  /**
   * Soustava má být ve výchozí rovnováze (viz `najdiRovnovahu`), jinak se na začátku
   * rozkmitá. Konstruktor určí krok, tlumení a výchozí síly.
   */
  constructor(soustava: Soustava, nastaveni: NastaveniSimulace) {
    this.soustava = soustava;
    this.#nastaveni = nastaveni;
    this.#krok = { dt: 0, tiha: nastaveni.tiha, alfa: 0 };
    // Integrátor volá další síly po posunu, tedy pro stav na konci kroku.
    this.#krok.dalsiSily = (s) => this.#pridejDalsiSily(s, this.#cas + this.#krok.dt);
    if (nastaveni.tlumeneStupne) {
      this.#tlumeny = new Uint8Array(soustava.pocetStycniku);
      for (const kod of nastaveni.tlumeneStupne) this.#tlumeny[(kod / 3) | 0] = 1;
    }

    this.#vychoziOmega = this.#nejvyssiFrekvence();
    this.#nastavKrokATlumeniPrvku(this.#vychoziOmega);

    // Tlumení vlastních tvarů; soustava, která není tvarově určitá, ho mít nemůže.
    const stupne = nastaveni.tlumeneStupne ?? volneStupne(soustava);
    const tvary = stupne.length > 0 ? vlastniTvarySoustavy(soustava, stupne, TLUMENYCH_TVARU) : null;
    if (tvary) {
      // Tlumení úměrné tuhosti prvků dává tvaru s frekvencí ω útlum β·ω/2. O ten se zadaný
      // útlum zmenší, aby měl každý tlumený tvar dohromady právě tolik, kolik má mít.
      const beta = soustava.beta[0] ?? 0;
      const zadane = nastaveni.utlumPrvku ? utlumyTvaru(soustava, stupne, tvary, nastaveni.utlumPrvku) : null;
      const utlumy = new Float64Array(tvary.omega.length);
      for (let i = 0; i < utlumy.length; i++) {
        utlumy[i] = Math.max(0, (zadane ? zadane[i]! : nastaveni.utlum) - 0.5 * beta * tvary.omega[i]!);
      }
      this.#krok.modalni = vytvorModalniTlumeni(soustava, stupne, tvary, utlumy, this.#krok.dt);
      this.#alfaPoPoruseni = Math.min(NEJVYSSI_ALFA, 2 * nastaveni.utlum * tvary.omega[0]!);
    } else {
      // Bez vlastních tvarů není podle čeho tlumení ladit; bere se, jako by kmitala na 1 Hz.
      this.#alfaPoPoruseni = Math.min(NEJVYSSI_ALFA, 2 * nastaveni.utlum * 2 * Math.PI);
      this.#hmotou = vytvorTlumeniHmotou(soustava, this.#alfaPoPoruseni, this.#tlumeny);
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

  /** Stavba už není ta původní: něco se zlomilo, nebo konec mostu sjel z podpory. */
  get porusena(): boolean {
    return this.udalosti.length > 0 || this.sjeti.length > 0;
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
      // Co prut nesl, se musí přečíst dřív, než se rozlomí.
      const sily = vnitrniSily(s, poruseni.prvek, this.#nastaveni.tiha);
      const { velicina, unosnost } = rozhodujiciVelicina(s, poruseni.prvek, poruseni.zpusob, sily);
      provedPoruseni(s, poruseni);
      this.udalosti.push({ ...poruseni, cas: this.#cas, krok: this.#kroku, velicina, unosnost });
      zmeneno = true;
    }
    const loziska = this.#nastaveni.loziska;
    if (loziska) {
      const sjete: number[] = [];
      if (uvolniSjeta(s, loziska, sjete) > 0) {
        for (const stycnik of sjete) this.sjeti.push({ cas: this.#cas, krok: this.#kroku, stycnik });
        prepoctiHmoty(s);
        zmeneno = true;
      }
    }
    if (zmeneno) this.poZmeneStavby();

    // Pojistka: neplatná čísla se šíří celou soustavou, stačí zkontrolovat jeden součet.
    // Rychlost, jaké v mostě nic dosáhnout nemůže, znamená, že se výpočet rozkmital.
    let soucet = 0;
    let nejrychlejsi = 0;
    for (let i = 0; i < s.pocetStycniku; i++) {
      soucet += s.x[i]! + s.y[i]!;
      const rychlost = s.vx[i]! * s.vx[i]! + s.vy[i]! * s.vy[i]!;
      if (rychlost > nejrychlejsi) nejrychlejsi = rychlost;
    }
    if (!Number.isFinite(soucet) || nejrychlejsi > NEJVYSSI_RYCHLOST * NEJVYSSI_RYCHLOST) this.rozpadla = true;
  }

  /** Nejvyšší frekvence soustavy včetně pružin, kterými na ni působí zatížení. */
  #nejvyssiFrekvence(): number {
    const s = this.soustava;
    const omega = frekvenceProKrokovani(s, volneStupne(s));
    const navic = this.#nastaveni.zatizeni?.pridavnaFrekvence?.(s) ?? 0;
    return Math.sqrt(omega * omega + navic);
  }

  /** Nastaví krok a tlumení úměrné tuhosti podle nejvyšší frekvence soustavy. */
  #nastavKrokATlumeniPrvku(omegaMax: number): void {
    const omega = frekvenceProKrok(omegaMax);
    const xi = this.#nastaveni.utlumNejvyssi ?? UTLUM_NEJVYSSI_FREKVENCE;
    this.#krok.dt = zvolKrok(omega, xi) * Math.min(1, this.#nastaveni.zkraceniKroku ?? 1);
    this.soustava.beta.fill(betaProUtlum(omega, xi));
    this.#nastaveni.zatizeni?.zmenaKroku?.(this.#krok.dt);
  }

  /** Síly mostu i zatížení pro okamžitý stav; z nich vychází první půlkrok rychlostí. */
  #spoctiSily(): void {
    spoctiSily(this.soustava, this.#nastaveni.tiha, 0, this.#krok.modalni);
    this.#pridejDalsiSily(this.soustava, this.#cas);
    pridejTlumice(this.soustava, this.#krok.dt);
  }

  /** Tlumení úměrné hmotě (po porušení) a vnější zatížení pro stav v čase `cas`. */
  #pridejDalsiSily(s: Soustava, cas: number): void {
    if (this.#hmotou) pridejTlumeniHmotou(s, this.#hmotou);
    this.#nastaveni.zatizeni?.pridejSily(s, cas);
  }

  /**
   * Přizpůsobí výpočet změněné stavbě soustavy: zatížení si znovu dohledá prvky, tlumení
   * vlastních tvarů nahradí tlumení úměrné hmotě a krok se zvolí znovu. Po porušení se
   * volá sama; kdo mění stavbu zvenčí, zavolá ji po `prepoctiHmoty`.
   */
  /**
   * Provede porušení mimo posudek a zapíše ho jako událost v současném čase. Slouží lanu,
   * které se přetrhlo už při napínání, tedy před prvním krokem zkoušky. Po posledním
   * takovém porušení je potřeba zavolat `poZmeneStavby`.
   */
  pretrhni(poruseni: Poruseni, velicina: number, unosnost: number): void {
    provedPoruseni(this.soustava, poruseni);
    this.udalosti.push({ ...poruseni, cas: this.#cas, krok: this.#kroku, velicina, unosnost });
  }

  poZmeneStavby(): void {
    const s = this.soustava;
    this.#nastaveni.zatizeni?.poZmene?.(s);
    // Vlastní tvary neporušené konstrukce už neplatí; dál tlumí jen hmota.
    delete this.#krok.modalni;

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
    const omegaMax = this.#nejvyssiFrekvence();
    if (omegaMax > 0) this.#nastavKrokATlumeniPrvku(Math.max(omegaMax, this.#vychoziOmega));
    // Souvislé části konstrukce se porušením změnily.
    this.#hmotou = vytvorTlumeniHmotou(s, this.#alfaPoPoruseni, this.#tlumeny);
    this.#spoctiSily();
  }
}
