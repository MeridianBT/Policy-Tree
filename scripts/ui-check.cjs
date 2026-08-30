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
 *     clean right border and with no scrollbar to suggest anything was there;
 *   - /my-entries unusable on the phone the month-end reminder is read on.
 *
 * Run against a server already up on localhost:3000, seeded with the UAT data:
 *
 *   npm run dev &
 *   npm run check:ui
 *
 * Exits non-zero on the first failure, so it can gate a release.
 */

const { chromium, devices } = require("playwright");

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
  for (const path of ["/sheet", "/cascade", "/insights", "/my-entries", "/division/AUTO", "/admin", "/symbols"]) {
    await page.goto(BASE + path);
    await page.waitForTimeout(2000);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(over <= 1, path, over > 1 ? `${over}px of horizontal overflow` : "");
  }
  await page.close();
}

/**
 * /my-entries on a phone.
 *
 * This is the one screen built for one, because the reminder that drives it
 * arrives by mail and mail is read on a phone. Four things have to hold or the
 * journey from that mail to a keyed figure does not work: the page must not
 * scroll sideways, the cards must replace the table rather than sit beside it,
 * the nav must still be reachable so somebody arriving cold is not stranded,
 * and the input must be at least 16px - below that iOS zooms the page on
 * focus and slides the field out from under the keyboard.
 */
async function myEntriesOnAPhone(browser) {
  console.log("\n/my-entries works on a phone");
  for (const name of ["iPhone 13", "Pixel 5", "iPhone SE"]) {
    const context = await browser.newContext({ ...devices[name] });
    const page = await context.newPage();
    // The real journey: a deep link, opened cold, through sign-in.
    await page.goto(`${BASE}/my-entries?period=2026-06`);
    await page.waitForTimeout(1000);
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASSWORD);
    await page.locator('form:has(input[name="password"]) button[type="submit"]').click();
    await page.waitForTimeout(4000);

    const seen = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input[inputmode="decimal"]'))
        .filter((el) => el.offsetParent !== null);
      const table = document.querySelector("table");
      const first = inputs[0];
      return {
        path: location.pathname + location.search,
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        visibleInputs: inputs.length,
        tableShown: Boolean(table && table.offsetParent !== null),
        fontSize: first ? parseFloat(getComputedStyle(first).fontSize) : 0,
        height: first ? Math.round(first.getBoundingClientRect().height) : 0,
      };
    });
    const menu = await page.getByText("Menu", { exact: false }).count();

    const problems = [];
    if (seen.path !== "/my-entries?period=2026-06") problems.push(`landed on ${seen.path}`);
    if (seen.overflow > 1) problems.push(`${seen.overflow}px of horizontal overflow`);
    if (seen.visibleInputs === 0) problems.push("no keyable field");
    if (seen.tableShown) problems.push("the desktop table is still showing");
    if (seen.fontSize < 16) problems.push(`input is ${seen.fontSize}px, so iOS will zoom`);
    if (seen.height < 40) problems.push(`input is only ${seen.height}px tall`);
    if (menu === 0) problems.push("no reachable nav");

    check(problems.length === 0, name, problems.join("; "));
    await context.close();
  }
}

/**
 * A department chip says only what the Division has not.
 *
 * The two controls sit side by side, so "AUTO / AUTO-PRD — Product" under a
 * selector already reading AUTO named the division twice. Worth a browser
 * check rather than only a unit test, because what makes it right is the two
 * controls being read together.
 */
async function departmentChipsDoNotRepeatTheDivision(browser) {
  console.log("\nDepartment chips do not repeat the division");
  const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
  await signIn(page);
  await page.getByText("+ Departments", { exact: true }).first().click();
  await page.waitForTimeout(4000);

  const chips = async () => {
    const triggers = page.locator('button[aria-haspopup="listbox"]');
    const texts = await triggers.allInnerTexts();
    await triggers.nth(texts.findIndex((t) => t.includes("Department"))).click();
    await page.waitForTimeout(700);
    const found = (await page.locator('[role="option"]').allInnerTexts()).map((o) =>
      o.replace(/\s+/g, " ").trim(),
    );
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    return found;
  };

  const all = await chips();
  check(all.length > 0, "the Department filter has options", `${all.length} found`);
  check(
    all.every((chip) => !chip.includes(" / ")),
    "no chip prints its division as a prefix",
    all.filter((chip) => chip.includes(" / ")).join(", "),
  );
  check(
    all.includes("AUTO-PRD — Product"),
    "a department keeps its whole code across divisions",
    all.slice(0, 3).join(" | "),
  );

  const division = page.locator("label", { hasText: "Division" }).locator("select");
  await division.selectOption("AUTO");
  await page.waitForTimeout(3000);
  const scoped = await chips();
  check(scoped.includes("PRD — Product"), "and drops it once AUTO is chosen", scoped.join(" | "));
  check(
    scoped.every((chip) => chip === "AUTO — Automotive" || !chip.startsWith("AUTO-")),
    "with nothing left carrying the prefix",
    scoped.join(" | "),
  );

  await page.close();
}

/**
 * The edit form follows the pencil.
 *
 * Found in UAT: with one measure's form open, clicking the pencil on another
 * left every field holding the first measure's values while the heading above
 * them named the second. The form seeds its fields from props in useState
 * initialisers, which run once per mount, so the fix is a key - and the check
 * is worth keeping because nothing about the screen looks wrong when it
 * breaks. A save in that state would write one measure's values onto another.
 */
async function theFormFollowsThePencil(browser) {
  console.log("\nThe edit form follows the pencil");
  const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
  await signIn(page);
  await page.locator('button[title="Add, rename and remove rows directly on the sheet"]').click();
  await page.waitForTimeout(1500);

  // What the open form says it is editing, and what its fields actually hold.
  const openForm = () =>
    page.evaluate(() => {
      const box = [...document.querySelectorAll("div")]
        .filter((d) => d.className.includes("bg-paper-sunken") && d.className.includes("flex-wrap"))
        .pop();
      if (!box) return null;
      const heading = box.parentElement?.querySelector("strong")?.textContent?.trim() ?? null;
      const field = (name) => {
        const label = [...box.querySelectorAll("label")].find(
          (l) => l.childNodes[0].textContent.trim() === name,
        );
        if (!label) return null;
        const input = label.querySelector("input");
        if (input) return input.value;
        const select = label.querySelector("select");
        return select ? select.options[select.selectedIndex]?.text ?? null : null;
      };
      return { heading, measure: field("Measure"), division: field("Division") };
    });

  const pencils = page.locator('button[title="Edit measure"]');
  await pencils.nth(0).click();
  await page.waitForTimeout(1200);
  const first = await openForm();
  check(Boolean(first && first.measure), "the first measure opens with its own name", first && first.measure);

  // The form stays open; a second pencil is clicked from underneath it.
  await pencils.nth(1).click();
  await page.waitForTimeout(1200);
  const second = await openForm();

  check(
    Boolean(second) && second.measure !== first.measure,
    "a second pencil re-seeds the fields",
    second ? `${first.measure} -> ${second.measure}` : "no form",
  );
  check(
    Boolean(second) && second.measure === second.heading,
    "and the fields agree with the heading",
    second ? `heading "${second.heading}" vs field "${second.measure}"` : "no form",
  );
  check(
    Boolean(second) && second.division !== null,
    "with its own filing beside them",
    second ? `division ${second.division}` : "no form",
  );

  await page.close();
}

/**
 * The toolbar's own two view controls.
 *
 * Both hide columns and neither may change a figure: the sheet's whole
 * contract is that the month is the only stored grain and everything else is
 * derived, so narrowing to one quarter must leave that quarter's own numbers
 * exactly as the full year drew them.
 */
async function oneQuarterAtATime(browser) {
  console.log("\nOne quarter can be read on its own");
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await signIn(page);

  const headers = () =>
    page.evaluate(() =>
      [...document.querySelectorAll("div")]
        .map((el) => el.textContent.trim())
        .filter((t) =>
          /^(Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Jan|Feb|Mar|\u00ab ?Q[1-4]|Ki Total)$/.test(t),
        ),
    );

  // The symbol-only display chip is gone; the other three remain.
  for (const chip of ["Full", "Target / Actual", "Achievement"]) {
    check((await page.getByText(chip, { exact: true }).count()) > 0, `display chip "${chip}"`);
  }
  check((await page.getByText("Symbol", { exact: true }).count()) === 0, "no Symbol display chip");

  const quarter = page.locator("label", { hasText: "Quarter" }).locator("select");
  await quarter.selectOption("Q3");
  await page.waitForTimeout(1500);
  const shown = await headers();
  check(
    ["Oct", "Nov", "Dec"].every((month) => shown.includes(month)),
    "Q3 keeps its own months",
    shown.join(" "),
  );
  check(
    !shown.includes("Apr") && !shown.includes("Jul") && !shown.includes("Jan"),
    "and drops the other three quarters",
    shown.join(" "),
  );
  check(shown.includes("Ki Total"), "and keeps the Ki total beside it");

  await quarter.selectOption("ALL");
  await page.waitForTimeout(1500);
  check((await headers()).includes("Apr"), "Full year brings every month back");

  await page.close();
}

/**
 * What the UAT pass asked for by name.
 *
 * Three small things, each of which reads as a nothing change and each of
 * which is invisible to a unit test: a menu that should no longer be there, a
 * button that has to say what it does, and a form whose fields have to be
 * asked for in the order the cascade is read.
 */
async function theUatWording(browser) {
  console.log("\nThe UAT wording holds");
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
  await signIn(page);

  // The nav no longer duplicates the sheet's own Division filter.
  const nav = page.locator("nav");
  check(
    (await nav.getByText("Divisions", { exact: true }).count()) === 0,
    "no Divisions menu in the nav",
  );
  // The narrower view itself is still reachable, just not advertised.
  await page.goto(BASE + "/division/AUTO");
  await page.waitForTimeout(1500);
  check(!/\/login/.test(page.url()), "/division/AUTO still loads when typed");

  // The button names what it keys.
  await page.goto(BASE + "/sheet");
  await page.waitForTimeout(2000);
  const target = page.locator('select').filter({ hasText: "Latest forecast" }).first();
  const version = await target.locator("option").nth(1).getAttribute("value");
  await target.selectOption(version);
  await page.waitForTimeout(2500);
  const edit = page.getByRole("button", { name: "Edit targets" });
  check((await edit.count()) === 1, 'the button reads "Edit targets"');
  if (await edit.count()) {
    await edit.click();
    await page.waitForTimeout(800);
    check(
      (await page.getByRole("button", { name: "Done editing targets" }).count()) === 1,
      'and "Done editing targets" once it is on',
    );
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
    await myEntriesOnAPhone(browser);
    await theUatWording(browser);
    await oneQuarterAtATime(browser);
    await theFormFollowsThePencil(browser);
    await departmentChipsDoNotRepeatTheDivision(browser);
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
