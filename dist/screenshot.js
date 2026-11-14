const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 630 });
  const htmlPath = 'file:///' + path.resolve(__dirname, 'og-viikkonostot-template.html').replace(/\\/g, '/');
  console.log('Navigating to', htmlPath);
  await page.goto(htmlPath, { waitUntil: 'networkidle0' });
  await page.screenshot({ path: path.join(__dirname, 'og-viikkonostot.png') });
  await browser.close();
})();
