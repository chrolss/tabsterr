# Downloading tabs from TheGuitarLesson.com

Tabsterr ships a small CLI (`scripts/guitarlesson.js`) that searches and downloads Guitar Pro tabs from [TheGuitarLesson.com](https://www.theguitarlesson.com) straight into `tabs/`, ready to play. It uses the site's public download URLs directly, so no browser or "unlock" step is needed.

## Searching for a tab

```bash
npm run guitarlesson -- search "wasted years"
```

This lists every matching tab with its version, artist, and URL:

```
3 matches:
 1. Wasted Years (version 2) — Iron Maiden
   https://www.theguitarlesson.com/guitar-pro-tabs/i/iron-maiden/wasted-years-2-iron-maiden/
 2. Wasted Years (version 3) — Iron Maiden
   ...
 3. Wasted Years — Iron Maiden
   ...
```

Add `--artist` to narrow the results to one band.

## Downloading a tab

```bash
npm run guitarlesson -- download "wasted years" --artist "Iron Maiden"
```

- Saves to `tabs/iron_maiden-wasted_years.gp4` and it shows up in the app immediately.
- Picks the plain (original) version by default; if there is no plain version it takes the highest-numbered one.
- Downloads `.gp4` by default and falls back to `.gp3`.
- Skips the file if it already exists.

To download a specific entry from a `search` list, pass its number with `--number`:

```bash
npm run guitarlesson -- download "wasted years" --number 1
```

## Common options

| Option | Meaning |
| --- | --- |
| `--artist NAME` | Restrict to an artist (substring match) |
| `--number N` | Download the tab at position N from the `search` list |
| `--version N` | Pick a specific version of a tab (see `search` output) |
| `--format gp4\|gp3\|all` | File format to download (default `gp4`) |
| `--out DIR` | Output directory (default `tabs`) |
| `--force` | Overwrite an existing file |
| `--pages N` | Max search result pages to scan (default 50) |

## Examples

```bash
# List all Metallica tabs matching "nothing else matters"
npm run guitarlesson -- search "nothing else matters" --artist "Metallica"

# Get a specific older version of a tab as gp3
npm run guitarlesson -- download "wasted years" --version 2 --format gp3

# Grab every format of a song into a temp dir
npm run guitarlesson -- download "hallowed be thy name" --format all --out /tmp/opencode

# See the full usage/help text
npm run guitarlesson -- help
```

## Notes

- Files are named `{artist}-{song}.{ext}` (e.g. `iron_maiden-wasted_years.gp4`) to match the existing tabs in `tabs/`.
- Versioned tabs keep their number, e.g. `wasted_years_v3`.
- The downloader is a dependency-free Node script using built-in `fetch` (Node 18+).
- It adds a short delay between requests; don't crank up concurrency, the site blocks aggressive scraping.