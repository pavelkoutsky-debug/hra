# Učedníkova noc — dokumentace

AI textová adventura z rudolfínské Prahy. **Praha 1592:** rabi Löw spěšně odjel z města, z půdy Staronové synagogy zmizel šém a Golem v noci chodí. Hráč je rabínův učedník a má 24 herních hodin, než se mistr vrátí, aby věc vyřešil. Kompletně česky, hra na ~2 hodiny, 6 konců.

---

## Co hra používá

| Vrstva | Technologie |
|---|---|
| **Frontend** | Vite + TypeScript, čistý DOM (žádný framework), stav hry v `localStorage` |
| **Backend** | Cloudflare Worker (bezstavový), nasazení přes Wrangler |
| **Vypravěč (GM)** | **Claude Opus 4.8** — structured outputs (JSON schema), adaptivní thinking, SSE streaming, prompt caching bible světa |
| **NPC (12 postav)** | **Claude Sonnet 4.6** — structured outputs, streaming |
| **Úložiště limitů** | Cloudflare KV (počítadlo denních tahů) |
| **Testy** | Vitest (43 unit testů + živý smoke test + playtest harness) |

Klíčuje se jediný secret pár: `ANTHROPIC_API_KEY` (volání modelů) a `ACCESS_CODE` (přístupový kód pro hráče).

---

## Jak hra funguje

### Architektura

```
prohlížeč (Vite + TS, stav hry v localStorage)
   │  POST /api/login  → HMAC session token
   │  POST /api/gm | /api/npc  (SSE streaming)
   ▼
Cloudflare Worker (bezstavový)
   │  • ověření přístupového kódu / session tokenu
   │  • denní limit tahů (KV) — ochrana nákladů
   │  • předhazování kostek d20
   ▼
Anthropic API  (GM: Opus 4.8 · NPC: Sonnet 4.6)
```

Server je **bezstavový** — kompletní stav hry (`GameState`) i historie posledních tahů cestují s každým požadavkem z klienta. Worker jen ověří, předhodí kostky, zavolá model a streamuje odpověď zpět.

### Průběh jednoho GM tahu

1. **Klient** pošle `{ state, history (posledních 10 tahů), playerInput }`.
2. **Worker** ověří token, zkontroluje denní limit, předhodí 3× kostku d20 (poctivé hody, hráč je vidí).
3. Sestaví zprávu: bible světa (cachovaný system prompt) + aktuální stav + kronika + kostky + vstup hráče.
4. **Opus 4.8** vrátí strukturovaný JSON: `narration`, `checks` (testy atributů), `state_patch` (změny stavu), `chronicle_update`, `npc_dialogue`, `ending`, `quick_actions`.
5. Worker streamuje vyprávění po kouskách (SSE); během přemýšlení modelu posílá heartbeat.
6. **Klient** aplikuje `state_patch` na stav (deterministicky, s ořezem do bezpečných mezí — model nemůže stav rozbít), uloží do `localStorage`, vykreslí.

### Pravidla (zkráceně)

- **Test atributu:** `d20 + atribut×3 ≥ obtížnost` (8 / 12 / 16 / 20). **Atribut 0 = automatické selhání** — hledej jinou cestu. Kostky předhazuje server, GM je musí použít.
- **Čtyři atributy:** Vědění, Hbitost, Výmluvnost, Odvaha (0–3). Hráč volí ze **3 archetypů** (Učenec / Šikula / Přesvědčivý).
- **Čas:** každá akce stojí minuty; po 24 herních hodinách se rabi vrací. Denní doba je herně klíčová (po setmění zavřené brány, Golem vychází).
- **Souboje na kola**, ale skoro vždy existuje nebojové řešení. HP 0 = smrt.
- **6 konců** (jeden skrytý) — hra sleduje 4 osy: pověst, vztah ke Golemovi, postup odhalení a napětí ve městě (pogrom).

### NPC dialogy

Když hráč osloví klíčovou postavu, GM předá řízení NPC enginu (Sonnet 4.6). Každé NPC má vlastní kartu (kdo je, co ví a jak těžko to vydá, jak jedná) a paměť vztahu k hráči (−5…+5). NPC vrací repliku + naučená fakta + posun vztahu + příznak konce dialogu.

### Pevné kanonické texty

Pro konzistenci a okamžitý start jsou **napevno napsané** (negenerují se modelem):
- **3 úvody** dle archetypu (zobrazí se ihned, bez API volání),
- **10 popisů první návštěvy lokací** (zobrazí se jednou; opakovaná návštěva už ne — sleduje se flagem `navstiveno:`),
- **12 představení NPC** při prvním setkání (flag `potkal:`).

GM dostává kánonické popisy v příloze promptu a sám statický vzhled nepopisuje; trvalé změny prostředí (např. rozbitý stůl) si značí flagem `zmena:` a při návratu je připomene.

### Odolnost proti rozbíjení

GM i NPC mají eskalační žebřík pro mimoherní vstupy (žádosti o recepty, meta-otázky, prompt injection): 1.–2. pokus reakce v roli s humorem doby, 3.+ úsečné utnutí a návrat do děje + časová cena. Žádaný obsah mimo svět se nikdy nedodá, postava nikdy nevypadne z role.

---

## Ochrana nákladů

- **Denní strop GM i NPC tahů** (`DAILY_TURN_LIMIT`, default 150/den globálně) vynucený přes KV. Tahy nad limit hra zdvořile odmítne.
- Bible světa (~12k tokenů) je v **prompt cache** — opakovaně se neúčtuje plnou cenou.
- Jedno dohrání (~80 tahů) vyjde zhruba na 50–80 Kč.

---

## Struktura projektu

```
content/            herní obsah (česky):
  world-bible.md      bible světa — role GM, pravidla, skrytá zápletka, lokace, NPC, konce
  npcs/*.md           12 karet postav
  locations.json      10 lokací (jméno, obrázek, blurb, kánonický popis)
  intros.json         3 úvody dle archetypu
  npc-intros.json     12 představení NPC
  endings.md          6 konců
src/worker/         Cloudflare Worker: routing, auth, limity, GM, NPC, kostky, SSE
src/client/         frontend: obrazovky, streaming vyprávění, ukládání her
src/shared/         typy, pravidla, aplikace změn stavu, kanonické texty
scripts/playtest.ts harness pro testování hry tah po tahu z CLI
test/               vitest (unit + smoke + helpers)
```

---

## Vývoj a nasazení

```bash
npm install
npm test            # 43 unit testů (bez API)
npm run check       # typová kontrola

# lokální běh (API klíč v .dev.vars, necommituje se):
echo 'ANTHROPIC_API_KEY=sk-ant-...' > .dev.vars
npm run dev:worker  # build + wrangler dev na :8787
npm run dev         # volitelně frontend s hot-reloadem na :5173

# živý test (stojí pár korun):
ANTHROPIC_API_KEY=sk-ant-... npm run smoke           # 1 GM tah + 1 NPC replika
ANTHROPIC_API_KEY=sk-ant-... npm run playtest -- new ucenec test1   # hra tah po tahu

# nasazení:
npx wrangler kv namespace create LIMITS    # id do wrangler.toml
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put ACCESS_CODE        # kód pro hráče
npm run deploy
```

**Produkce:** https://ucednikova-noc.pavel-koutsky.workers.dev
