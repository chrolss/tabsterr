const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const TABS_DIR = path.join(__dirname, 'tabs');
const PUBLIC_DIR = path.join(__dirname, 'public');

const SUPPORTED_EXTENSIONS = new Set(['.gp3', '.gp4', '.gp5', '.gpx', '.gp', '.mid', '.midi', '.xml', '.musicxml']);

app.use(express.static(PUBLIC_DIR));
app.use('/tabs', express.static(TABS_DIR));

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
      .map((file) => ({
        name: file,
        path: `/tabs/${encodeURIComponent(file)}`,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json(tabs);
  });
});

app.listen(PORT, () => {
  console.log(`Tabsterr running at http://localhost:${PORT}`);
});
