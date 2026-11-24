import type { Bod } from "../data/geometrie";
import { vyskaTerenu, type Kotva, type Trasa, type TypKotvy, type Uroven } from "../data/uroven";
import { cislo, delka, vyskovaKota } from "../ui/formaty";
import { t } from "../ui/slovnik";
import { BARVY, PISMO, cara } from "./barvy";
import { nakresliPrazcePredmosti } from "./kolej";
import { svetNaObraz, viditelnaOblast, type Kamera, type Rozmer } from "./kamera";
import { nakresliLod, nakresliPlavebniProfil, viditelnostLodi } from "./pohyb";
import { krokyRastru, roztecSrafovani } from "./rastr";

export interface StavVykresu {
  uroven: Uroven;
  kamera: Kamera;
  rozmer: Rozmer;
  /** Bod rastru pod kurzorem, nebo null, když kurzor není nad výkresem. */
  kurzor: Bod | null;
  /** Zmenšený náhled na kartu úrovně: bez popisků rastru, hladiny a základů. */
  nahled?: boolean;
  /** Bez osy mostu a kóty rozpětí; v malé ukázce by zakrývaly most. */
  bezKot?: boolean;
  /**
   * Čas přehrávané zkoušky v sekundách: lodě se kreslí, jen když právě plují. Bez něj (při
   * stavbě) je vidět jen jejich plavební profil s popiskem.
   */
  cas?: number;
  /** Lodě (pořadí v úrovni), které do mostu narazily; kreslí se barvou varování. */
  narazeneLode?: ReadonlySet<number>;
}

type Kontext = CanvasRenderingContext2D;

/** Zarovná souřadnici tak, aby jednopixelová čára padla přesně na pixel. */
function ostre(v: number): number {
  return Math.round(v) + 0.5;
}

function mezi(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/**
 * Nakreslí celý výkres úrovně. Kontext musí být nastaven tak, aby jednotkou byl
 * CSS pixel (viz `Platno`).
 */
export function nakresliVykres(ctx: Kontext, s: StavVykresu): void {
  nakresliSpodekVykresu(ctx, s);
  nakresliVrsekVykresu(ctx, s);
}

/**
 * Spodní vrstva výkresu: podklad s rastrem, voda, terén a zakázané zóny. Nezávisí na čase
 * zkoušky ani na kurzoru, takže ji přehrávání smí nakreslit jednou a pak jen přenášet
 * (viz `UlozenaVrstva`).
 */
export function nakresliSpodekVykresu(ctx: Kontext, s: StavVykresu): void {
  ctx.save();
  nakresliPodklad(ctx, s.kamera, s.rozmer);
  nakresliVodu(ctx, s);
  nakresliTeren(ctx, s);
  for (const zona of s.uroven.zakazaneZony) nakresliZakazanouZonu(ctx, s, zona);
  ctx.restore();
}

/** Vrchní vrstva výkresu: lodě, základy, trasy, osa a kóta rozpětí, kotvy, okraj, popisky a kurzor. */
export function nakresliVrsekVykresu(ctx: Kontext, s: StavVykresu): void {
  ctx.save();
  nakresliLode(ctx, s);
  for (const zaklad of s.uroven.zaklady) nakresliZaklad(ctx, s, zaklad);
  for (const trasa of s.uroven.trasy) nakresliTrasu(ctx, s, trasa);

  const hlavniTrasa = s.uroven.trasy[0];
  if (hlavniTrasa && !s.bezKot) {
    nakresliOsu(ctx, s, hlavniTrasa);
    nakresliKotuRozpeti(ctx, s, hlavniTrasa);
  }
  for (const kotva of s.uroven.kotvy) nakresliKotvu(ctx, s, kotva);
  if (s.uroven.pohyb && !s.nahled) nakresliPopiskyKotev(ctx, s);
  if (!s.nahled) nakresliPopiskyVyhrazenychKotev(ctx, s);

  nakresliOkrajVykresu(ctx, s);
  if (!s.nahled) nakresliPopiskyRastru(ctx, s.kamera, s.rozmer);
  if (s.kurzor) nakresliKurzor(ctx, s, s.kurzor);
  ctx.restore();
}

/**
 * Kotva vyhrazená tlumiči vypadá jako každá jiná, ale vzpěru nepřijme: popisek to říká dřív,
 * než to hráč zkusí. Stojí na straně břehu, kde nepřekáží stavbě.
 */
function nakresliPopiskyVyhrazenychKotev(ctx: Kontext, s: StavVykresu): void {
  const m = s.kamera.meritko;
  const hlavni = s.uroven.trasy[0];
  if (m < 12 || !hlavni) return;
  const stred = (hlavni.zacatek.x + hlavni.konec.x) / 2;
  ctx.font = `10px ${PISMO}`;
  ctx.textBaseline = "middle";
  for (const kotva of s.uroven.kotvy) {
    if (kotva.jen === undefined) continue;
    const text = t(kotva.jen === "tlumic" ? "vykres.kotvaTlumic" : "vykres.kotvaLano");
    const p = svetNaObraz(s.kamera, s.rozmer, kotva);
    const vlevo = kotva.x <= stred;
    const odstup = mezi(0.55 * m, 9, 22) + 8;
    const sirka = ctx.measureText(text).width;
    const x = vlevo ? p.x - odstup : p.x + odstup;
    ctx.fillStyle = BARVY.pozadi;
    ctx.fillRect((vlevo ? x - sirka : x) - 3, p.y - 7, sirka + 6, 14);
    ctx.textAlign = vlevo ? "right" : "left";
    ctx.fillStyle = BARVY.popisek;
    ctx.fillText(text, x, p.y);
  }
}

/**
 * Pohyblivý most: pevné kotvy mají stejnou značku, ale dvojí úlohu. Na konci trasy se kolem
 * kotvy otáčí křídlo (čep), kotvy pod ní jsou opěrou pro píst. Popisek stojí na straně břehu,
 * kde nepřekáží stavbě.
 */
function nakresliPopiskyKotev(ctx: Kontext, s: StavVykresu): void {
  const m = s.kamera.meritko;
  const hlavni = s.uroven.trasy[0];
  // Při malém měřítku (telefon naležato) by se popisky kotev tři metry pod sebou překrývaly.
  if (m < 12 || !hlavni) return;
  const stred = (hlavni.zacatek.x + hlavni.konec.x) / 2;
  const naKonciTrasy = (kotva: Kotva): boolean =>
    s.uroven.trasy.some(
      (trasa) =>
        (trasa.zacatek.x === kotva.x && trasa.zacatek.y === kotva.y) || (trasa.konec.x === kotva.x && trasa.konec.y === kotva.y),
    );
  ctx.font = `10px ${PISMO}`;
  ctx.textBaseline = "middle";
  // Dvě kotvy pro píst na stejném břehu rozlišuje zadání jako mělkou a hlubokou; popisek taky.
  // Kotva pro píst leží pod koncem trasy (pod čepem). Ostatní pevné kotvy (pro lana za opěrami,
  // v patách svahů pískoviště) popisek nedostanou: píst z nich vést jde, ale k tomu tam nejsou.
  const podKoncemTrasy = (kotva: Kotva): boolean =>
    s.uroven.trasy.some(
      (trasa) => (trasa.zacatek.x === kotva.x && kotva.y < trasa.zacatek.y) || (trasa.konec.x === kotva.x && kotva.y < trasa.konec.y),
    );
  const proPist = s.uroven.kotvy.filter((kotva) => kotva.typ === "pevna" && !naKonciTrasy(kotva) && podKoncemTrasy(kotva));
  const nazevKotvyPistu = (kotva: Kotva): string => {
    const naBrehu = proPist.filter((jina) => jina.x <= stred === kotva.x <= stred);
    if (naBrehu.length < 2) return t("vykres.kotvaPist");
    if (naBrehu.every((jina) => jina.y <= kotva.y)) return t("vykres.kotvaPist.melka");
    if (naBrehu.every((jina) => jina.y >= kotva.y)) return t("vykres.kotvaPist.hluboka");
    return t("vykres.kotvaPist");
  };
  for (const kotva of s.uroven.kotvy) {
    if (kotva.typ !== "pevna") continue;
    const cep = naKonciTrasy(kotva);
    if (!cep && !proPist.includes(kotva)) continue;
    const text = cep ? t("vykres.kotvaCep") : nazevKotvyPistu(kotva);
    const p = svetNaObraz(s.kamera, s.rozmer, kotva);
    const vlevo = kotva.x <= stred;
    const odstup = mezi(0.55 * m, 9, 22) + 8;
    const sirka = ctx.measureText(text).width;
    // Čep má popisek pod úrovní vozovky, ať nestojí v předmostí; kotva pístu ve své výšce.
    const x = vlevo ? p.x - odstup : p.x + odstup;
    const y = cep ? p.y + 16 : p.y;
    ctx.fillStyle = BARVY.pozadi;
    ctx.fillRect((vlevo ? x - sirka : x) - 3, y - 7, sirka + 6, 14);
    ctx.textAlign = vlevo ? "right" : "left";
    ctx.fillStyle = BARVY.popisek;
    ctx.fillText(text, x, y);
  }
}

/**
 * Lodě úrovně. Při stavbě je vidět plavební profil každé lodi s výškou a časem připlutí;
 * při zkoušce profil zůstává slabě naznačený a loď se objeví, když pluje.
 */
function nakresliLode(ctx: Kontext, s: StavVykresu): void {
  const hladina = s.uroven.hladina;
  if (hladina === null) return;
  s.uroven.lode.forEach((lod, k) => {
    if (s.cas === undefined) {
      const popisek = s.nahled ? null : t("vykres.plavebniProfil", { vyska: delka(lod.vyska), cas: cislo(lod.cas, Number.isInteger(lod.cas) ? 0 : 1) });
      nakresliPlavebniProfil(ctx, s.kamera, s.rozmer, hladina, lod, popisek, 0.9);
      return;
    }
    nakresliPlavebniProfil(ctx, s.kamera, s.rozmer, hladina, lod, null, 0.35);
    const narazila = s.narazeneLode?.has(k) ?? false;
    const videt = viditelnostLodi(lod, s.cas);
    if (videt > 0) nakresliLod(ctx, s.kamera, s.rozmer, hladina, lod, videt, narazila);
  });
}

/** Podklad modráku: barva pozadí a rastr. Společný pro hru i zkušebnu. */
export function nakresliPodklad(ctx: Kontext, kamera: Kamera, rozmer: Rozmer): void {
  ctx.fillStyle = BARVY.pozadi;
  ctx.fillRect(0, 0, rozmer.sirka, rozmer.vyska);

  const { sirka, vyska } = rozmer;
  const vid = viditelnaOblast(kamera, rozmer);
  const { jemny, hlavni } = krokyRastru(kamera.meritko);

  const cary = (krok: number, vynechNasobky: number | null, alfa: number): void => {
    ctx.beginPath();
    for (let i = Math.ceil(vid.xMin / krok); i * krok <= vid.xMax; i++) {
      if (vynechNasobky !== null && (i * krok) % vynechNasobky === 0) continue;
      const x = ostre(svetNaObraz(kamera, rozmer, { x: i * krok, y: 0 }).x);
      ctx.moveTo(x, 0);
      ctx.lineTo(x, vyska);
    }
    for (let i = Math.ceil(vid.yMin / krok); i * krok <= vid.yMax; i++) {
      if (vynechNasobky !== null && (i * krok) % vynechNasobky === 0) continue;
      const y = ostre(svetNaObraz(kamera, rozmer, { x: 0, y: i * krok }).y);
      ctx.moveTo(0, y);
      ctx.lineTo(sirka, y);
    }
    ctx.strokeStyle = `rgba(255, 255, 255, ${alfa})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  };

  cary(jemny, hlavni, 0.07);
  cary(hlavni, null, 0.17);
}

function nakresliVodu(ctx: Kontext, s: StavVykresu): void {
  const hladina = s.uroven.hladina;
  if (hladina === null) return;
  const m = s.kamera.meritko;
  const { sirka } = s.rozmer;
  const delkaVlny = 2.5; // metry
  const amplituda = mezi(0.1 * m, 1, 4);

  const vlna = (vyskaSvet: number, alfa: number, tloustka: number): void => {
    const y = svetNaObraz(s.kamera, s.rozmer, { x: 0, y: vyskaSvet }).y;
    ctx.beginPath();
    if (delkaVlny * m < 10) {
      ctx.moveTo(0, ostre(y));
      ctx.lineTo(sirka, ostre(y));
    } else {
      for (let px = 0; px <= sirka + 3; px += 3) {
        const xSvet = s.kamera.x + (px - sirka / 2) / m;
        const py = y - amplituda * Math.sin((2 * Math.PI * xSvet) / delkaVlny);
        if (px === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
    }
    ctx.globalAlpha = alfa;
    ctx.strokeStyle = BARVY.voda;
    ctx.lineWidth = tloustka;
    ctx.stroke();
    ctx.globalAlpha = 1;
  };

  vlna(hladina, 1, 1.5);
  if (m >= 6) vlna(hladina - 0.9, 0.45, 1);
}

/** Cesta po povrchu terénu; uzavřená varianta obepíná i zeminu pod ním. */
function cestaTerenu(ctx: Kontext, s: StavVykresu, uzavrena: boolean): void {
  const vid = viditelnaOblast(s.kamera, s.rozmer);
  const body = s.uroven.teren;
  const prvni = body[0]!;
  const posledni = body[body.length - 1]!;
  const levy = Math.min(prvni.x, vid.xMin) - 1;
  const pravy = Math.max(posledni.x, vid.xMax) + 1;
  const naObraz = (b: Bod): Bod => svetNaObraz(s.kamera, s.rozmer, b);

  ctx.beginPath();
  const start = naObraz({ x: levy, y: prvni.y });
  ctx.moveTo(start.x, start.y);
  for (const b of body) {
    const p = naObraz(b);
    ctx.lineTo(p.x, p.y);
  }
  const konec = naObraz({ x: pravy, y: posledni.y });
  ctx.lineTo(konec.x, konec.y);
  if (uzavrena) {
    const dno = Math.max(s.rozmer.vyska, konec.y, start.y) + 2;
    ctx.lineTo(konec.x, dno);
    ctx.lineTo(start.x, dno);
    ctx.closePath();
  }
}

function nakresliTeren(ctx: Kontext, s: StavVykresu): void {
  const { sirka, vyska } = s.rozmer;
  const m = s.kamera.meritko;

  // Zemina zakryje vodu tam, kde je terén nad hladinou.
  cestaTerenu(ctx, s, true);
  ctx.fillStyle = BARVY.pozadi;
  ctx.fill();

  // Šrafy pod 45°, ukotvené ve světě, aby při posunu výkresu „neplavaly“.
  ctx.save();
  cestaTerenu(ctx, s, true);
  ctx.clip();
  const krok = roztecSrafovani(m) * m;
  const pocatek = sirka / 2 + vyska / 2 + m * (s.kamera.y - s.kamera.x);
  ctx.beginPath();
  for (let i = Math.ceil(-pocatek / krok); pocatek + i * krok <= sirka + vyska; i++) {
    const k = pocatek + i * krok;
    ctx.moveTo(k, 0);
    ctx.lineTo(k - vyska, vyska);
  }
  ctx.strokeStyle = cara(0.3);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  cestaTerenu(ctx, s, false);
  ctx.strokeStyle = BARVY.cara;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = "round";
  ctx.stroke();

  // Popisek hladiny patří k vodě, ale kreslí se až přes terén, aby byl čitelný.
  // Stojí u levého břehu, kde nepřekáží stavbě uprostřed rozpětí.
  const hladina = s.uroven.hladina;
  const breh = levyBrehHladiny(s.uroven);
  if (hladina !== null && breh !== null && m >= 6 && !s.nahled) {
    const misto = svetNaObraz(s.kamera, s.rozmer, { x: breh, y: hladina });
    ctx.font = `11px ${PISMO}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = BARVY.voda;
    ctx.fillText(t("vykres.hladina", { vyska: vyskovaKota(hladina) }), misto.x + 14, misto.y - 8);
  }
}

/** Místo, kde terén zleva poprvé klesne pod hladinu; null, když voda v úrovni není vidět. */
function levyBrehHladiny(uroven: Uroven): number | null {
  const hladina = uroven.hladina;
  if (hladina === null) return null;
  for (let i = 1; i < uroven.teren.length; i++) {
    const a = uroven.teren[i - 1]!;
    const b = uroven.teren[i]!;
    if (a.y >= hladina && b.y < hladina) return a.x + ((b.x - a.x) * (a.y - hladina)) / (a.y - b.y);
  }
  return null;
}

function nakresliZakazanouZonu(
  ctx: Kontext,
  s: StavVykresu,
  zona: { xMin: number; yMin: number; xMax: number; yMax: number },
): void {
  const a = svetNaObraz(s.kamera, s.rozmer, { x: zona.xMin, y: zona.yMax });
  const b = svetNaObraz(s.kamera, s.rozmer, { x: zona.xMax, y: zona.yMin });
  const sirka = b.x - a.x;
  const vyska = b.y - a.y;

  ctx.save();
  ctx.beginPath();
  ctx.rect(a.x, a.y, sirka, vyska);
  ctx.fillStyle = "rgba(255, 138, 122, 0.07)";
  ctx.fill();
  ctx.clip();
  // Řídké šrafy opačného sklonu než terén, aby se zóna nepletla se zeminou.
  ctx.beginPath();
  for (let k = a.x - vyska; k <= b.x; k += 14) {
    ctx.moveTo(k, a.y);
    ctx.lineTo(k + vyska, b.y);
  }
  ctx.strokeStyle = "rgba(255, 138, 122, 0.28)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = BARVY.zakaz;
  ctx.lineWidth = 1.2;
  ctx.strokeRect(ostre(a.x), ostre(a.y), Math.round(sirka), Math.round(vyska));
  ctx.setLineDash([]);

  // Popisek stojí v levém horním rohu té části zóny, která je vidět; jinak by ho okraj
  // výkresu (nebo malé okno ukázky) uřízl.
  const vlevo = Math.max(a.x, 0);
  const nahore = Math.max(a.y, 0);
  const viditelnaSirka = Math.min(b.x, s.rozmer.sirka) - vlevo;
  const viditelnaVyska = Math.min(b.y, s.rozmer.vyska) - nahore;
  if (viditelnaSirka > 110 && viditelnaVyska > 22) {
    ctx.font = `11px ${PISMO}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = BARVY.zakaz;
    ctx.fillText(t("vykres.zakazanaZona"), vlevo + 6, nahore + 5);
  }
}

function nakresliZaklad(ctx: Kontext, s: StavVykresu, zaklad: Bod): void {
  const m = s.kamera.meritko;
  const p = svetNaObraz(s.kamera, s.rozmer, zaklad);
  const sirka = mezi(2 * m, 16, 120);
  const vyska = mezi(0.6 * m, 5, 36);

  ctx.fillStyle = BARVY.pozadi;
  ctx.fillRect(p.x - sirka / 2, p.y, sirka, vyska);
  ctx.fillStyle = cara(0.3);
  ctx.fillRect(p.x - sirka / 2, p.y, sirka, vyska);
  ctx.strokeStyle = BARVY.cara;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(ostre(p.x - sirka / 2), ostre(p.y), Math.round(sirka), Math.round(vyska));

  // Značka místa, odkud lze pilíř stavět.
  const r = mezi(0.22 * m, 3.5, 7);
  ctx.fillStyle = BARVY.pozadi;
  ctx.fillRect(p.x - r, p.y - r, 2 * r, 2 * r);
  ctx.strokeRect(ostre(p.x - r), ostre(p.y - r), Math.round(2 * r), Math.round(2 * r));

  if (m >= 5 && !s.nahled) {
    // Popisek leží v šrafované zemině, proto má vlastní podklad. Schází jen při velkém
    // oddálení, kde by se popisky sousedních základů překrývaly.
    const napis = t("vykres.zaklad");
    ctx.font = `11px ${PISMO}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const sirkaNapisu = ctx.measureText(napis).width + 10;
    ctx.fillStyle = BARVY.pozadi;
    ctx.fillRect(p.x - sirkaNapisu / 2, p.y + vyska + 4, sirkaNapisu, 15);
    ctx.fillStyle = BARVY.cara;
    ctx.fillText(napis, p.x, p.y + vyska + 6);
  }
}

function nakresliTrasu(ctx: Kontext, s: StavVykresu, trasa: Trasa): void {
  const m = s.kamera.meritko;
  const vid = viditelnaOblast(s.kamera, s.rozmer);
  const zacatek = svetNaObraz(s.kamera, s.rozmer, trasa.zacatek);
  const konec = svetNaObraz(s.kamera, s.rozmer, trasa.konec);
  const levyKraj = svetNaObraz(s.kamera, s.rozmer, { x: vid.xMin - 1, y: trasa.zacatek.y });
  const pravyKraj = svetNaObraz(s.kamera, s.rozmer, { x: vid.xMax + 1, y: trasa.konec.y });

  // Tunel: kde je terén na předmostí vysoko nad niveletou, vede trasa skálou. Tubus má
  // barvu pozadí, aby v něm bylo vidět, kdo přijíždí, a u mostu končí portálem.
  const svetlost = 6.5;
  for (const [okraj, kraj, smer] of [
    [trasa.zacatek, vid.xMin - 1, -1],
    [trasa.konec, vid.xMax + 1, 1],
  ] as const) {
    if (vyskaTerenu(s.uroven, okraj.x + smer * 2) < okraj.y + 2) continue;
    const dole = svetNaObraz(s.kamera, s.rozmer, { x: okraj.x, y: okraj.y });
    const nahore = svetNaObraz(s.kamera, s.rozmer, { x: kraj, y: okraj.y + svetlost });
    ctx.fillStyle = BARVY.pozadi;
    ctx.fillRect(Math.min(dole.x, nahore.x), nahore.y, Math.abs(nahore.x - dole.x), dole.y - nahore.y);
    ctx.beginPath();
    ctx.moveTo(nahore.x, nahore.y);
    ctx.lineTo(dole.x, nahore.y);
    ctx.strokeStyle = cara(0.6);
    ctx.lineWidth = 1;
    ctx.stroke();
    // Portál: silnější svislá hrana u ústí tunelu.
    ctx.beginPath();
    ctx.moveTo(dole.x, nahore.y - 0.6 * m);
    ctx.lineTo(dole.x, nahore.y);
    ctx.moveTo(dole.x - smer * 0.5 * m, nahore.y - 0.6 * m);
    ctx.lineTo(dole.x + smer * 0.2 * m, nahore.y - 0.6 * m);
    ctx.strokeStyle = BARVY.cara;
    ctx.lineWidth = mezi(0.12 * m, 1.5, 3);
    ctx.stroke();
  }

  // Předmostí: hotová vozovka nebo kolej na březích.
  const tloustka = trasa.druh === "kolej" ? mezi(0.28 * m, 3, 8) : mezi(0.22 * m, 2.5, 6);
  ctx.beginPath();
  ctx.moveTo(levyKraj.x, zacatek.y);
  ctx.lineTo(zacatek.x, zacatek.y);
  ctx.moveTo(konec.x, konec.y);
  ctx.lineTo(pravyKraj.x, konec.y);
  ctx.strokeStyle = BARVY.caraSilna;
  ctx.lineWidth = tloustka;
  ctx.lineCap = "butt";
  ctx.stroke();
  if (trasa.druh === "kolej" && m >= 4) {
    // Pražce se měří od konce trasy, takže při posunu pohledu stojí na místě.
    nakresliPrazcePredmosti(ctx, zacatek, -1, s.rozmer.sirka, m, tloustka);
    nakresliPrazcePredmosti(ctx, konec, 1, s.rozmer.sirka, m, tloustka);
  }

  // Niveleta: kudy má vést mostovka, kterou hráč postaví.
  ctx.beginPath();
  ctx.moveTo(zacatek.x, zacatek.y);
  ctx.lineTo(konec.x, konec.y);
  ctx.setLineDash([10, 6]);
  ctx.strokeStyle = cara(0.45);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.setLineDash([]);

  // Kde je tras víc (most o dvou patrech), říká popisek u levého konce, která je která.
  if (s.uroven.trasy.length > 1 && !s.nahled && m >= 6) {
    ctx.font = `11px ${PISMO}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = BARVY.popisek;
    ctx.fillText(t(`vykres.trasa.${trasa.druh}`), zacatek.x + 8, zacatek.y - tloustka / 2 - 3);
  }
}

function nakresliOsu(ctx: Kontext, s: StavVykresu, trasa: Trasa): void {
  const stred = (trasa.zacatek.x + trasa.konec.x) / 2;
  const nahore = svetNaObraz(s.kamera, s.rozmer, { x: stred, y: s.uroven.vyrez.yMax });
  const dole = svetNaObraz(s.kamera, s.rozmer, { x: stred, y: s.uroven.vyrez.yMin });
  ctx.beginPath();
  ctx.moveTo(ostre(nahore.x), nahore.y);
  ctx.lineTo(ostre(dole.x), dole.y);
  ctx.setLineDash([14, 4, 2, 4]);
  ctx.strokeStyle = cara(0.5);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.setLineDash([]);
}

function sipka(ctx: Kontext, hrot: Bod, smer: 1 | -1): void {
  ctx.beginPath();
  ctx.moveTo(hrot.x, hrot.y);
  ctx.lineTo(hrot.x - smer * 9, hrot.y - 3);
  ctx.lineTo(hrot.x - smer * 9, hrot.y + 3);
  ctx.closePath();
  ctx.fill();
}

/** Kóta rozpětí nad stavebním prostorem, s vynášecími čarami od konců trasy. */
function nakresliKotuRozpeti(ctx: Kontext, s: StavVykresu, trasa: Trasa): void {
  const vyskaKoty = s.uroven.vyrez.yMax - 2;
  const a = svetNaObraz(s.kamera, s.rozmer, { x: trasa.zacatek.x, y: vyskaKoty });
  const b = svetNaObraz(s.kamera, s.rozmer, { x: trasa.konec.x, y: vyskaKoty });
  if (b.x - a.x < 90) return;
  const zacatek = svetNaObraz(s.kamera, s.rozmer, trasa.zacatek);
  const konec = svetNaObraz(s.kamera, s.rozmer, trasa.konec);
  const y = ostre(a.y);

  ctx.beginPath();
  ctx.moveTo(ostre(a.x), zacatek.y - 14);
  ctx.lineTo(ostre(a.x), y - 8);
  ctx.moveTo(ostre(b.x), konec.y - 14);
  ctx.lineTo(ostre(b.x), y - 8);
  ctx.strokeStyle = cara(0.3);
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(a.x, y);
  ctx.lineTo(b.x, y);
  ctx.strokeStyle = BARVY.cara;
  ctx.stroke();
  ctx.fillStyle = BARVY.cara;
  sipka(ctx, { x: a.x, y }, -1);
  sipka(ctx, { x: b.x, y }, 1);

  const napis = delka(trasa.konec.x - trasa.zacatek.x);
  ctx.font = `13px ${PISMO}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const sirkaNapisu = ctx.measureText(napis).width + 16;
  const stred = (a.x + b.x) / 2;
  ctx.fillStyle = BARVY.pozadi;
  ctx.fillRect(stred - sirkaNapisu / 2, y - 9, sirkaNapisu, 18);
  ctx.fillStyle = BARVY.cara;
  ctx.fillText(napis, stred, y + 1);
}

/** Značka podpory, jak se kreslí ve statických schématech. */
function nakresliKotvu(ctx: Kontext, s: StavVykresu, kotva: Kotva): void {
  nakresliZnackuPodpory(ctx, svetNaObraz(s.kamera, s.rozmer, kotva), kotva.typ, s.kamera.meritko);
}

/**
 * Značka podpory v daném bodě plátna: trojúhelník pevné podpory, trojúhelník na
 * válečcích u posuvné, šrafovaný blok u vetknutí. Velikost se řídí měřítkem výkresu.
 */
export function nakresliZnackuPodpory(ctx: Kontext, p: Bod, typ: TypKotvy, meritko: number): void {
  const v = mezi(0.55 * meritko, 9, 22);
  const r = 0.3 * v;

  ctx.strokeStyle = BARVY.cara;
  ctx.fillStyle = BARVY.pozadi;
  ctx.lineWidth = 1.6;
  ctx.lineJoin = "miter";
  ctx.setLineDash([]);

  if (typ === "vetknuti") {
    // Vetknutí: plný blok, do kterého je prut zapuštěn.
    ctx.fillRect(p.x - 0.7 * v, p.y - 0.7 * v, 1.4 * v, 1.4 * v);
    ctx.strokeRect(p.x - 0.7 * v, p.y - 0.7 * v, 1.4 * v, 1.4 * v);
    ctx.beginPath();
    ctx.moveTo(p.x - 0.7 * v, p.y + 0.7 * v);
    ctx.lineTo(p.x + 0.7 * v, p.y - 0.7 * v);
    ctx.moveTo(p.x - 0.7 * v, p.y);
    ctx.lineTo(p.x, p.y - 0.7 * v);
    ctx.moveTo(p.x, p.y + 0.7 * v);
    ctx.lineTo(p.x + 0.7 * v, p.y);
    ctx.stroke();
  } else {
    const spodek = p.y + r + v;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y + r);
    ctx.lineTo(p.x - 0.65 * v, spodek);
    ctx.lineTo(p.x + 0.65 * v, spodek);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    if (typ === "posuvna") {
      // Posuvné ložisko: trojúhelník stojí na válečcích.
      const valecek = 0.2 * v;
      ctx.arc(p.x - 0.35 * v, spodek + valecek + 1, valecek, 0, 2 * Math.PI);
      ctx.moveTo(p.x + 0.35 * v + valecek, spodek + valecek + 1);
      ctx.arc(p.x + 0.35 * v, spodek + valecek + 1, valecek, 0, 2 * Math.PI);
      ctx.moveTo(p.x - 0.9 * v, spodek + 2 * valecek + 3);
      ctx.lineTo(p.x + 0.9 * v, spodek + 2 * valecek + 3);
    } else {
      ctx.moveTo(p.x - 0.9 * v, spodek + 3);
      ctx.lineTo(p.x + 0.9 * v, spodek + 3);
    }
    ctx.fill();
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, 2 * Math.PI);
  ctx.fillStyle = BARVY.pozadi;
  ctx.fill();
  ctx.stroke();
}

/** Ztmaví plochu mimo výřez úrovně a orámuje ho jako list výkresu. */
function nakresliOkrajVykresu(ctx: Kontext, s: StavVykresu): void {
  const { sirka, vyska } = s.rozmer;
  const v = s.uroven.vyrez;
  const a = svetNaObraz(s.kamera, s.rozmer, { x: v.xMin, y: v.yMax });
  const b = svetNaObraz(s.kamera, s.rozmer, { x: v.xMax, y: v.yMin });

  ctx.beginPath();
  ctx.rect(0, 0, sirka, vyska);
  ctx.rect(a.x, a.y, b.x - a.x, b.y - a.y);
  ctx.fillStyle = BARVY.mimoVykres;
  ctx.fill("evenodd");

  ctx.strokeStyle = cara(0.7);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(ostre(a.x), ostre(a.y), Math.round(b.x - a.x), Math.round(b.y - a.y));
}

/** Popisky hlavních čar rastru podél horního a levého okraje plátna. */
export function nakresliPopiskyRastru(ctx: Kontext, kamera: Kamera, rozmer: Rozmer): void {
  const vid = viditelnaOblast(kamera, rozmer);
  const { hlavni } = krokyRastru(kamera.meritko);
  const minus = (n: number): string => (n < 0 ? `\u2212${-n}` : String(n));

  ctx.font = `10px ${PISMO}`;
  ctx.fillStyle = BARVY.popisek;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  for (let i = Math.ceil(vid.xMin / hlavni); i * hlavni <= vid.xMax; i++) {
    const x = svetNaObraz(kamera, rozmer, { x: i * hlavni, y: 0 }).x;
    ctx.fillText(minus(i * hlavni), x + 3, 3);
  }
  ctx.textBaseline = "bottom";
  for (let i = Math.ceil(vid.yMin / hlavni); i * hlavni <= vid.yMax; i++) {
    const y = svetNaObraz(kamera, rozmer, { x: 0, y: i * hlavni }).y;
    if (y < 18) continue; // roh patří popiskům osy x
    ctx.fillText(minus(i * hlavni), 3, y - 2);
  }
}

function nakresliKurzor(ctx: Kontext, s: StavVykresu, kurzor: Bod): void {
  const p = svetNaObraz(s.kamera, s.rozmer, kurzor);
  const x = ostre(p.x);
  const y = ostre(p.y);
  ctx.beginPath();
  ctx.moveTo(x - 7, y);
  ctx.lineTo(x + 7, y);
  ctx.moveTo(x, y - 7);
  ctx.lineTo(x, y + 7);
  ctx.strokeStyle = BARVY.caraSilna;
  ctx.lineWidth = 1;
  ctx.stroke();
}
