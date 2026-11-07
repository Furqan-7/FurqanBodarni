// Vercel serverless function: GitHub contribution calendar for the last 12 months.
//
// - With a GITHUB_TOKEN environment variable (Vercel → Settings → Environment Variables),
//   it uses GitHub's GraphQL API, which returns the exact numbers shown on the profile.
// - Without a token, it reads the public contribution graph from github.com, the same
//   graph that appears on https://github.com/Furqan-7.
//
// Response shape: { source, total: { lastYear }, contributions: [{ date, count, level }] }

const USER = 'Furqan-7';

module.exports = async (req, res) => {
  try {
    let data;
    if (process.env.GITHUB_TOKEN) {
      try {
        data = await fromGraphQL(process.env.GITHUB_TOKEN);
      } catch (e) {
        data = await fromProfile();
      }
    } else {
      data = await fromProfile();
    }
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json(data);
  } catch (err) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).json({ error: String((err && err.message) || err) });
  }
};

async function fromGraphQL(token) {
  const query = `query($login: String!) {
    user(login: $login) {
      contributionsCollection {
        contributionCalendar {
          totalContributions
          weeks { contributionDays { date contributionCount contributionLevel } }
        }
      }
    }
  }`;
  const r = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'furqan7.dev'
    },
    body: JSON.stringify({ query, variables: { login: USER } })
  });
  if (!r.ok) throw new Error(`GraphQL HTTP ${r.status}`);
  const json = await r.json();
  const cal = json && json.data && json.data.user && json.data.user.contributionsCollection
    && json.data.user.contributionsCollection.contributionCalendar;
  if (!cal) throw new Error('No contribution calendar in GraphQL response');
  const LEVEL = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };
  const contributions = cal.weeks
    .flatMap(w => w.contributionDays)
    .map(d => ({ date: d.date, count: d.contributionCount, level: LEVEL[d.contributionLevel] || 0 }))
    .sort(byDate);
  return { source: 'github-graphql', total: { lastYear: cal.totalContributions }, contributions };
}

async function fromProfile() {
  const r = await fetch(`https://github.com/users/${USER}/contributions`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; furqan7.dev contributions)',
      Accept: 'text/html',
      'X-Requested-With': 'XMLHttpRequest'
    }
  });
  if (!r.ok) throw new Error(`GitHub HTTP ${r.status}`);
  return parseProfile(await r.text());
}

function parseProfile(html) {
  // Tooltips hold the per-day count: "3 contributions on May 2nd." / "No contributions on ..."
  const tips = new Map();
  for (const m of html.matchAll(/<tool-tip\b[^>]*\sfor="([^"]+)"[^>]*>([\s\S]*?)<\/tool-tip>/g)) {
    tips.set(m[1], m[2].replace(/<[^>]*>/g, '').trim());
  }

  const days = [];
  for (const m of html.matchAll(/<td\b[^>]*\sdata-date="(\d{4}-\d{2}-\d{2})"[^>]*>/g)) {
    const tag = m[0];
    const attr = name => {
      const a = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
      return a ? a[1] : undefined;
    };
    const level = Math.max(0, Math.min(4, Number(attr('data-level')) || 0));
    let count = attr('data-count') !== undefined ? Number(attr('data-count')) : NaN;
    if (!Number.isFinite(count)) {
      const tip = tips.get(attr('id')) || '';
      const n = tip.match(/^([\d,]+)\s+contributions?\b/i);
      count = n ? Number(n[1].replace(/,/g, '')) : 0;
    }
    days.push({ date: m[1], count, level });
  }
  if (!days.length) throw new Error('No contribution days found in GitHub response');
  days.sort(byDate);

  const heading = html.match(/([\d,]+)\s+contributions?\s+in the last year/i);
  const total = heading
    ? Number(heading[1].replace(/,/g, ''))
    : days.reduce((sum, d) => sum + d.count, 0);
  return { source: 'github-profile', total: { lastYear: total }, contributions: days };
}

function byDate(a, b) {
  return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
}

module.exports.parseProfile = parseProfile;
