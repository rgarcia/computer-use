import puppeteer from "puppeteer-core";

async function puppeteerTest(endpoint = "http://localhost:9222/") {
  try {
    const browser = await puppeteer.connect({
      browserURL: endpoint,
    });
    console.log("Connected to chrome via puppeteer");

    const page = await browser.newPage();
    await page.goto("https://news.ycombinator.com");
    console.log("Navigated to news.ycombinator.com");
    await page.screenshot({ path: "puppeteer-screenshot.png" });
    console.log("Screenshot saved to puppeteer-screenshot.png");
    await page.close();
    await browser.disconnect();
    console.log("Connection closed");
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

// If running directly, use command line arg or default
if (require.main === module) {
  const endpoint = process.argv[2];
  puppeteerTest(endpoint).catch(console.error);
}

// Export for testing
export { puppeteerTest };
