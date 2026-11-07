// Captures a crisp, tall screenshot of every project for the Projects cards.
// Runs in GitHub Actions (.github/workflows/project-previews.yml); output goes to
// images/previews/<key>.webp. A site that fails to load keeps its previous image.
import { chromium } from 'playwright';
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const SITES = {
  brainly: { url: 'https://brainlyai.me/' },
  devprep: { url: 'https://dev-prep-frontend.vercel.app/' },
  crevo: { url: 'https://crevo-one-theta.vercel.app/' },
  portfolio: { url: 'https://furqan7.dev/', settle: 9000 }, // intro splash plays first
  horizon: { url: 'https://horizon-shadox1.vercel.app/' },
  fyp: { url: 'https://findyourportfolio.vercel.app/' }
};

const WIDTH = 1440;          // desktop layout
const VIEW_HEIGHT = 960;     // 3:2, the shape of the preview area on the cards
const MAX_HEIGHT = 2880;     // up to three screens tall for the hover scroll
const OUT_WIDTH = 1600;      // ~3x the card's on-screen width, still light as WebP

await mkdir('images/previews', { recursive: true });
const browser = await chromium.launch();
let failed = 0;

for (const [key, site] of Object.entries(SITES)) {
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: VIEW_HEIGHT },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
    reducedMotion: 'no-preference'
  });
  const page = await context.newPage();
  try {
    const res = await page.goto(site.url, { waitUntil: 'networkidle', timeout: 90_000 });
    if (!res || res.status() >= 400) throw new Error(`HTTP ${res && res.status()}`);
    // A protected deployment redirects to a login page (e.g. vercel.com/login): never use that.
    const landed = new URL(page.url()).hostname;
    if (landed !== new URL(site.url).hostname) throw new Error(`redirected to ${landed}`);
    await page.waitForTimeout(site.settle || 3500);

    // Scroll through the page so scroll-triggered sections and lazy images appear.
    const total = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < Math.min(total, MAX_HEIGHT); y += 400) {
      await page.evaluate(v => window.scrollTo(0, v), y);
      await page.waitForTimeout(220);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1500);

    const height = Math.max(VIEW_HEIGHT, Math.min(MAX_HEIGHT, await page.evaluate(() => document.documentElement.scrollHeight)));
    const png = await page.screenshot({ clip: { x: 0, y: 0, width: WIDTH, height }, fullPage: true, animations: 'disabled' });
    await sharp(png).resize({ width: OUT_WIDTH }).webp({ quality: 82, effort: 6 }).toFile(`images/previews/${key}.webp`);
    console.log(`✓ ${key}  ${WIDTH}x${height}`);
  } catch (err) {
    failed++;
    console.log(`✗ ${key}  ${err.message} (kept the previous image)`);
  } finally {
    await context.close();
  }
}

await browser.close();
if (failed === Object.keys(SITES).length) process.exit(1);
