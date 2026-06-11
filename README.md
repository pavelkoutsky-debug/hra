# Učedníkova noc

AI textová adventura z rudolfínské Prahy. **Praha 1592:** rabi Löw odjel na Hrad, z půdy Staronové synagogy zmizel šém — a Golem v noci chodí. Hráč je rabínův učedník a má 24 herních hodin, aby věc vyřešil.

- **Vypravěč a rozhodčí (GM):** Claude Opus 4.8 — posuzuje hráčovy nápady podle pravidel, hází kostkami, hlídá příběh a vyhlašuje jeden z 6 konců.
- **NPC (12 postav):** Claude Haiku 4.5 — každá postava má vlastní kartu, paměť vztahu a tajemství.
- Kompletně **česky**, hra na ~2 hodiny, 10 lokací, výběr ze 3 archetypů postavy.

## Architektura

```
prohlížeč (Vite + TS, stav hry v localStorage)
   │  POST /api/gm | /api/npc  (SSE streaming)
   ▼
Cloudflare Worker (bezstavový)
   │  • ověření přístupového kódu (HMAC session token)
   │  • denní limit tahů (KV) — ochrana nákladů
   │  • předhazování kostek d20
   ▼
Anthropic API
   • GM: Opus 4.8 + structured outputs + prompt caching (bible světa ~12k tokenů v keši)
   • NPC: Haiku 4.5 + karta postavy
```

Herní obsah (bible světa, karty NPC, lokace, konce) je oddělen od kódu v `content/`.

## Lokální vývoj

```bash
npm install
npm test                # jednotkové testy (bez API)
npm run check           # typová kontrola

# API klíč pro lokální běh (soubor .dev.vars se necommituje):
echo 'ANTHROPIC_API_KEY=sk-ant-...' > .dev.vars

npm run dev:worker      # build + wrangler dev na :8787 (bez ACCESS_CODE = bez přihlášení)
# v druhém terminálu volitelně frontend s hot-reloadem:
npm run dev             # vite na :5173, proxy /api → :8787
```

Živý smoke test (1 GM tah + 1 NPC replika, stojí pár korun):

```bash
ANTHROPIC_API_KEY=sk-ant-... npm run smoke
```

## Nasazení (Cloudflare Workers, free tier)

```bash
npx wrangler login
npx wrangler kv namespace create LIMITS   # vlož vrácené id do wrangler.toml
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put ACCESS_CODE       # kód, který dáš hráčům
npm run deploy
```

Ochrana nákladů: `DAILY_TURN_LIMIT` ve `wrangler.toml` (default 150 GM tahů/den globálně). Jedno dohrání (~80 tahů) vyjde zhruba na 50–80 Kč; bez KV bindingu se limit nevynucuje.

## Struktura

```
content/            herní obsah (česky): bible světa, 12 NPC karet, lokace, konce, prompty na ilustrace
src/worker/         Cloudflare Worker: routing, auth, limity, GM (Opus), NPC (Haiku), kostky, SSE
src/client/         frontend: obrazovky, streaming vyprávění, ukládání her
src/shared/         typy, pravidla (testy atributů, archetypy), aplikace změn stavu
test/               vitest; smoke.live.test.ts jen ručně přes `npm run smoke`
public/img/         ilustrace lokací (zatím SVG placeholdery — prompty v content/image-prompts.md)
```

## Pravidla hry (zkráceně)

- Test: `d20 + atribut×3 ≥ obtížnost` (8/12/16/20). **Atribut 0 = automatické selhání** — hledej jinou cestu.
- Kostky předhazuje server a GM je musí použít — hody jsou poctivé a hráč je vidí.
- Čas: každá akce stojí minuty; po 24 herních hodinách se rabi vrací.
- Souboje na kola: rychlá akce, nebo vlastní popis — GM posoudí. Skoro vždy existuje nebojové řešení.
- Konců je 6 (jeden skrytý) — hra sleduje pověst, vztah ke Golemovi, postup odhalení a napětí ve městě.
