const puppeteer = require('puppeteer-core');
const { spawn } = require('child_process');
const path = require('path');

const CHROMIUM = '/usr/bin/chromium';
const URL = 'http://localhost:3000';

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  const server = spawn('node', ['server.js'], {
    cwd: __dirname,
    stdio: 'pipe',
  });

  // Wait for server
  await new Promise((resolve, reject) => {
    server.stdout.on('data', (data) => {
      const text = data.toString();
      console.log('server:', text.trim());
      if (text.includes('Tabsterr running')) resolve();
    });
    server.stderr.on('data', (data) => console.error('server err:', data.toString().trim()));
    setTimeout(() => reject(new Error('Server startup timeout')), 10000);
  });

  const browser = await puppeteer.launch({
    executablePath: CHROMIUM,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const errors = [];
  page.on('pageerror', (err) => errors.push(`PAGE ERROR: ${err.message}`));
  page.on('console', (msg) => {
    const text = msg.text();
    // Ignore generic network 404 messages; response listener catches real ones.
    if (msg.type() === 'error' && !text.includes('Failed to load resource')) {
      errors.push(`CONSOLE ERROR: ${text}`);
    }
  });
  page.on('response', (response) => {
    if (response.status() === 404 && !response.url().includes('favicon.ico')) {
      errors.push(`404: ${response.url()}`);
    }
  });

  try {
    await page.goto(URL, { waitUntil: 'networkidle2', timeout: 30000 });
    await delay(1000);

    // Click the tab card
    await page.waitForSelector('.tab-card', { timeout: 10000 });
    await page.click('.tab-card');

    // Wait for alphaTab to render
    await page.waitForFunction(
      () => {
        const container = document.querySelector('#alphaTab-container');
        return container && container.querySelector('svg') !== null;
      },
      { timeout: 60000 }
    );

    await delay(2000);

    const svgCount = await page.evaluate(() =>
      document.querySelectorAll('#alphaTab-container svg').length
    );
    console.log(`SVG elements rendered: ${svgCount}`);

    const controlsInfo = await page.evaluate(() => {
      const el = document.getElementById('player-controls');
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return {
        hidden: el.classList.contains('hidden'),
        top: rect.top,
        left: rect.left,
        bottom: rect.bottom,
        right: rect.right,
        width: rect.width,
        height: rect.height,
      };
    });
    console.log('Controls info:', controlsInfo);

    await page.screenshot({ path: path.join(__dirname, 'test-screenshot.png'), fullPage: false });

    // Open tracks panel
    await page.click('#tracks-button');
    await delay(300);
    const tracksPanelVisible = await page.evaluate(() =>
      !document.getElementById('tracks-panel').classList.contains('hidden')
    );
    console.log('Tracks panel visible:', tracksPanelVisible);
    const trackCount = await page.evaluate(() =>
      document.querySelectorAll('#tracks-list .track-item').length
    );
    console.log('Tracks listed:', trackCount);
    await page.screenshot({ path: path.join(__dirname, 'test-tracks-panel.png'), fullPage: false });

    // Test muting a track
    const muteButtons = await page.$$('.track-mute');
    if (muteButtons.length > 0) {
      await muteButtons[0].click();
      await delay(300);
      const isMuted = await page.evaluate(() =>
        document.querySelector('.track-mute')?.classList.contains('muted')
      );
      console.log('First track muted:', isMuted);
    }

    // Test speed down
    await page.click('#speed-down');
    const speedText = await page.evaluate(() => document.getElementById('speed-value').textContent);
    console.log('Speed after down:', speedText);

    // Test loop toggle
    await page.click('#loop-button');
    const loopActive = await page.evaluate(() =>
      document.getElementById('loop-button').classList.contains('active')
    );
    console.log('Loop active:', loopActive);

    if (errors.length > 0) {
      console.error('\nErrors detected:');
      errors.forEach((e) => console.error(e));
      process.exitCode = 1;
    } else {
      console.log('\nNo errors detected. Player rendered successfully.');
    }
  } catch (err) {
    console.error('\nTest failed:', err.message);
    errors.forEach((e) => console.error(e));
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.kill();
  }
}

run();
