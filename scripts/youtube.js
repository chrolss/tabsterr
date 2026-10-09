#!/usr/bin/env node
'use strict';

const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const ALLOWED_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
]);

const PLAYLIST_ID_RE = /^[A-Za-z0-9_-]{10,}$/;
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

function parsePlaylistId(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;

  let listId = null;
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    let url;
    try {
      url = new URL(raw);
    } catch {
      return null;
    }
    if (!ALLOWED_HOSTS.has(url.hostname)) return null;
    listId = url.searchParams.get('list');
  } else if (raw.includes('///') || raw.includes('list=')) {
    const match = raw.match(/[?&]list=([A-Za-z0-9_-]+)/);
    listId = match ? match[1] : null;
  } else {
    listId = raw;
  }

  if (!listId || !PLAYLIST_ID_RE.test(listId)) return null;
  return listId;
}

function decodeEntities(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&nbsp;/g, ' ');
}

function extractInitialData(html) {
  const marker = 'ytInitialData';
  const at = html.indexOf(marker);
  if (at === -1) return null;
  const braceStart = html.indexOf('{', at);
  if (braceStart === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = braceStart; i < html.length; i++) {
    const ch = html[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(braceStart, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function findByKey(node, key, acc) {
  if (!node || typeof node !== 'object') return acc;
  if (Array.isArray(node)) {
    for (const item of node) findByKey(item, key, acc);
    return acc;
  }
  for (const k of Object.keys(node)) {
    if (k === key) acc.push(node[k]);
    findByKey(node[k], key, acc);
  }
  return acc;
}

function pickThumbnail(contentImage, videoId) {
  const sources =
    contentImage &&
    contentImage.thumbnailViewModel &&
    contentImage.thumbnailViewModel.image &&
    contentImage.thumbnailViewModel.image.sources;
  if (Array.isArray(sources) && sources.length) {
    const sorted = sources
      .filter((s) => s && s.url)
      .sort((a, b) => (b.width || 0) - (a.width || 0));
    if (sorted.length) return sorted[0].url;
  }
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

function pickDuration(contentImage) {
  const overlays =
    contentImage &&
    contentImage.thumbnailViewModel &&
    contentImage.thumbnailViewModel.overlays;
  if (!Array.isArray(overlays)) return '';
  for (const overlay of overlays) {
    const badges =
      overlay &&
      overlay.thumbnailBottomOverlayViewModel &&
      overlay.thumbnailBottomOverlayViewModel.badges;
    if (!Array.isArray(badges)) continue;
    for (const badge of badges) {
      const text = badge && badge.thumbnailBadgeViewModel && badge.thumbnailBadgeViewModel.text;
      if (text && /\d+:\d{2}/.test(text)) return text;
    }
  }
  return '';
}

function metadataRows(metadata) {
  const rows =
    metadata &&
    metadata.lockupMetadataViewModel &&
    metadata.lockupMetadataViewModel.metadata &&
    metadata.lockupMetadataViewModel.metadata.contentMetadataViewModel &&
    metadata.lockupMetadataViewModel.metadata.contentMetadataViewModel.metadataRows;
  return Array.isArray(rows) ? rows : [];
}

function rowText(row) {
  if (!row || !Array.isArray(row.metadataParts)) return '';
  return row.metadataParts
    .map((part) => (part && part.text && part.text.content) || '')
    .filter(Boolean)
    .join(' ')
    .trim();
}

function mapLockup(node) {
  const metadata = node.metadata;
  const titleVm =
    metadata && metadata.lockupMetadataViewModel && metadata.lockupMetadataViewModel.title;
  const title = (titleVm && titleVm.content) || '';
  const rows = metadataRows(metadata);
  const channel = rowText(rows[0]);
  const secondRow = rowText(rows[1]);
  const views = rows[1] && rows[1].metadataParts && rows[1].metadataParts[0]
    ? (rows[1].metadataParts[0].text && rows[1].metadataParts[0].text.content) || ''
    : '';
  const age =
    rows[1] && rows[1].metadataParts && rows[1].metadataParts[1]
      ? (rows[1].metadataParts[1].text && rows[1].metadataParts[1].text.content) || ''
      : secondRow;
  return {
    videoId: node.contentId,
    title: decodeEntities(title),
    channel: decodeEntities(channel),
    duration: pickDuration(node.contentImage),
    thumbnail: pickThumbnail(node.contentImage, node.contentId),
    views: decodeEntities(views),
    age: decodeEntities(age),
  };
}

function mapLegacy(node) {
  const title =
    node.title && (node.title.simpleText || (node.title.runs && node.title.runs[0] && node.title.runs[0].text));
  const thumb =
    node.thumbnail &&
    Array.isArray(node.thumbnail.thumbnails) &&
    node.thumbnail.thumbnails.length
      ? node.thumbnail.thumbnails[node.thumbnail.thumbnails.length - 1].url
      : `https://i.ytimg.com/vi/${node.videoId}/hqdefault.jpg`;
  return {
    videoId: node.videoId,
    title: decodeEntities(title || ''),
    channel: decodeEntities(
      node.shortBylineText && node.shortBylineText.runs && node.shortBylineText.runs[0]
        ? node.shortBylineText.runs[0].text
        : ''
    ),
    duration: (node.lengthText && node.lengthText.simpleText) || '',
    thumbnail: thumb,
    views: '',
    age: '',
  };
}

async function fetchPlaylist(playlistId) {
  const url = `https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}&hl=en&gl=US`;
  let res;
  try {
    res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,*/*',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    });
  } catch (err) {
    throw new Error(`Network error fetching playlist: ${err.message}`);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} fetching playlist`);

  const html = await res.text();
  const data = extractInitialData(html);
  if (!data) throw new Error('Could not parse playlist page.');

  const title =
    (data.metadata &&
      data.metadata.playlistMetadataRenderer &&
      decodeEntities(data.metadata.playlistMetadataRenderer.title)) ||
    '';

  const lockups = findByKey(data, 'lockupViewModel', []).filter(
    (node) => node && node.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO' && node.contentId
  );

  let videos;
  if (lockups.length) {
    videos = lockups.map(mapLockup);
  } else {
    const legacy = findByKey(data, 'playlistVideoRenderer', []);
    videos = legacy.map(mapLegacy);
  }

  videos = videos
    .filter((v) => v.videoId && VIDEO_ID_RE.test(v.videoId))
    .map((v, index) => ({ ...v, index }));

  return { playlistId, title, videos };
}

module.exports = {
  parsePlaylistId,
  fetchPlaylist,
};
