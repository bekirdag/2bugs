const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', (msg) => console.log('browser console:', msg.type(), msg.text()));
  await page.goto('http://127.0.0.1:5180', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const canvasCount = await page.$$eval('#sim-canvas canvas', (nodes) => nodes.length);
  console.log('canvas count', canvasCount);
  if (canvasCount) {
    const size = await page.$eval('#sim-canvas canvas', (node) => ({ width: node.width, height: node.height }));
    console.log('canvas size', size);
  }
  const hudText = await page.textContent('.hud');
  console.log('HUD text', hudText);
  const snapshotStats = await page.evaluate(() => {
    const snapshot = window.__latestSnapshot;
    if (!snapshot) return null;
    return {
      tick: snapshot.tick,
      agentCount: snapshot.agents.length,
      plantCount: snapshot.plants.length,
      sampleAgent: snapshot.agents[0],
    };
  });
  console.log('snapshotStats', snapshotStats);
  await browser.close();
})();
