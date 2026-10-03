// Runs after `vite build` (npm "postbuild"). Firebase Hosting rewrites every
// URL without its own prerendered file to dist/client/_shell.html — and that
// shell is rendered at "/", so it carries the homepage's rel=canonical and
// og:url. Served as-is for /product/<id> (and any other dynamic route), the
// raw HTML told search engines every product page was a duplicate of the
// homepage. This keeps the homepage's head on its own index.html and strips
// the homepage-only tags from the shell; each route sets its own once it
// renders.
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dist = fileURLToPath(new URL("../dist/client/", import.meta.url));
const shellPath = `${dist}_shell.html`;

copyFileSync(shellPath, `${dist}index.html`);

const HOME_ONLY_TAGS = [
  /<link rel="canonical" href="[^"]*"\s*\/?>/g,
  /<meta property="og:url" content="[^"]*"\s*\/?>/g,
];

let shell = readFileSync(shellPath, "utf8");
for (const tag of HOME_ONLY_TAGS) {
  // Fail loudly if the markup ever changes shape — silently skipping this
  // would bring the duplicate-canonical problem straight back.
  if (!shell.match(tag)) throw new Error(`finalize-hosting: ${tag} not found in _shell.html`);
  shell = shell.replace(tag, "");
}
writeFileSync(shellPath, shell);
console.log("finalize-hosting: index.html written, homepage canonical/og:url removed from the shell");
