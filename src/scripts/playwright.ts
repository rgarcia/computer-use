import { chromium } from "playwright";

async function playwright(endpoint = "http://localhost:9222/") {
  try {
    const browser = await chromium.connectOverCDP(endpoint);
    console.log("Connected to chromium");

    const contexts = await browser.contexts();
    const context = contexts[0] || (await browser.newContext());
    const page = await context.newPage();
    await page.goto("https://news.ycombinator.com");
    console.log("Navigated to news.ycombinator.com");
    await page.screenshot({ path: "playwright-screenshot.png" });
    console.log("Screenshot saved to playwright-screenshot.png");
    await page.close();
    await browser.close();
    console.log("Connection closed");
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

// If running directly, use command line arg or default
if (import.meta.url.endsWith(process.argv[1])) {
  const endpoint = process.argv[2];
  playwright(endpoint).catch(console.error);
}

// Export for testing
export { playwright };
