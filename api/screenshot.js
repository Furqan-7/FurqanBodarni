// Vercel serverless function: a fresh screenshot of one of the portfolio's projects.
//
// Live <iframe> previews break when a site forbids being framed (Crevo sends
// `frame-ancestors 'none'`) or loads slowly, so the project cards show a
// screenshot instead. Vercel's edge caches each image for 12 hours, so the
// screenshot service is called about twice a day per project, however many
// people visit.
//
// Usage: /api/screenshot?site=crevo

const SITES = {
  brainly: 'https://brainlyai.me/',
  devprep: 'https://dev-prep-frontend.vercel.app/',
  crevo: 'https://crevo-one-theta.vercel.app/',
  portfolio: 'https://furqan7.dev/',
  horizon: 'https://horizon-shadox1.vercel.app/',
  fyp: 'https://findyourportfolio.vercel.app/'
};

const fallbackUrl = url => `https://s0.wp.com/mshots/v1/${encodeURIComponent(url)}?w=1280&h=800`;

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

    const img = await fetch(shot);
    if (!img.ok) throw new Error(`image HTTP ${img.status}`);
    const type = img.headers.get('content-type') || 'image/png';
    if (!type.startsWith('image/')) throw new Error(`not an image: ${type}`);

    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=43200, stale-while-revalidate=604800');
    res.status(200).send(Buffer.from(await img.arrayBuffer()));
  } catch (err) {
    // Hand the browser a second screenshot service; cache this answer only briefly.
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600');
    res.setHeader('Location', fallbackUrl(url));
    res.status(302).end();
  }
};

module.exports.SITES = SITES;
