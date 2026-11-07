// Vercel serverless function: a fresh screenshot of one of the portfolio's projects.
//
// Backup for the project cards. Their main images are high-resolution captures in
// images/previews/, refreshed weekly by the "Project previews" GitHub Action; this
// function is used only if one of those files is missing. Vercel's edge caches each
// image for 12 hours.
//
// Usage: /api/screenshot?site=crevo

const SITES = {
  brainly: 'https://brainlyai.me/',
  devprep: 'https://dev-prep-frontend.vercel.app/',
  crevo: 'https://crevo-one-theta.vercel.app/',
  portfolio: 'https://furqan7.dev/',
  horizon: 'https://horizon-eight-theta.vercel.app/',
  fyp: 'https://findyourportfolio.vercel.app/'
};

module.exports = async (req, res) => {
  const key = String((req.query && req.query.site) || '').toLowerCase();
  const url = SITES[key];
  if (!url) {
    res.status(404).json({ error: 'Unknown site' });
    return;
  }

  try {
    const api = new URL('https://api.microlink.io/');
    api.searchParams.set('url', url);
    api.searchParams.set('screenshot', 'true');
    api.searchParams.set('meta', 'false');
    api.searchParams.set('viewport.width', '1280');
    api.searchParams.set('viewport.height', '800');
    api.searchParams.set('waitForTimeout', '2500');
    const meta = await fetch(api, { headers: { 'User-Agent': 'furqan7.dev screenshots' } });
    if (!meta.ok) throw new Error(`microlink HTTP ${meta.status}`);
    const json = await meta.json();
    const shot = json && json.data && json.data.screenshot && json.data.screenshot.url;
    if (!shot) throw new Error('No screenshot URL');
    // A protected deployment redirects to a login page: don't show that on a card.
    const landed = json.data.url && new URL(json.data.url).hostname;
    if (landed && landed !== new URL(url).hostname) throw new Error(`redirected to ${landed}`);

    const img = await fetch(shot);
    if (!img.ok) throw new Error(`image HTTP ${img.status}`);
    const type = img.headers.get('content-type') || 'image/png';
    if (!type.startsWith('image/')) throw new Error(`not an image: ${type}`);

    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=43200, stale-while-revalidate=604800');
    res.status(200).send(Buffer.from(await img.arrayBuffer()));
  } catch (err) {
    // No half-loaded or placeholder images: the card shows the project name instead.
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600');
    res.status(502).json({ error: String((err && err.message) || err) });
  }
};

module.exports.SITES = SITES;
