// Rozhraní zkoušky: zprávy mezi hrou a simulací.
// Stejné zprávy tečou ve hře přes Web Worker a v testech přímo v Node, takže každou
// zkoušku lze spustit bez prohlížeče a přehrát přesně znovu.

import type { OdhadKmitani } from "./odhad";
import type { NavrhMostu } from "../data/navrh";
import type { Medaile } from "../data/ulozeni";
import type { Uroven } from "../data/uroven";
import type { PopisUcastnika } from "./provoz";
import type { Snimek, Topologie } from "./zaznam";
import type { Slozeni, VolnyPrut } from "./slozeni";

/** Vše, co určuje průběh zkoušky. Stejný vstup dává stejný výsledek. */
export interface VstupZkousky {
  uroven: Uroven;
  navrh: NavrhMostu;
  /** Násada náhody pro dav a nerovnosti vozovky. */
  nasada: number;
  /** Verze fyziky, se kterou hra počítá; simulace jinou odmítne. */
  verzeFyziky: number;
  /**
   * Brnknutí místo provozu: styčník návrhu (pořadí v návrhu) se stáhne silou `sila` (N,
   * kladná dolů), pustí a most volně kmitá. Jízdní řád se při tom nepouští a výsledek
   * se nepočítá do medailí.
   */
  brnknuti?: { stycnik: number; sila: number };
  /**
   * Budič místo provozu: ve styčníku návrhu (pořadí v návrhu) působí svislá harmonická
   * síla o amplitudě `sila` (N). Její frekvence první polovinu doby `trvani` (s) plynule roste
   * z `od` na `do` Hz a druhou polovinu se vrací; se stejným `od` a `do` drží stálý rytmus.
   * Výsledek se nepočítá do medailí.
   */
  budic?: BudicZkousky;
  /**
   * Zkouška do zlomu místo provozu: mostovku všech tras rovnoměrně zatěžuje síla, která
   * roste, dokud se neporuší první prut, most nesjede z podpory nebo nepovolí píst. Jízdní
   * řád se nepouští a medaile se neudělují; výsledek je v `VysledekZkousky.zlom`.
   */
  zlom?: ZlomZkousky;
}

export interface ZlomZkousky {
  /** Zatížení mostovky v čase t je `narust`·t³ newtonů na metr délky. */
  narust: number;
}

export interface BudicZkousky {
  stycnik: number;
  sila: number;
  od: number;
  do: number;
  trvani: number;
}

/** Co rozbor spočítal o laděném tlumiči (viz `RozborMostu.tlumic`). */
export interface RadaKTlumici {
  /**
   * Rytmus, na který se vyplatí ladit, Hz: ze složek kroku, které most bez tlumičů rozkmitají
   * nejvíc, ta, se kterou naladěný tlumič odhad sníží nejvíc.
   */
  cil: number;
  /** Položka jízdního řádu a násobek kroku, kterým ten rytmus patří. */
  polozka: number;
  nasobek: 1 | 2 | 3 | 4;
  /**
   * Most bez tlumiče: odhad s jedním tlumičem největší dovolené hmotnosti zavěšeným ve
   * styčníku mostovky, kde most kmitá nejvíc, naladěným na `cil`. Null u mostu s tlumičem
   * a tam, kde se rada nepočítala.
   */
  novy: number | null;
  /** Most s tlumiči: tytéž tlumiče naladěné na `cil`. Null, když už tak naladěné jsou. */
  preladeny: number | null;
  /** Most s tlumiči: tytéž tlumiče s největším dovoleným závažím. Null, když ho už mají. */
  tezsi: number | null;
  /**
   * Most s tlumiči: nejtěžší tlumič přenesený do styčníku mostovky, kde most bez tlumičů kmitá
   * nejvíc (`jindeX` je jeho vzdálenost od levého konce mostovky, m). Null, když tam už visí.
   */
  jinde: number | null;
  jindeX: number | null;
}

/** Rozbor mostu ve stavebním režimu: maticový výpočet bez časové simulace. */
export interface RozborMostu {
  /** Most má pod vlastní tíhou klidovou polohu; mechanismus ji nemá a frekvence nejsou. */
  stabilni: boolean;
  /** Nejnižší vlastní frekvence prázdného mostu v Hz, vzestupně. */
  frekvence: number[];
  /**
   * Na jaké frekvenci týž tvar nejvíc odpovídá, když na mostě uprostřed stojí největší skupina
   * lidí z jízdního řádu (Hz, ve stejném pořadí jako `frekvence`). Tělo člověka je hmota na
   * pružině: most pod jejím kmitočtem (kolem 3 Hz) lidé zpomalí, most nad ním mírně zrychlí.
   * Prázdné pole v úrovni bez lidí.
   */
  frekvenceObsazeneho: number[];
  /**
   * Vlastní frekvence mostu bez laděných tlumičů, prázdného a obsazeného lidmi (Hz). Osa
   * frekvencí ukazuje tenhle most a tlumiče zvlášť: `frekvence` a `frekvenceObsazeneho` už
   * tlumiče obsahují a rezonanci, kterou mají krotit, ukazují rozštěpenou. Null u mostu bez tlumičů.
   */
  bezTlumicu: { prazdny: number[]; obsazeny: number[] } | null;
  /**
   * Odhad kmitání mostu pod lidmi úrovně (viz `odhad.ts`): ustálená odezva mostu, na kterém
   * skupiny z jízdního řádu stojí a budí ho krokem. Null v úrovni bez lidí a bez osy frekvencí.
   */
  odhad: OdhadKmitani | null;
  /** Tentýž odhad pro most bez laděných tlumičů; null u mostu, který žádný nemá. */
  odhadBezTlumicu: OdhadKmitani | null;
  /**
   * Co by s odhadem udělal tužší a těžší most: poměr k dnešnímu odhadu pro každou ze změn
   * `ZMENY_PRO_RADU` (pod 1 by kmital míň). Počítá se se všemi skupinami lidí: tužší most může
   * jednomu rytmu ujet a jiný trefit. Null bez odhadu, u mostu, který kmitá hluboko pod mezí
   * (rada není potřeba), a u mostu s laděným tlumičem, kterému pomůže úprava tlumiče.
   */
  smer: { tuzsi: [number, number]; tezsi: [number, number] } | null;
  /**
   * Laděný tlumič: na jaký rytmus ho ladit a co by s odhadem udělaly jeho úpravy (poměr
   * k dnešnímu odhadu, pod 1 by most kmital míň). Null v úrovni, která tlumič nedovoluje,
   * a tam, kde odhad není.
   */
  tlumic: RadaKTlumici | null;
  /**
   * Co by s odhadem udělal viskózní tlumič z každé kotvy pod mostovkou k nejbližšímu styčníku
   * mostovky, kam dosáhne: poměr k dnešnímu odhadu (pod 1 by most kmital míň), lepší ze dvou
   * zkoušených tlumení. Null v úrovni bez tlumiče nebo bez takové kotvy a tam, kde se rady nepočítají.
   */
  viskozni: number | null;
  /**
   * Tvary kmitání prázdného mostu ke každé frekvenci z `frekvence`: posuny styčníků návrhu
   * (dx0, dy0, dx1, dy1, …) v pořadí, v jakém jsou v návrhu. Největší posun má velikost 1.
   */
  tvary: number[][];
  /**
   * Rezonanční křivka: největší svislé zrychlení mostovky v m/s² na 1 kN svislé harmonické
   * síly, pro frekvence `od`, `od + krok`, … Hz. Null v úrovni, která křivku neukazuje.
   */
  krivka: { od: number; krok: number; prazdny: number[]; obsazeny: number[] | null } | null;
  /**
   * Tah lan pod vlastní tíhou mostu v N, pro každý prut návrhu ve stejném pořadí; 0 u lana,
   * které visí povolené, a null u prutu, který lano není.
   */
  tahyLan: (number | null)[];
  /**
   * Průvěs mostovky pod vlastní tíhou: o kolik metrů se styčník mostovky nejvíc liší od výkresu,
   * který to je (pořadí v návrhu) a jestli leží nad výkresem (přetažená lana), ne pod ním.
   * U mostu s lany prozradí špatně nastavené napínáky. Null, když most nemá klidovou polohu
   * nebo mostovku.
   */
  pruves: { metru: number; stycnik: number; nad: boolean } | null;
  /**
   * Kde a proč se skládá most bez klidové polohy (viz `slozeni.ts`); null u mostu, který ji má,
   * a když se místo určit nedá.
   */
  slozeni: Slozeni | null;
  /** Prut, který drží jen za jeden konec a kvůli kterému most klidovou polohu nemá; jinak null. */
  volny: VolnyPrut | null;
}

/** Výsledek automatického dopnutí lan. */
export interface DopnutiLan {
  /** Nové nastavení napínáků: dvojice id prutu a předpětí (viz `PrutNavrhu.predpeti`). */
  predpeti: [number, number][];
  /** Největší svislá odchylka mostovky od nakresleného tvaru před dopnutím a po něm, v metrech. */
  pred: number;
  po: number;
  /** Největší tah v laně po dopnutí pod vlastní tíhou mostu, jako podíl jeho pevnosti. */
  tah: number;
}

/** Co se při zkoušce stalo a kdy. Čísla způsobu a následku porušení jsou konstanty jádra. */
export type Udalost = { cas: number } & (
  | {
      druh: "poruseni";
      /** Pořadí prutu v návrhu. */
      prut: number;
      zpusob: number;
      nasledek: number;
      /** Využití v okamžiku porušení; 1 je mez únosnosti. */
      mira: number;
      /**
       * Co prut v tu chvíli nesl a kolik unese: osová nebo posouvající síla v N, u ohybu
       * moment v N·m; únosnost ve stejných jednotkách.
       */
      velicina: number;
      unosnost: number;
    }
  /** Konec mostu sjel z posuvné podpory; `stycnik` je pořadí styčníku v návrhu. */
  | { druh: "sjeti"; stycnik: number }
  /** Účastník provozu dojel na druhý břeh. */
  | { druh: "prujezd"; polozka: number; clen: number }
  /** Účastník provozu spadl. */
  | { druh: "pad"; polozka: number; clen: number }
  /**
   * Pohyblivý most: zámky se odemkly a písty začaly zvedat (`odemceno`), písty dojely
   * (`zvednuto`), most se začal sklápět (`sklapeni`) a zámky zase zapadly (`zamceno`).
   * `preklopeno`: mostovka se při zvedání překlopila přes svislici.
   */
  | { druh: "pohyb"; faze: "odemceno" | "zvednuto" | "sklapeni" | "zamceno" | "preklopeno" }
  /** Loď (pořadí v úrovni) proplula, nebo narazila do prutu návrhu `prut`. */
  | { druh: "lod"; lod: number; stav: "proplula" | "narazila"; prut?: number }
);

/** Jak dopadlo zvedání a sklápění pohyblivého mostu. */
export interface PohybZkousky {
  /** Písty dojely do vysunuté polohy. */
  zvednuto: boolean;
  /** Po sklopení všechny zámky zase zapadly; `casZamceni` říká kdy (s), null když ne. */
  zamceno: boolean;
  casZamceni: number | null;
  /**
   * Mostovka se při zvedání otočila o víc než čtvrt kruhu: píst ji přetlačil přes svislici
   * (jeho zdvih je větší, než kam křídlo dosáhne). Takový most zkouškou neprojde.
   */
  preklopeno: boolean;
  /** Největší síla, kterou konec mostu při sklápění udeřil do dosedací plochy opěry, N; 0 bez zámku na opěře. */
  razDosednuti: number;
  /** Síla, kterou konec mostu těsně před odemknutím tlačil v klidu na opěru se zámkem, N. */
  klidoveDosednuti: number;
  /** Kolik pístů za zkoušku zastavil přetlakový ventil (nestačily silou). */
  pretizenychPistu: number;
  /** Největší síla v pístu za zkoušku, N (velikost). */
  nejvetsiSilaPistu: number;
  /**
   * Kosinus největšího úhlu, o který se mostovka při zvedání otočila proti výkresu (1 = nepohnula
   * se). Kosinus, ne úhel: zkouška počítá jen sčítáním, násobením, dělením a odmocninou.
   */
  kosinusOtoceni: number;
  /**
   * Co dělaly písty ve chvíli, kdy loď narazila: `zveda` ještě nedojely na konec zdvihu, `drzi`
   * stály na konci zdvihu (křídlo je nahoře, jak vysoko jen píst dosáhne), `klesl` už nahoře byly,
   * ale přetlakový ventil povolil a křídlo kleslo. null, když žádná loď nenarazila nebo se most
   * už sklápěl.
   */
  pistyPriNarazu: "zveda" | "drzi" | "klesl" | null;
  /**
   * Proč zámek po sklopení nezapadl: jestli písty dojely zpátky, o kolik se konce zámku na konci
   * zkoušky míjely (m; svisle kladně, když konec se zámkem visí níž) a jak rychle se vůči sobě
   * hýbaly (m/s). null, když zámky zapadly, most žádný odemčený zámek nemá nebo se nesklápěl.
   */
  nezamceno: { pistyVCili: boolean; vodorovne: number; svisle: number; rychlost: number } | null;
}

/** Co most unesl při zkoušce do zlomu. */
export interface VysledekZlomu {
  /** Zatížení mostovky v okamžiku prvního porušení, N na metr délky. */
  zatizeni: number;
  /** Totéž jako celková síla na všech trasách, N. */
  celkem: number;
  /** Zatížená délka mostovky (součet rozpětí tras), m. */
  delka: number;
  /** Kdy porušení nastalo, s; null, když se most do konce zkoušky neporušil. */
  cas: number | null;
  /**
   * Most se neporušil, ale zkouška na něj nestihla naložit všechno, co umí: trvale se
   * přetvářel, zátěž proto přibývala pomalu a děj skončil na nejdelší době. `zatizeni` je to,
   * co na mostě leželo na konci.
   */
  nedolozeno: boolean;
  /**
   * Prut návrhu, který se porušil první, nebo píst, který první povolil; −1, když most sjel
   * z podpory, neměl klidovou polohu nebo vydržel.
   */
  prut: number;
}

/** Největší namáhání prutu za celou zkoušku. */
export interface ObalkaPrutu {
  /** Největší využití; 1 je mez únosnosti. */
  vyuziti: number;
  /** Čím bylo způsobené (konstanty ZPUSOB_* jádra). */
  zpusob: number;
  /** Kdy nastalo, v sekundách. */
  cas: number;
  /** Osová síla v tu chvíli v N (tah kladný) a největší ohybový moment v N·m. */
  osova: number;
  moment: number;
  /** Veličina, která rozhodovala (síla v N nebo moment v N·m), a únosnost prutu v ní. */
  velicina: number;
  unosnost: number;
}

/** Největší síly, kterými most za zkoušku tlačil na jednu podporu. */
export interface ReakcePodpory {
  /** Pořadí styčníku v návrhu. */
  stycnik: number;
  /** Největší svislá síla, kterou podpora most nesla, v N (kladná nahoru), a největší tah dolů (záporný). */
  svisla: number;
  nadzvednuti: number;
  /** Největší vodorovná síla v N (velikost). */
  vodorovna: number;
}

/** Kmitání mostovky pod lidmi. */
export interface KomfortZkousky {
  /** Největší zrychlení mostovky v m/s² (amplituda v pásmu 0,5–10 Hz, průměrovaná přes sekundu). */
  zrychleni: number;
  /** Kdy nastalo, v sekundách. */
  cas: number;
  /** Třída komfortu: 1 výborný, 2 střední, 3 nízký, 4 nepřijatelný. */
  trida: 1 | 2 | 3 | 4;
  /**
   * Styčník soustavy (pořadí v polohách snímku), ve kterém největší zrychlení nastalo; −1,
   * když se nic nenaměřilo. Podle něj se ze záznamu pozná, na jaké frekvenci most kmital.
   */
  stycnik: number;
  /**
   * Kdy kmitání poprvé přesáhlo mez, se kterou úroveň most ještě přijme, v sekundách; null,
   * když ji nepřesáhlo (nebo se s mezí neměřilo, jako u cestujících).
   */
  prekroceno: number | null;
}

export interface VysledekZkousky {
  /** Všichni přešli a přejeli, nikdo nespadl. */
  pruchod: boolean;
  /**
   * Kolik lidí a vozidel mělo přejít, kolik jich přešlo a kolik spadlo. Řada lidí, kterou
   * simulace vede jako jednoho účastníka, se počítá po lidech.
   */
  ucastniku: number;
  prejelo: number;
  spadlo: number;
  /** Počet porušení prutů. */
  poruseni: number;
  /** Zvedání a sklápění mostu; null v úrovni, kde se most nezvedá. */
  pohyb: PohybZkousky | null;
  /**
   * Na trase chybí kus mostovky (návrh ji nedovedl až na předmostí). Takový most zkouškou
   * neprojde, i kdyby kola mezeru přeskočila.
   */
  mezera: boolean;
  /** Lodě: kolik jich mělo proplout, kolik proplulo a kolik narazilo do mostu. */
  lode: { celkem: number; proplulo: number; narazilo: number };
  /**
   * Pohodlí cestujících: největší svislé zrychlení karoserie autobusu nebo skříně osobního
   * vozu po dobu, kdy sám jel po mostě (stejné měření a třídy jako u chodců). Počítají se jen
   * vozidla, která most přejela celý; nula s časem nula znamená, že žádné takové nebylo.
   * Null, když v úrovni autobus ani osobní vůz nejede.
   */
  komfortCestujicich: KomfortZkousky | null;
  /** Cena mostu v korunách. */
  cena: number;
  /**
   * O kolik metrů se mostovka pod vlastní tíhou, ještě před provozem, nejvíc lišila od výkresu.
   * U mostu s lany prozradí nedopnuté napínáky. Null, když most klidovou polohu nemá.
   */
  pruvesVKlidu: number | null;
  /** Největší využití ze všech prutů. */
  nejvetsiVyuziti: number;
  /** Kmitání mostovky, dokud po ní šli lidé; null v úrovni bez lidí. */
  komfort: KomfortZkousky | null;
  /**
   * Výsledek brnknutí: frekvence v Hz, kterou brnknutý styčník kmital (null, když se
   * nerozkmital). U běžné zkoušky null.
   */
  brnknuti: { frekvence: number | null } | null;
  /**
   * Výsledek pokusu s budičem: změřená odezva mostovky (zrychlení v m/s² na 1 kN síly pro
   * frekvence buzení v Hz, v pořadí, v jakém budič frekvence procházel) a frekvence, při které
   * most odpovídal nejsilněji; null, když se nerozkmital. U běžné zkoušky null.
   */
  budic: { frekvence: number | null; zrychleni: number; krivka: { f: number; a: number }[] } | null;
  /** Výsledek zkoušky do zlomu; u běžné zkoušky null. */
  zlom: VysledekZlomu | null;
  medaile: Medaile;
  /** Obálka namáhání; pořadí odpovídá prutům návrhu. */
  obalka: ObalkaPrutu[];
  /**
   * Obálka namáhání do chvíle, než se na mostě něco poprvé porušilo nebo sjelo z podpory: co
   * most nesl, dokud byl celý. Po porušení se pruty namáhají pádem a ta čísla o návrhu nic
   * neříkají. Prut, který povolil první, tu má využití aspoň 100 %. Null, když se nic neporušilo.
   */
  obalkaDoPoruseni: ObalkaPrutu[] | null;
  /** Reakce v podporách: pro každý podepřený styčník návrhu největší síly za zkoušku. */
  reakce: ReakcePodpory[];
  /** Most neměl pod vlastní tíhou klidovou polohu (chybí mu ztužení) a zkouška začala z nakreslené. */
  bezRovnovahy: boolean;
  /**
   * Most bez klidové polohy se propadl a celý (nic na něm nepovolilo) zůstal ležet na terénu.
   * Takový most neobstál: opírat se smí jen o kotvy a podpory.
   */
  opreno: boolean;
  /**
   * Na mostě se při zkoušce nic neporušilo: žádný prut nepovolil, žádný konec nesjel z podpory
   * a žádný prut nebyl využitý nad 100 % (netvoří se plastický kloub). Jen takový most může
   * dostat rozpočtovou medaili a počítá se do výzev.
   */
  neporuseny: boolean;
  /** Výpočet se rozpadl; výsledek neplatí. */
  rozpad: boolean;
  /** Délka děje v sekundách. */
  trvani: number;
  kroku: number;
  /** Otisk konečného stavu pro regresní testy a porovnání mezi prohlížeči. */
  otisk: string;
}

export type ZpravaProZkousku =
  | { typ: "ahoj" }
  | { typ: "start"; vstup: VstupZkousky }
  | { typ: "stop" }
  /**
   * Žádost o rozbor mostu; `id` se vrátí v odpovědi, aby šla poznat zastaralá. `nasada` je
   * násada, se kterou most pojede zkouška: odhad kmitání podle ní zná fáze kroků jednotlivců.
   */
  | { typ: "rozbor"; id: number; uroven: Uroven; navrh: NavrhMostu; nasada?: number }
  /** Žádost o automatické dopnutí lan; `id` se vrátí v odpovědi. */
  | { typ: "dopnuti"; id: number; uroven: Uroven; navrh: NavrhMostu };

export type ZpravaZeZkousky =
  | { typ: "pripraveno"; verzeFyziky: number }
  | {
      typ: "zacatek";
      /** Očekávaná délka děje v sekundách; při zřícení může skončit dřív. */
      trvani: number;
      /** Krok výpočtu v sekundách. */
      dt: number;
      ucastnici: PopisUcastnika[];
      /** Most neměl pod vlastní tíhou klidovou polohu: skládá se od začátku děje. */
      bezRovnovahy: boolean;
    }
  | { typ: "zaznam"; snimky: Snimek[]; topologie: Topologie[]; udalosti: Udalost[] }
  | { typ: "konec"; vysledek: VysledekZkousky }
  /** Odpověď na žádost o rozbor; null, když se most nedal sestavit (nevyhovuje pravidlům). */
  | { typ: "rozbor"; id: number; rozbor: RozborMostu | null }
  /**
   * Odpověď na žádost o dopnutí lan; null, když most nevyhovuje pravidlům, nemá lana, nemá
   * klidovou polohu, nebo lana nemají na co působit.
   */
  | { typ: "dopnuti"; id: number; dopnuti: DopnutiLan | null }
  | { typ: "chyba"; kod: KodChyby; podrobnosti?: string };

export type KodChyby = "jina-verze-fyziky" | "neplatny-vstup" | "vypocet-selhal";
