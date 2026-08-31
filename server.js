const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const TABS_DIR = path.join(__dirname, 'tabs');
const BACKING_TRACKS_DIR = path.join(__dirname, 'backing_tracks');
const PUBLIC_DIR = path.join(__dirname, 'public');

const SUPPORTED_EXTENSIONS = new Set(['.gp3', '.gp4', '.gp5', '.gpx', '.gp', '.mid', '.midi', '.xml', '.musicxml']);

function readInt32(buf, offset) {
  return buf.readInt32LE(offset);
}

function readIntByteSizeString(buf, offset) {
  const size = readInt32(buf, offset);
  const length = buf[offset + 4];
  const str = buf.toString('latin1', offset + 5, offset + 5 + length);
  return { value: str, next: offset + 4 + size };
}

function parseGpHeader(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (!['.gp3', '.gp4', '.gp5'].includes(ext)) {
    return null;
  }

  try {
    const fd = fs.openSync(filePath, 'r');
    try {
      const headerBuf = Buffer.alloc(2048);
      const bytesRead = fs.readSync(fd, headerBuf, 0, headerBuf.length, 0);
      const buf = headerBuf.subarray(0, bytesRead);
      if (bytesRead < 31) return null;

      // Version string: 1 byte length + 30 bytes (padded)
      let i = 31;
      if (buf.length < i + 4) return null;

      const fields = {};
      const fieldNames = ['title', 'subtitle', 'artist', 'album', 'words', 'copyright', 'tab', 'instructions'];
      for (const name of fieldNames) {
        if (buf.length < i + 4) return null;
        const result = readIntByteSizeString(buf, i);
        fields[name] = result.value;
        i = result.next;
      }

      return fields;
    } finally {
      fs.closeSync(fd);
    }
  } catch (err) {
    return null;
  }
}

function getTabMetadata(filePath) {
  const fileName = path.basename(filePath);
  const baseName = fileName.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ');
  const gpFields = parseGpHeader(filePath);

  if (gpFields) {
    const title = gpFields.title.trim() || baseName;
    const artist = gpFields.artist.trim() || gpFields.words.trim() || '';
    return { title, artist };
  }

  return { title: baseName, artist: '' };
}

app.use(express.static(PUBLIC_DIR));
app.use('/tabs', express.static(TABS_DIR));
app.use('/backing_tracks', express.static(BACKING_TRACKS_DIR));

function findFirstFile(dir, extensions, preferredBaseName) {
  let files;
  try {
    files = fs.readdirSync(dir);
  } catch (err) {
    return null;
  }

  const matches = files.filter((file) =>
    extensions.includes(path.extname(file).toLowerCase())
  );

  if (preferredBaseName) {
    const preferred = matches.find((file) =>
      path.basename(file, path.extname(file)).toLowerCase() === preferredBaseName.toLowerCase()
    );
    if (preferred) return preferred;
  }

  return matches[0] || null;
}

function toDisplayName(folderName) {
  return folderName.replace(/[_-]/g, ' ');
}

app.get('/api/backing-tracks', (req, res) => {
  fs.readdir(BACKING_TRACKS_DIR, { withFileTypes: true }, (err, entries) => {
    if (err) {
      if (err.code === 'ENOENT') {
        return res.json([]);
      }
      return res.status(500).json({ error: 'Unable to read backing tracks directory' });
    }

    const tracks = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        const folderName = entry.name;
        const folderPath = path.join(BACKING_TRACKS_DIR, folderName);
        const pdf = findFirstFile(folderPath, ['.pdf'], folderName);
        const mp3 = findFirstFile(folderPath, ['.mp3'], folderName);
        return { folderName, pdf, mp3 };
      })
      .filter((track) => track.pdf && track.mp3)
      .map((track) => ({
        folderName: track.folderName,
        displayName: toDisplayName(track.folderName),
        pdfPath: `/backing_tracks/${encodeURIComponent(track.folderName)}/${encodeURIComponent(track.pdf)}`,
        mp3Path: `/backing_tracks/${encodeURIComponent(track.folderName)}/${encodeURIComponent(track.mp3)}`,
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }));

    res.json(tracks);
  });
});

app.get('/api/tabs', (req, res) => {
  fs.readdir(TABS_DIR, (err, files) => {
    if (err) {
      if (err.code === 'ENOENT') {
        return res.json([]);
      }
      return res.status(500).json({ error: 'Unable to read tabs directory' });
    }

    const tabs = files
      .filter((file) => SUPPORTED_EXTENSIONS.has(path.extname(file).toLowerCase()))
      .map((file) => {
        const filePath = path.join(TABS_DIR, file);
        const { title, artist } = getTabMetadata(filePath);
        const displayName = artist ? `${artist} - ${title}` : title;
        return {
          name: file,
          title,
          artist,
          displayName,
          path: `/tabs/${encodeURIComponent(file)}`,
        };
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }));

    res.json(tabs);
  });
});

app.listen(PORT, () => {
  console.log(`Tabsterr running at http://localhost:${PORT}`);
});
