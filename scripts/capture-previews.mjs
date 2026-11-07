// Captures a crisp, tall screenshot of every project for the Projects cards.
// Runs in GitHub Actions (.github/workflows/project-previews.yml); output goes to
// images/previews/<key>.webp. A site that fails to load keeps its previous image.
import { chromium } from 'playwright';
import sharp from 'sharp';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const SITES = {
  brainly: { url: 'https://brainlyai.me/' },
  devprep: { url: 'https://dev-prep-frontend.vercel.app/' },
  crevo: { url: 'https://crevo-one-theta.vercel.app/' },
  portfolio: { url: 'https://furqan7.dev/', settle: 9000 }, // intro splash plays first
  horizon: { url: 'https://horizon-eight-theta.vercel.app/' },
  fyp: { url: 'https://findyourportfolio.vercel.app/' }
};

const WIDTH = 1440;          // desktop layout
const VIEW_HEIGHT = 960;     // 3:2, the shape of the preview area on the cards
const MAX_HEIGHT = 2880;     // up to three screens tall for the hover scroll
const OUT_WIDTH = 1600;      // ~3x the card's on-screen width, still light as WebP

// Can furqan7.dev show this site inside a frame? Decided from the page's own headers:
// CSP frame-ancestors wins when present, otherwise X-Frame-Options.
const EMBEDDER = 'https://furqan7.dev';
function frameable(headers) {
  const csp = headers['content-security-policy'] || '';
  const fa = csp.split(';').map(d => d.trim()).find(d => /^frame-ancestors\b/i.test(d));
  if (fa) {
    const sources = fa.split(/\s+/).slice(1).map(x => x.replace(/\/$/, '').toLowerCase());
    return sources.some(x => x === '*' || x === 'https:' || x === EMBEDDER || x === 'furqan7.dev');
  }
  const xfo = (headers['x-frame-options'] || '').toLowerCase();
  return !/deny|sameorigin/.test(xfo);
}

await mkdir('images/previews', { recursive: true });
let frames = {};
try { frames = JSON.parse(await readFile('images/previews/frames.json', 'utf8')).sites || {}; } catch {}
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
    frames[key] = { url: site.url, frameable: frameable(await res.allHeaders()) };
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
    console.log(`✓ ${key}  ${WIDTH}x${height}  live preview: ${frames[key].frameable ? 'allowed' : 'blocked by the site'}`);
  } catch (err) {
    failed++;
    console.log(`✗ ${key}  ${err.message} (kept the previous image)`);
  } finally {
    await context.close();
  }
}

await browser.close();
// Only sites that allow it get a live preview on their card; a failed site keeps its last answer.
await writeFile('images/previews/frames.json', JSON.stringify({ updated: new Date().toISOString(), sites: frames }, null, 2) + '\n');
if (failed === Object.keys(SITES).length) process.exit(1);
