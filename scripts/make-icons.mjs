// Renders the brand mark to every PNG the web app, Android and iOS need.
// Usage: node scripts/make-icons.mjs   (needs Playwright's Chromium)
const pw = await import(process.env.PLAYWRIGHT || "playwright"); const chromium = pw.chromium || pw.default.chromium; // set PLAYWRIGHT=/path/to/playwright if it is installed globally
import { writeFileSync, mkdirSync } from "node:fs";

const MARIGOLD = "#E39A14", INK = "#2A1A00", LIGHT = "#EEF1F4", DARK = "#0E141A";
// The mark on a 100x100 canvas: tilted tile, tick, three dust puffs.
const mark = ({ tile = MARIGOLD, tick = INK, puff = "#8A97A5", scale = 1, tileOn = true } = {}) => `
  <g transform="translate(50 50) scale(${scale}) translate(-50 -50)">
    ${tileOn ? `<rect x="14" y="18" width="62" height="62" rx="17" fill="${tile}" transform="rotate(-6 45 49)"/>` : ""}
    <path d="M29 49.5l11 11L61 35" fill="none" stroke="${tick}" stroke-width="9.5" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="80" cy="25" r="5.4" fill="${puff}" opacity=".75"/><circle cx="88.5" cy="17" r="4" fill="${puff}" opacity=".6"/><circle cx="91" cy="30" r="3" fill="${puff}" opacity=".5"/>
  </g>`;
const svg = (body, bg = "none", rounded = 0) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">${bg !== "none" ? `<rect width="100" height="100" rx="${rounded}" fill="${bg}"/>` : ""}${body}</svg>`;

// Launcher icon: ink tick + soft puffs on a full marigold square (OS applies its own mask).
const launcherFg = (s) => `<g transform="translate(50 50) scale(${s}) translate(-50 -50)">
  <path d="M27 51l13 13L66 36" fill="none" stroke="${INK}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="74" cy="27" r="5.5" fill="#FFF6E0" opacity=".85"/><circle cx="82" cy="19" r="4" fill="#FFF6E0" opacity=".7"/><circle cx="84.5" cy="32" r="3" fill="#FFF6E0" opacity=".6"/></g>`;

const jobs = [
  // Capacitor assets sources (1024 / 2732)
  ["assets/icon-only.png", 1024, svg(launcherFg(1), MARIGOLD)],
  ["assets/icon-foreground.png", 1024, svg(launcherFg(0.62))],
  ["assets/icon-background.png", 1024, svg("", MARIGOLD)],
  ["assets/splash.png", 2732, svg(mark({ scale: 0.22 }), LIGHT)],
  ["assets/splash-dark.png", 2732, svg(mark({ scale: 0.22, puff: "#93A2B2" }), DARK)],
  // Web / PWA
  ["public/icons/icon-180.png", 180, svg(launcherFg(1), MARIGOLD)],
  ["public/icons/icon-192.png", 192, svg(launcherFg(1), MARIGOLD, 22)],
  ["public/icons/icon-512.png", 512, svg(launcherFg(1), MARIGOLD, 22)],
  ["public/icons/maskable-512.png", 512, svg(launcherFg(0.72), MARIGOLD)],
];
// Android notification small icon: white glyph on transparent.
const stat = svg(`<path d="M18 52l17 17L78 26" fill="none" stroke="#fff" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="84" cy="62" r="7" fill="#fff"/><circle cx="90" cy="80" r="5" fill="#fff"/>`);
for (const [d, px] of [["mdpi", 24], ["hdpi", 36], ["xhdpi", 48], ["xxhdpi", 72], ["xxxhdpi", 96]])
  jobs.push([`android/app/src/main/res/drawable-${d}/ic_stat_dd.png`, px, stat]);

writeFileSync("public/icons/favicon.svg", svg(mark({ puff: "#8A97A5" })));

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [out, px, s] of jobs) {
  if (out.startsWith("android/") && !process.argv.includes("--android")) continue;
  await page.setViewportSize({ width: px, height: px });
  await page.setContent(`<html><body style="margin:0;background:transparent">${s.replace('width="100" height="100"', `width="${px}" height="${px}"`)}</body></html>`);
  mkdirSync(out.split("/").slice(0, -1).join("/"), { recursive: true });
  await page.screenshot({ path: out, omitBackground: true, clip: { x: 0, y: 0, width: px, height: px } });
  console.log("✓", out);
}
await browser.close();
