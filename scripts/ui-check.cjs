/**
 * Browser checks for the things unit tests cannot see.
 *
 * Everything here came out of a UAT pass and each assertion is a bug that was
 * actually found, not a hypothetical:
 *
 *   - a filter panel opening off the right edge of the window, with no way to
 *     scroll to the options hidden past it;
 *   - a filter panel that would not close - by pen or touch, by tabbing past
 *     its last option, or when the window was resized under it;
 *   - the Insights heatmap silently cropping February and March, behind a
 *     clean right border and with no scrollbar to suggest anything was there.
 *
 * Run against a server already up on localhost:3000, seeded with the UAT data:
 *
 *   npm run dev &
 *   npm run check:ui
 *
 * Exits non-zero on the first failure, so it can gate a release.
 */

const { chromium } = require("playwright");

const BASE = process.env.UI_CHECK_URL || "http://localhost:3000";
const EMAIL = process.env.UI_CHECK_EMAIL || "md@honda.example";
const PASSWORD = process.env.UI_CHECK_PASSWORD || "hoshin";

// Widths a corporate fleet actually runs: a common laptop, two desktop sizes,
// and one deliberately cramped.
const WIDTHS = [1920, 1500, 1366, 1280, 1024];

const failures = [];
function check(ok, name, detail) {
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  if (!ok) failures.push(name + (detail ? " — " + detail : ""));
}

async function signIn(page) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.locator('form:has(input[name="password"]) button[type="submit"]').click();
  await page.waitForURL("**/sheet", { timeout: 30000 });
  await page.waitForTimeout(2500);
}

const panelCount = (page) => page.locator('[role="listbox"]').count();

async function panelsStayOnScreen(browser) {
  console.log("\nFilter panels stay on screen");
  for (const width of WIDTHS) {
    const page = await browser.newPage({ viewport: { width, height: 800 } });
    await signIn(page);
    let worst = null;
    for (const button of await page.locator('button[aria-haspopup="listbox"]').all()) {
      const label = (await button.innerText()).split("\n")[0].trim();
      await button.click();
      await page.waitForTimeout(300);
      const panel = await page.locator('[role="listbox"]').first().boundingBox();
      if (panel) {
        const off = Math.max(Math.round(panel.x + panel.width - width), Math.round(-panel.x));
        if (off > 0) worst = `${label} runs ${off}px off the edge`;
      }
      await page.keyboard.press("Escape");
      await page.waitForTimeout(150);
    }
    check(!worst, `${width}px`, worst);
    await page.close();
  }
}

async function panelsDismiss(browser) {
  console.log("\nFilter panels close every way out");
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, hasTouch: true });
  await signIn(page);

  const ways = [
    ["clicking elsewhere", () => page.mouse.click(700, 600)],
    ["tapping elsewhere", () => page.touchscreen.tap(700, 600)],
    ["pressing Escape", () => page.keyboard.press("Escape")],
    ["tabbing past the last option", async () => {
      // Tab walks the panel's own options first, which is correct; "away"
      // means past the last of them.
      for (let i = 0; i < 12; i++) {
        await page.keyboard.press("Tab");
        await page.waitForTimeout(60);
        if ((await panelCount(page)) === 0) return;
      }
    }],
    ["shift-tabbing back past the trigger", async () => {
      await page.keyboard.press("Shift+Tab");
      await page.keyboard.press("Shift+Tab");
    }],
    ["resizing the window", () => page.setViewportSize({ width: 1200, height: 768 })],
  ];

  for (const [name, act] of ways) {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.waitForTimeout(150);
    await page.getByRole("button", { name: /^Business unit/ }).click();
    await page.waitForTimeout(350);
    if ((await panelCount(page)) !== 1) { check(false, name, "panel did not open"); continue; }
    await act();
    await page.waitForTimeout(500);
    const left = await panelCount(page);
    check(left === 0, name, left ? `${left} left open` : "");
    if (left) await page.keyboard.press("Escape");
  }
  await page.close();
}

async function heatmapKeepsEveryMonth(browser) {
  console.log("\nInsights heatmap keeps every month");
  for (const width of WIDTHS) {
    const page = await browser.newPage({ viewport: { width, height: 800 } });
    await signIn(page);
    await page.goto(`${BASE}/insights`);
    await page.waitForTimeout(2000);
    const seen = await page.evaluate(() => {
      const grid = document.querySelector("div.grid");
      if (!grid) return null;
      const scroller = grid.parentElement;
      const box = scroller.getBoundingClientRect();
      const months = Array.from(grid.children).slice(1, 13);
      return {
        total: months.length,
        // Reachable means on screen, or scrollable to - not cropped away.
        reachable: scroller.scrollWidth > scroller.clientWidth
          ? months.length
          : months.filter((el) => {
              const b = el.getBoundingClientRect();
              return b.left >= box.left - 1 && b.right <= box.right + 1;
            }).length,
      };
    });
    check(
      seen && seen.total === 12 && seen.reachable === 12,
      `${width}px`,
      seen ? `${seen.reachable}/${seen.total} months reachable` : "no heatmap found",
    );
    await page.close();
  }
}

async function pagesDoNotOverflow(browser) {
  console.log("\nNo page scrolls sideways at the window's own width");
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await signIn(page);
  for (const path of ["/sheet", "/cascade", "/insights", "/my-entries", "/divisions", "/admin", "/symbols"]) {
    await page.goto(BASE + path);
    await page.waitForTimeout(2000);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(over <= 1, path, over > 1 ? `${over}px of horizontal overflow` : "");
  }
  await page.close();
}

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined,
  });
  try {
    await panelsStayOnScreen(browser);
    await panelsDismiss(browser);
    await heatmapKeepsEveryMonth(browser);
    await pagesDoNotOverflow(browser);
  } finally {
    await browser.close();
  }

  console.log("");
  if (failures.length) {
    console.error(`${failures.length} UI check${failures.length === 1 ? "" : "s"} failed:`);
    for (const failure of failures) console.error("  - " + failure);
    process.exit(1);
  }
  console.log("All UI checks passed.");
})();
