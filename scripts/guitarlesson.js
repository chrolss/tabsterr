#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const BASE = 'https://www.theguitarlesson.com';
const TABS_BASE = `${BASE}/guitar-pro-tabs`;
const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const POLITE_DELAY_MS = 300;
const MAX_PAGES = 50;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&nbsp;/g, ' ');
}

function slugify(s) {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

async function fetchText(url) {
  let res;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,*/*' },
      redirect: 'follow',
    });
  } catch (err) {
    throw new Error(`Network error fetching ${url}: ${err.message}`);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  return res.text();
}

const ENTRY_TITLE_RE =
  /<h2[^>]*class="[^"]*entry-title[^"]*"[^>]*>\s*<a href="([^"]+)"[^>]*>([^<]*)<\/a>\s*<\/h2>/g;

function parseSearchResults(html) {
  const out = [];
  let m;
  while ((m = ENTRY_TITLE_RE.exec(html))) {
    out.push({
      url: m[1],
      display: decodeEntities(m[2]).replace(/\s+/g, ' ').trim(),
    });
  }
  return out;
}

function parseTitle(display) {
  const raw = decodeEntities(display).replace(/\s+/g, ' ').trim();
  const norm = raw.replace(/[\u2013\u2014]/g, '-');
  const parts = norm.split(' - ');
  const artist = (parts.pop() || '').trim();
  let song = parts.join(' - ').trim();
  let version = null;
  const vm = song.match(/^(.*)\s+\((\d+)\)$/);
  if (vm) {
    song = vm[1].trim();
    version = Number(vm[2]);
  }
  return { display: raw, song, artist, version };
}

async function searchTabs(query, { maxPages = MAX_PAGES } = {}) {
  const seen = new Set();
  const results = [];
  for (let page = 1; page <= maxPages; page++) {
    const url =
      page === 1
        ? `${TABS_BASE}/?s=${encodeURIComponent(query)}`
        : `${TABS_BASE}/page/${page}/?s=${encodeURIComponent(query)}`;
    let html;
    try {
      html = await fetchText(url);
    } catch (err) {
      break;
    }
    const found = parseSearchResults(html);
    let added = 0;
    for (const item of found) {
      if (!seen.has(item.url)) {
        seen.add(item.url);
        results.push({ ...item, ...parseTitle(item.display) });
        added++;
      }
    }
    await sleep(POLITE_DELAY_MS);
    if (found.length === 0 || added === 0) break;
  }
  return results;
}

const H1_RE = /<h1[^>]*class="[^"]*entry-title[^"]*"[^>]*>([^<]*)<\/h1>/;
const FILE_LINK_RE = /href="(https:\/\/[^"]*\/song-files\/[^"]+\.(gp[0-9]+|gpx|gp))"/gi;
const ARTIST_FIELD_RE = /<strong>\s*Artist\/group:\s*<\/strong>\s*([^<]+)/i;

async function getTabPage(url, fallback) {
  const html = await fetchText(url);
  let info = fallback ? { ...fallback } : {};
  const h1m = html.match(H1_RE);
  if (h1m) {
    info = { ...info, ...parseTitle(h1m[1]) };
  }
  const artistField = html.match(ARTIST_FIELD_RE);
  if (artistField) info.artist = decodeEntities(artistField[1]).trim();
  const files = [];
  let m;
  const re = new RegExp(FILE_LINK_RE.source, 'gi');
  while ((m = re.exec(html))) {
    const ext = m[2].toLowerCase();
    if (!files.some((f) => f.ext === ext)) files.push({ url: decodeEntities(m[1]), ext });
  }
  const priority = { gp4: 0, gp5: 1, gp3: 2, gpx: 3, gp: 4 };
  files.sort((a, b) => (priority[a.ext] ?? 9) - (priority[b.ext] ?? 9));
  info.url = url;
  info.files = files;
  return info;
}

function artistMatches(r, filter) {
  const f = filter.toLowerCase();
  return (
    r.artist.toLowerCase().includes(f) || slugify(r.artist).includes(slugify(f))
  );
}

function buildFileName(info, ext) {
  const artist = slugify(info.artist) || 'unknown';
  let song = slugify(info.song) || 'untitled';
  if (info.version && info.version > 1) song = `${song}_v${info.version}`;
  return `${artist}-${song}.${ext}`;
}

async function downloadFile(url, destPath) {
  let res;
  try {
    res = await fetch(encodeURI(url), {
      headers: { 'User-Agent': USER_AGENT },
      redirect: 'follow',
    });
  } catch (err) {
    throw new Error(`Network error downloading ${url}: ${err.message}`);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(destPath, buf);
  return buf.length;
}

async function cmdSearch(query, opts) {
  console.log(`Searching for "${query}" ...`);
  const results = await searchTabs(query, { maxPages: opts.pages });
  let rows = results;
  if (opts.artist) {
    rows = rows.filter((r) => artistMatches(r, opts.artist));
  }
  if (!rows.length) {
    console.log('No results found.');
    return;
  }
  console.log(`\n${rows.length} match${rows.length > 1 ? 'es' : ''}:`);
  rows.forEach((r, i) => {
    const v = r.version ? ` (version ${r.version})` : '';
    console.log(`${String(i + 1).padStart(2)}. ${r.song}${v} — ${r.artist}`);
    console.log(`   ${r.url}`);
  });
}

async function cmdDownload(query, opts) {
  console.log(`Searching for "${query}" ...`);
  const results = await searchTabs(query, { maxPages: opts.pages });
  if (!results.length) throw new Error('No tabs found for query.');

  let candidates = results;
  if (opts.artist) {
    const filtered = candidates.filter((r) => artistMatches(r, opts.artist));
    if (!filtered.length) {
      throw new Error(`No tabs found for artist "${opts.artist}".`);
    }
    candidates = filtered;
  }

  let pick;
  if (opts.number !== null && opts.number !== undefined) {
    pick = candidates[opts.number - 1];
    if (!pick) {
      throw new Error(
        `No tab number ${opts.number} in the list (only ${candidates.length} result${candidates.length === 1 ? '' : 's'}).`
      );
    }
  } else if (opts.version !== null && opts.version !== undefined) {
    pick =
      candidates.find((r) => r.version === opts.version) ||
      candidates.find((r) => !r.version && opts.version === 1);
    if (!pick) throw new Error(`No version ${opts.version} of "${query}" found.`);
  } else {
    pick =
      candidates.find((r) => !r.version) ||
      candidates.slice().sort((a, b) => (b.version || 1) - (a.version || 1))[0];
  }

  console.log(
    `Downloading: ${pick.song}${pick.version ? ` (version ${pick.version})` : ''} — ${pick.artist}`
  );

  const info = await getTabPage(pick.url, pick);
  await sleep(POLITE_DELAY_MS);

  const format = (opts.format || 'gp4').toLowerCase();
  let selected;
  if (format === 'all') {
    selected = info.files;
  } else {
    selected = info.files.filter((f) => f.ext === format);
    if (!selected.length && format === 'gp4') {
      const gp3 = info.files.filter((f) => f.ext === 'gp3');
      if (gp3.length) {
        console.log('  no .gp4 file, falling back to .gp3');
        selected = gp3;
      }
    }
  }
  if (!selected.length) {
    const avail = info.files.map((f) => f.ext).join(', ') || 'none';
    throw new Error(`No .${format} file on page (available: ${avail}).`);
  }

  const outDir = path.resolve(opts.out);
  fs.mkdirSync(outDir, { recursive: true });

  for (const file of selected) {
    const fileName = buildFileName(info, file.ext);
    const dest = path.join(outDir, fileName);
    if (fs.existsSync(dest) && !opts.force) {
      console.log(`  exists, skipping: ${fileName}`);
      continue;
    }
    console.log(`  fetching ${fileName} ...`);
    const bytes = await downloadFile(file.url, dest);
    console.log(`  saved ${fileName} (${(bytes / 1024).toFixed(1)} kb)`);
    await sleep(POLITE_DELAY_MS);
  }
}

function printHelp() {
  console.log(`TheGuitarLesson.com GP tab downloader for Tabsterr

Usage:
  guitarlesson search <query> [--artist NAME] [--pages N]
  guitarlesson download <query> [--artist NAME] [--number N] [--format gp4|gp3|all]
                [--version N] [--out DIR] [--force]
  guitarlesson help

Commands:
  search    List tabs matching <query> (title, version, artist, url).
  download  Resolve <query> to a tab and save the .gp file into --out.

Options:
  --artist NAME  Restrict matches to this artist (substring match).
  --number N     Download the tab at position N from the search list.
  --format FMT   File format to download: gp4 (default), gp3, or all.
                 Falls back to gp3 when no gp4 file exists.
  --version N    Pick a specific version of the tab (see search output).
  --pages N      Max search result pages to scan (default ${MAX_PAGES}).
  --out DIR      Output directory (default: tabs).
  --force        Overwrite existing files.
`);
}

function parseArgs(argv) {
  const opts = {
    _: [],
    artist: null,
    format: 'gp4',
    version: null,
    number: null,
    pages: MAX_PAGES,
    out: 'tabs',
    force: false,
    help: false,
  };
  const flags = {
    '--artist': 'artist',
    '--format': 'format',
    '--version': 'version',
    '--number': 'number',
    '--pages': 'pages',
    '--out': 'out',
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (flags[a]) {
      opts[flags[a]] = argv[++i];
    } else if (a === '--force') {
      opts.force = true;
    } else if (a === '--help' || a === '-h') {
      opts.help = true;
    } else {
      opts._.push(a);
    }
  }
  if (opts.pages) opts.pages = Number(opts.pages);
  if (opts.version !== null && opts.version !== undefined) {
    opts.version = Number(opts.version);
  }
  if (opts.number !== null && opts.number !== undefined) {
    opts.number = Number(opts.number);
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const [command, ...rest] = opts._;
  if (opts.help || !command) {
    printHelp();
    return;
  }
  try {
    if (command === 'search') {
      const query = rest.join(' ');
      if (!query) throw new Error('search requires a query.');
      await cmdSearch(query, opts);
    } else if (command === 'download') {
      const query = rest.join(' ');
      if (!query) throw new Error('download requires a query.');
      await cmdDownload(query, opts);
    } else {
      throw new Error(`Unknown command: ${command}`);
    }
  } catch (err) {
    console.error(`\nerror: ${err.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  searchTabs,
  artistMatches,
  getTabPage,
  buildFileName,
  downloadFile,
};

if (require.main === module) {
  main();
}