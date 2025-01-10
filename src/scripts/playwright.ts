import { chromium } from "playwright";

async function playwright() {
  try {
    const browser = await chromium.connectOverCDP(`http://localhost:9222/`);
    console.log("Connected to chromium");

    // Get all contexts and pages
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
  }
}

playwright().catch(console.error);
