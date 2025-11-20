const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 768 } });
  page.on('console', (msg) => console.log('browser console:', msg.type(), msg.text()));
  await page.goto('http://127.0.0.1:5179', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const canvasCount = await page.$$eval('#sim-canvas canvas', (nodes) => nodes.length);
  const canvasInfo = canvasCount
    ? await page.$eval('#sim-canvas canvas', (node) => ({
        width: node.width,
        height: node.height,
        styleWidth: node.style.width,
        styleHeight: node.style.height,
      }))
    : null;
  const snapshotStats = await page.evaluate(() => {
    const latest = window.__latestSnapshot;
    const pixi = window.__pixiStage;
    return {
      hasSnapshot: Boolean(latest),
      snapshot: latest
        ? {
            tick: latest.tick,
            agentCount: latest.agents.length,
            plantCount: latest.plants.length,
            firstAgent: latest.agents[0],
            firstPlant: latest.plants[0],
            bounds: latest.config.bounds,
          }
        : null,
      pixiInfo: pixi?.debugInfo?.() ?? null,
    };
  });
  console.log('canvasInfo', { canvasCount, canvasInfo });
  console.log('snapshotStats', snapshotStats);
  await page.screenshot({ path: 'tmp/inspect.png', fullPage: true });
  await browser.close();
})();
