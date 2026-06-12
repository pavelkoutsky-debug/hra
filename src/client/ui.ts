import type { CheckResult, GameState } from "../shared/types";
import { ATTRIBUTE_NAMES, getArchetype, remainingTime, ARCHETYPES } from "../shared/rules";
import locationsJson from "../../content/locations.json";
import type { LogEntry } from "./save";
import { itemIcon } from "./items";

interface LocationInfo {
  name: string;
  district: string;
  image: string;
  blurb: string;
}
const LOCATIONS = locationsJson as Record<string, LocationInfo>;

export function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Chybí element #${id}`);
  return el;
}

export function showScreen(id: string): void {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  $(id).classList.add("active");
}

const log = () => $("log");

export function appendEntry(kind: LogEntry["kind"], text = "", speaker?: string): HTMLElement {
  const div = document.createElement("div");
  div.className = `entry ${kind}`;
  if (kind === "npc-line" && speaker) {
    const s = document.createElement("span");
    s.className = "speaker";
    s.textContent = `${speaker}: `;
    div.appendChild(s);
    div.appendChild(document.createTextNode(text));
  } else {
    div.textContent = text;
  }
  log().appendChild(div);
  scrollLog();
  return div;
}

/** Připojí text do streamované položky (kurzor řeší CSS třída .streaming). */
export function appendToEntry(entry: HTMLElement, text: string): void {
  entry.appendChild(document.createTextNode(text));
  scrollLog();
}

export function scrollLog(): void {
  log().scrollTop = log().scrollHeight;
}

export function clearLog(): void {
  log().innerHTML = "";
}

export function renderChecks(checks: CheckResult[]): void {
  for (const c of checks) {
    const div = document.createElement("div");
    div.className = "check";
    const name = ATTRIBUTE_NAMES[c.attribute] ?? c.attribute;
    const verdict = c.success ? `<span class="ok">úspěch</span>` : `<span class="fail">neúspěch</span>`;
    div.innerHTML = `🎲 ${escapeHtml(c.action)} — hod ${c.roll} + ${name} ${c.bonus} = ${c.total} proti ${c.difficulty}: ${verdict}`;
    log().appendChild(div);
  }
  if (checks.length) scrollLog();
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

export function updateHud(state: GameState): void {
  $("hud-time").textContent = remainingTime(state).label;
  $("hud-hp").textContent = `${state.hp}/${state.maxHp}`;
}

export function setLocation(state: GameState): void {
  const loc = LOCATIONS[state.location];
  $("location-name").textContent = loc?.name ?? state.location;
  $("location-blurb").textContent = loc?.blurb ?? "";
  const img = $("location-img") as HTMLImageElement;
  if (loc?.image) {
    const legacy = `/img/${state.location}.svg`;
    img.classList.remove("noart");
    img.onerror = () => {
      // pixel art scéna ještě nedodána → starý placeholder, jinak jen gradient pozadí
      if (img.src.endsWith(".png")) img.src = legacy;
      else { img.classList.add("noart"); img.removeAttribute("src"); }
    };
    img.src = loc.image;
    img.alt = loc.name;
  } else {
    img.classList.add("noart");
    img.removeAttribute("src");
  }
}

export function renderSidebar(state: GameState): void {
  $("char-name").textContent = getArchetype(state.archetype).name;
  const attrs = $("char-attrs");
  attrs.innerHTML = "";
  for (const [key, value] of Object.entries(state.attributes)) {
    const dt = document.createElement("dt");
    dt.textContent = ATTRIBUTE_NAMES[key as keyof typeof ATTRIBUTE_NAMES];
    const dd = document.createElement("dd");
    dd.textContent = "●".repeat(value) + "○".repeat(3 - value);
    if (value === 0) dd.className = "zero";
    attrs.append(dt, dd);
  }
  const inv = $("char-inventory");
  inv.innerHTML = "";
  for (const item of state.inventory) {
    const slot = document.createElement("div");
    slot.className = "inv-slot";
    const img = document.createElement("img");
    img.src = itemIcon(item);
    img.alt = item;
    img.onerror = () => {
      // ikona ještě nedodána → textová zkratka předmětu
      img.remove();
      const fb = document.createElement("span");
      fb.className = "inv-fallback";
      fb.textContent = item.slice(0, 2).toUpperCase();
      slot.prepend(fb);
    };
    const label = document.createElement("span");
    label.className = "inv-label";
    label.textContent = item;
    slot.append(img, label);
    inv.appendChild(slot);
  }
  // doplnit prázdné sloty do násobku řádku (4 sloupce)
  const fill = (4 - (state.inventory.length % 4)) % 4 || (state.inventory.length === 0 ? 4 : 0);
  for (let i = 0; i < fill; i++) {
    const slot = document.createElement("div");
    slot.className = "inv-slot empty";
    inv.appendChild(slot);
  }
}

export function setQuickActions(actions: string[], onPick: (text: string) => void): void {
  const wrap = $("quick-actions");
  wrap.innerHTML = "";
  for (const a of actions) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.textContent = a;
    b.addEventListener("click", () => onPick(a));
    wrap.appendChild(b);
  }
}

export function setBusy(busy: boolean): void {
  ($("player-input") as HTMLInputElement).disabled = busy;
  ($("btn-send") as HTMLButtonElement).disabled = busy;
  if (!busy) ($("player-input") as HTMLInputElement).focus();
}

export function setDialogueBanner(npcName: string | null, npcId?: string): void {
  const banner = $("dialogue-banner");
  const portrait = $("dialogue-portrait") as HTMLImageElement;
  if (npcName) {
    $("dialogue-npc").textContent = npcName;
    banner.hidden = false;
    if (npcId) {
      portrait.hidden = false;
      portrait.onerror = () => { portrait.hidden = true; };
      portrait.src = `/img/portraits/portrait-${npcId}.png`;
      portrait.alt = npcName;
    }
    ($("player-input") as HTMLInputElement).placeholder = "Co řekneš?";
  } else {
    banner.hidden = true;
    portrait.hidden = true;
    ($("player-input") as HTMLInputElement).placeholder = "Co uděláš?";
  }
}

export function renderArchetypeCards(onPick: (id: string) => void): void {
  const wrap = $("archetype-cards");
  wrap.innerHTML = "";
  for (const a of ARCHETYPES) {
    const card = document.createElement("div");
    card.className = "card";
    card.setAttribute("role", "button");
    card.tabIndex = 0;
    const attrLine = Object.entries(a.attributes)
      .map(([k, v]) => {
        const name = ATTRIBUTE_NAMES[k as keyof typeof ATTRIBUTE_NAMES];
        return v === 0 ? `<span class="zero">${name} ${v}</span>` : `${name} ${v}`;
      })
      .join(" · ");
    card.innerHTML = `<img class="card-art" src="/img/archetypes/archetype-${a.id}.png" alt="" onerror="this.hidden=true"><h3>${a.name}</h3><p>${escapeHtml(a.description)}</p><div class="attrs">${attrLine}<br><em>${a.inventory.join(", ")}</em></div>`;
    const pick = () => onPick(a.id);
    card.addEventListener("click", pick);
    card.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") pick(); });
    wrap.appendChild(card);
  }
}

export function showEnding(title: string, epilogue: string, endingId?: string | null): void {
  $("ending-title").textContent = title;
  $("ending-text").textContent = epilogue;
  const img = $("ending-img") as HTMLImageElement;
  if (endingId) {
    img.hidden = false;
    img.onerror = () => { img.hidden = true; };
    img.src = `/img/screens/screen-ending-${endingId}.png`;
  } else {
    img.hidden = true;
  }
  showScreen("screen-ending");
}

/** Obnoví log z uložené hry. */
export function restoreLog(entries: LogEntry[]): void {
  clearLog();
  for (const e of entries) appendEntry(e.kind, e.text, e.speaker);
}
