// Společné kroky testů v prohlížeči (není to test: soubory testů jsou *.e2e.ts).
import type { Page } from "playwright";

/**
 * Zpřístupní vedlejší nástroje palety (Import, Export, Sdílet, Žebříček, Do zlomu, Zrcadlit…).
 * V první kapitole jsou schované pod tlačítkem „Více“ (`[data-akce="paleta-vice"]`,
 * `aria-expanded`); jinde je paleta celá a krok nic nedělá.
 */
export async function rozbalPaletu(s: Page): Promise<void> {
  const vice = s.locator('#obrazovka-uroven [data-akce="paleta-vice"][aria-expanded="false"]');
  if ((await vice.count()) > 0 && (await vice.first().isVisible())) await vice.first().click();
}

/** Načte most oknem Import (text zápisu mostu), jak to dělá hráč. */
export async function nactiMostImportem(s: Page, text: string): Promise<void> {
  await rozbalPaletu(s);
  await s.locator('#obrazovka-uroven .paleta [data-akce="import"]').click();
  await s.locator("#okno-obsah").fill(text);
  await s.locator('[data-akce="okno-nacist"]').click();
}
