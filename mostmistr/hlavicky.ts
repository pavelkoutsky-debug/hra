/**
 * Bezpečnostní hlavičky webu. Netlify je posílá podle `netlify.toml` (blok `for = "/*"`), náhledový
 * server Vite podle `preview.headers` ve `vite.config.ts`, takže testy v prohlížeči běží se stejnou
 * politikou jako ostrý web. Že `netlify.toml` říká totéž, hlídá `test/hlavicky.test.ts`.
 *
 * Hra nemá žádný vložený skript a nic nestahuje z cizích adres: skripty, pracovní vlákna, styly
 * a dotazy na server jsou z vlastního původu. Obrázek mostu, list a JSON ve správě se stahují
 * přes `blob:` (odkaz s `download`, navigace se politikou neřídí; `img-src blob:` je pro náhled),
 * zvuk vzniká v syntezátoru (`AudioContext`, žádný soubor). Vložené `<style>` mají jen pomocné
 * stránky (správa, měření, otisky, zvuky) a hra nastavuje `style` u prvků, proto `'unsafe-inline'`
 * u stylů (u skriptů ne).
 */
export const POLITIKA_OBSAHU = [
  "default-src 'self'",
  "script-src 'self'",
  "worker-src 'self'",
  "connect-src 'self'",
  "img-src 'self' data: blob:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

/**
 * Hlavičky pro všechny cesty. Mezipaměť sem nepatří: `/assets/*` má být `immutable` a stránky
 * `no-cache`, to má `netlify.toml` po cestách zvlášť (náhledovému serveru na tom nezáleží).
 * V `Permissions-Policy` jsou jen funkce, které Chromium zná: neznámou by hlásil v konzoli jako chybu.
 */
export const HLAVICKY_WEBU: Readonly<Record<string, string>> = {
  "Content-Security-Policy": POLITIKA_OBSAHU,
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
};
