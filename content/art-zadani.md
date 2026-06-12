# Zadání grafických assetů — Nano Banana 2

Kompletní seznam promptů pro vygenerování pixel art grafiky hry. **Postup:**

1. Každý řádek tabulky = jeden obrázek. Ke každému promptu **předřaď STYLE BLOCK** (níže).
2. Vygenerovaný soubor pojmenuj **přesně** podle sloupce „Soubor" a nahraj do složky `assets-raw/` v repu (plné rozlišení, PNG).
3. Dodrž **poměr stran** uvedený u sekce (v Nano Banana 2 nastav aspect ratio).
4. Zpracování (zmenšení na herní rozlišení + kvantizace palety) proběhne automaticky příkazem `npm run art`.

## STYLE BLOCK (předřadit každému promptu)

> Pixel art in the authentic style of an early-1990s VGA point-and-click adventure game (Sierra SCI1, Quest for Glory II, LucasArts era), 320x200 game resolution aesthetic, limited 256-color VGA palette, visible chunky pixels, hand-placed pixel clusters, ordered dithering for gradients and shadows, dark atmospheric chiaroscuro, 16th century Prague in winter, Rudolfine era, February 1592, night and candlelight mood. Flat 2D game background art, no anti-aliased smooth gradients, no photorealism, no 3D render, no text, no letters, no watermark, no UI elements, no modern objects.

## A1. Scény lokací (10 ks, poměr **16:9**)

| Soubor | Prompt (za STYLE BLOCK) |
|---|---|
| `scene-rabinuv-dum.png` | A rabbi's study at dawn: walls of leather-bound Hebrew books, scattered manuscripts on a heavy oak desk, a guttering candle, an empty carved chair, frost on a small leaded window, cold blue dawn light meeting warm candle glow. Wide adventure game room background, eye-level view. |
| `scene-synagoga.png` | The Old New Synagogue exterior at winter twilight: brick gothic gables, narrow lancet windows glowing faintly from within, snow on cobblestones, a hunched figure with a lantern by the heavy wooden door, deep blue dusk sky with first stars. |
| `scene-puda-synagogy.png` | A vast dark synagogue attic: massive wooden roof beams, dusty prayer shawls hanging, a shaft of moonlight through a broken forced-open shutter, scattered footprints in dust, and in the far corner a huge man-shaped mass under a canvas sheet, barely visible. Tense crime scene mood. |
| `scene-radnice.png` | Interior of a renaissance Jewish town hall office: ledgers, wax seals and documents on a long oak table, tall chair, a window overlooking crowded snowy ghetto rooftops, warm lamplight, rich but austere furnishings. |
| `scene-hrbitov.png` | The Old Jewish Cemetery of Prague in snow: hundreds of crowded tilted gravestones with Hebrew-style carvings (unreadable, no real letters), bare twisted elder trees, black crows, grey winter sky, a narrow path through the stones, a small hunched old woman in the distance. |
| `scene-ulicka-ghetta.png` | A narrow ghetto lane at dusk: overhanging medieval timber houses almost touching above the street, a stone fountain with women gathered, a pawnshop's barred window glowing, a heavy wooden gate with a guard's burning brazier at the far end, snow and long shadows. |
| `scene-krcma.png` | A smoky 16th century tavern interior: low vaulted stone ceiling, wooden tables with tankards and dice, a large fireplace with firelight, a scarred mercenary drinking alone by a small window, barrels, hanging dried herbs, warm orange light against dark corners. |
| `scene-staromak.png` | Old Town Square of Prague in winter, market before the twin gothic spires of Týn Church: market stalls, bundled townsfolk, a Dominican friar in white-and-black habit preaching from church steps to a gathering crowd, the astronomical clock tower in shadow, late afternoon cold light, tension in the crowd. |
| `scene-dilna-scotty.png` | An alchemist's workshop: glass alembics and retorts bubbling over coals, a stuffed crocodile hanging from the ceiling, astrological charts on the walls, green-tinged smoke, theatrical velvet drapes, brass instruments, candles, mysterious glow. |
| `scene-dum-sberatele.png` | A nobleman's cabinet of curiosities at night: tall glass display cases with strange artifacts, a unicorn horn, clockwork automatons, exotic shells and skulls, and on a central pedestal one small glass casket glowing faintly golden, tall leaded windows with moonlight, marble floor. Sinister elegance. |

## A2. Titulní obrazovka a konce (7 ks, poměr **16:9**)

| Soubor | Prompt (za STYLE BLOCK) |
|---|---|
| `screen-title.png` | Epic adventure game title screen background: the Old New Synagogue of Prague silhouetted against a huge full moon and starry winter night sky, snowy rooftops of the ghetto, and rising behind the rooftops the enormous dark silhouette of a clay golem with two faintly glowing eyes. Dramatic, mysterious, iconic composition with empty dark sky in the upper third (space reserved for a game logo). |
| `screen-ending-strazce-tajemstvi.png` | Quiet triumphant dawn over the snowy rooftops of the Prague ghetto: first golden sunlight, smoke from chimneys, a young apprentice seen from behind on the synagogue steps quietly closing the heavy door, peace and secrecy. Warm hopeful mood. |
| `screen-ending-ucencova-slava.png` | A renaissance court hall scene: a young Jewish apprentice standing upright before assembled noblemen and officials, presenting documents with seals, courtiers murmuring, banners and candle chandeliers, triumphant public moment, golden light. |
| `screen-ending-horke-vitezstvi.png` | Bittersweet victory scene: dawn over Prague after a hard night, a weary young apprentice holding a small scroll case, walking through a damaged snowy street with broken shutters and scattered debris, citizens peeking from doorways, cold pale light, somber but resolved mood. |
| `screen-ending-navrat-mistra.png` | An old bearded rabbi in dark robes returning through the ghetto gate at dawn, stern and sorrowful, while behind him the quarter is in uneasy turmoil — people arguing, a broken cart, distant smoke. The apprentice stands small and ashamed in the foreground shadow. Ambiguous grey morning. |
| `screen-ending-pokuseni-moci.png` | Dark forbidden ending scene: a young apprentice alone in a candlelit cellar holding a glowing parchment scroll aloft, green-tinged unholy light, and looming over him from the darkness the massive clay golem with burning eyes awaiting command. Ominous, corrupted power mood. |
| `screen-ending-tmava-ulicka.png` | A dark narrow medieval alley at night after tragedy: fresh snow, a fallen lantern still burning on the ground next to a dropped book and scattered papers, long shadow of an unseen huge figure departing, cold moonlight. Solemn death scene, no body visible. |

## A3. Karty archetypů (3 ks, poměr **2:3 na výšku**)

| Soubor | Prompt (za STYLE BLOCK) |
|---|---|
| `archetype-ucenec.png` | Character selection portrait, full figure: a young Jewish scholar apprentice in dark modest robes and kippah, holding an open Hebrew book and a candle, ink-stained fingers, thoughtful intelligent face, standing in a library nook. Adventure game character select art, full body, centered. |
| `archetype-sikula.png` | Character selection portrait, full figure: a wiry young street urchin of the ghetto in a patched coat and cap, coiled rope over shoulder, lockpicks in hand, cocky alert grin, crouching slightly against a brick alley wall at night. Full body, centered. |
| `archetype-presvedcivy.png` | Character selection portrait, full figure: a well-dressed young merchant's son in a fine doublet and coat, holding a coin purse, a silver ring catching light, confident persuasive smile, open inviting gesture, market stalls behind him. Full body, centered. |

## A4. Portréty NPC (12 ks, čtverec **1:1**)

Ke každému promptu přidej za STYLE BLOCK ještě tento dodatek:

> Adventure game dialogue portrait, head and shoulders, facing slightly toward viewer, dark simple background, dramatic candlelight from one side, strong readable silhouette.

| Soubor | Prompt (za STYLE BLOCK + dodatek) |
|---|---|
| `portrait-avram.png` | A nervous 50-year-old Jewish synagogue sexton: thin grey beard, worried watery eyes, trembling posture, simple dark worn coat and kippah, wringing his hands, guilt and fear in his face. |
| `portrait-maisel.png` | A dignified 70-year-old Jewish elder and banker, mayor of the ghetto: long white beard, fur-trimmed rich dark coat, gold chain of office, wise measuring gaze, calm authority. |
| `portrait-jentl.png` | A tiny ancient herbalist woman: deeply wrinkled kind face, headscarf, a sprig of herbs tucked in her shawl, knowing gentle smile, eyes like a bird, a crow perched near her shoulder. |
| `portrait-pinchas.png` | A sly middle-aged pawnbroker: thin face, quick calculating eyes, neat little beard, modest but carefully kept clothes, fingers touching a coin, polite merchant smile that never reaches the eyes. |
| `portrait-rivka.png` | A lively middle-aged widow gossip: round expressive face, headscarf, mouth open mid-sentence, raised eyebrows, hands gesturing, water pail handle visible, theatrical and warm. |
| `portrait-josef.png` | A burly 40-year-old gate guard: broad shoulders, weathered square face, short beard, leather jerkin and iron helmet pushed back, halberd shaft visible, stern honest no-nonsense expression. |
| `portrait-marketa.png` | A sharp-witted innkeeper widow in her forties: strong handsome face, rolled-up sleeves, apron, a tankard in hand, one eyebrow raised, humor and steel in her gaze, firelight from the tavern hearth. |
| `portrait-krystof.png` | A Saxon mercenary with a scar through one eyebrow: broad-shouldered, unshaven, haunted bloodshot eyes that have seen something terrible, military buff coat with a missing button, hand near a knife, tankard before him. |
| `portrait-scotta.png` | A flamboyant Italian alchemist charlatan: pointed waxed beard, velvet robe with astrological embroidery, rings on every finger, theatrical raised hand, charming smile, calculating eyes, green alchemical glow from below. |
| `portrait-lukas.png` | A Dominican friar preacher: white habit with black cappa, tonsured hair, gaunt intelligent ascetic face, gentle dangerous smile, piercing pale eyes, a wooden cross, candlelight. |
| `portrait-vilem.png` | A small round timid secretary: soft pale face shining with sweat, neat ruff collar, ink-stained fingers clutching documents, frightened eyes behind forced official politeness, a key on a cord just visible at his neck. |
| `portrait-lobkowicz.png` | A proud renaissance count and collector: elegant black doublet with gold embroidery, large white ruff collar, trimmed greying goatee, ironic amused aristocratic smile, cold ambitious eyes, curiosity cabinet shelf behind him. |

## A5. Ikony inventáře (22 ks, čtverec **1:1**)

Ke každému promptu přidej za STYLE BLOCK ještě tento dodatek:

> Single inventory item icon for a classic adventure game, one object only, centered, large and readable, plain very dark background, slight rim light, chunky pixel art, no text.

| Soubor | Položka | Prompt (za STYLE BLOCK + dodatek) |
|---|---|---|
| `item-modlitebni-kniha.png` | modlitební kniha | A small thick leather-bound Hebrew prayer book with brass clasps. |
| `item-rabinuv-dopis.png` | rabínův dopis | A folded letter with an unbroken red wax seal and a ribbon. |
| `item-svice.png` | svíce a křesadlo | A bundle of candles together with a flint and steel striker. |
| `item-paklice.png` | paklíče | A ring of slender iron lockpicks of various shapes. |
| `item-nuz.png` | nůž | A simple utilitarian knife with a worn wooden handle and leather sheath. |
| `item-lano.png` | lano | A neatly coiled hemp rope. |
| `item-mesec.png` | měšec s groši | A small leather coin purse with a drawstring, a few silver coins spilling out. |
| `item-prsten.png` | stříbrný prsten | A polished silver ring catching the light. |
| `item-seznam.png` | seznam dlužníků | A long paper scroll-list with rows of unreadable handwriting marks and small numbers. |
| `item-sem.png` | šém | A small parchment scroll glowing with faint golden holy light, in an open flat wooden case. |
| `item-knoflik.png` | mosazný knoflík | A single brass military coat button with a torn thread. |
| `item-upis.png` | dlužní úpis | A debt note document with a signature mark and a small seal. |
| `item-lahev.png` | láhev | A small dark green glass wine bottle, half empty, corked. |
| `item-dopis-pecet.png` | dopis s pečetí | An opened letter with a large ornate aristocratic wax seal showing a coat of arms. |
| `item-propustka.png` | propustka | An official pass document with a heavy court chancellery seal and stamp. |
| `item-klic-velky.png` | klíč od synagogy | A large heavy ancient iron key. |
| `item-klic-maly.png` | klíč od skříňky | A small ornate brass key on a neck cord. |
| `item-spona.png` | stříbrná spona | An antique silver clasp brooch with engraved ornament. |
| `item-glejt.png` | glejt | A safe-conduct document with flourished writing marks and a hanging seal on a cord. |
| `item-opisy.png` | hebrejské opisy | A stack of handwritten manuscript pages with annotation marks in the margins. |
| `item-ritual.png` | hřbitovní hlína a voda | A small cloth pouch of dark earth next to a small glass vial of water. |
| `item-ranec.png` | obecný předmět (fallback) | A small tied cloth bundle, generic mysterious item. |
