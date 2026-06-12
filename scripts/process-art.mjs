#!/usr/bin/env node
/**
 * Zpracuje vygenerované obrázky z assets-raw/ do herních assetů v public/img/:
 * zmenší na herní rozlišení (VGA vzhled) a kvantizuje paletu PNG.
 *
 * Použití: npm run art
 */
import { readdir, mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const RAW_DIR = "assets-raw";
const OUT_BASE = "public/img";

/** prefix souboru → cílová složka a rozměry */
const RULES = [
  { prefix: "scene-", dir: "scenes", width: 480, height: 270 },
  { prefix: "screen-", dir: "screens", width: 480, height: 270 },
  { prefix: "portrait-", dir: "portraits", width: 96, height: 96 },
  { prefix: "item-", dir: "items", width: 48, height: 48 },
  { prefix: "archetype-", dir: "archetypes", width: 200, height: 300 },
];

const files = (await readdir(RAW_DIR).catch(() => [])).filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
if (!files.length) {
  console.log(`Žádné obrázky v ${RAW_DIR}/ — nahraj vygenerované PNG podle content/art-zadani.md.`);
  process.exit(0);
}

let ok = 0;
let skipped = 0;
for (const file of files) {
  const rule = RULES.find((r) => file.startsWith(r.prefix));
  if (!rule) {
    console.warn(`⚠ ${file}: neznámý prefix (očekávám ${RULES.map((r) => r.prefix).join(", ")}) — přeskočeno`);
    skipped++;
    continue;
  }
  const outDir = path.join(OUT_BASE, rule.dir);
  await mkdir(outDir, { recursive: true });
  const outFile = path.join(outDir, file.replace(/\.(jpe?g|webp)$/i, ".png"));
  await sharp(path.join(RAW_DIR, file))
    .resize(rule.width, rule.height, { fit: "cover", kernel: "lanczos3" })
    .png({ palette: true, colours: 64, dither: 0.5 })
    .toFile(outFile);
  console.log(`✓ ${file} → ${outFile} (${rule.width}×${rule.height})`);
  ok++;
}
console.log(`Hotovo: ${ok} zpracováno, ${skipped} přeskočeno.`);
