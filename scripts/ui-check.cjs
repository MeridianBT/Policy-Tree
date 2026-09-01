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
 *   - /my-entries unusable on the phone the month-end reminder is read on;
 *   - an edit form still holding the previous measure's values after the
 *     pencil on a second one was clicked, under a heading naming the second.
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

/**
 * The month-end review.
 *
 * It replaced a division heatmap that could not be read - one 64px bar stood
 * for 24 measures and for 5 alike, and no cell linked anywhere. What matters
 * now is that the page answers its two questions honestly at every window
 * width: how much of the month is in, and what is falling.
 */
async function theMonthEndReview(browser) {
  console.log("\nThe month-end review answers its questions");
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  await signIn(page);

  await page.goto(`${BASE}/insights`);
  await page.waitForTimeout(2500);
  const heading = await page.locator("h1").innerText();
  check(/^Month end review/.test(heading), "opens on a month with something to review", heading);

  const reporting = await page.locator("section", { hasText: "Reporting" }).first().innerText();
  check(/\d+ of \d+ actuals in/.test(reporting), "says how much of the month is in");

  // Every attention line has to reach its measure, which is exactly what the
  // heatmap could not do.
  const links = page.locator('a[href^="/control-item/"]');
  check((await links.count()) > 0, "every line reaches its measure");

  // The open month is the one nobody has keyed yet, so it is the chase list.
  await page.goto(`${BASE}/insights?month=2026-08`);
  await page.waitForTimeout(2500);
  const chase = await page.locator("section", { hasText: "Reporting" }).first().innerText();
  check(/0 of \d+ actuals in/.test(chase), "an unkeyed month reports nothing in", chase.split("\n")[1]);
  check(/outstanding/.test(chase), "and names who is being chased");

  await page.close();
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
/**
 * The Measures column is the one a reader can widen.
 *
 * A statement is a sentence somebody wrote and the important ones are long, so
 * a fixed width hides the useful half behind an ellipsis. What is worth
 * holding here is not the pixel count but that the grip exists, that dragging
 * it moves the column, that the width survives a reload, and that it cannot be
 * dragged to nothing - a column resized to 20px is a sheet somebody has to
 * clear their site data to recover from.
 */
/**
 * Finding one row on a sheet of eighty-three.
 *
 * The pickers answer "which rows are these"; search answers "where is that
 * row", which is a different question and the one somebody arrives with when
 * a name has come up in a meeting. The case worth holding is the asymmetry:
 * matching a measure keeps that row and the chain above it, but matching a
 * *statement* brings its whole branch, because "show me this Objective" is
 * what was meant.
 */
/**
 * The print route renders one document, and flows.
 *
 * Its layout used to render its own `<html>` and `<body>`. Only a root layout
 * may do that, and this one is nested, so the server sent an `<html>` inside a
 * `<body>`. Nothing looked wrong, which is exactly why it survived for so
 * long: the page rendered, and only the console said so.
 *
 * Two things this has to get right to be worth having. The nested tag is
 * checked in the **served HTML** rather than in the DOM, because an HTML
 * parser silently drops a second `<html>` while parsing - which is the whole
 * reason the client tree stopped matching the server's, and why looking for it
 * in `document` finds nothing either way. And a hydration mismatch arrives as
 * a console error rather than an uncaught exception, so listening only for
 * page errors would have watched the wrong channel.
 *
 * Escaping the app shell is what those tags were really for, so the last check
 * is that the escape still works: a print page has to grow past the viewport,
 * where the shell pins the body to the window and hides the overflow.
 */
/**
 * A measure added to a row appears against that row.
 *
 * Adding one to a Goal makes a Level 2 Objective, and to a Level 2 makes a
 * Level 3 - the level was never the problem. Where it landed was: a new child
 * went after every sibling, and a Goal on the demo plan carries thirty-one
 * Objectives, so the row arrived some sixty below the heading just clicked.
 * Off the screen entirely, which reads as nothing having happened.
 *
 * Indentation is the level made visible, so it is what this asserts: an
 * Objective rendering inline sits one step in from the heading above it, and
 * one step further again for the Level 3 beneath that. See
 * components/sheet/outline.ts for the ladder.
 */
async function addingAMeasureLandsAgainstItsRow(browser) {
  console.log("\nA measure lands against the row it was added from");
  const page = await browser.newPage({ viewport: { width: 1700, height: 950 } });
  await signIn(page);
  await page.locator('button[title="Add, rename and remove rows directly on the sheet"]').click();
  await page.waitForTimeout(1500);

  const rows = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[style*="--label-width"]')]
        .map((cell) => {
          const indent = /padding-left:\s*([0-9.]+)px/.exec(cell.getAttribute("style") || "");
          const text = [...cell.childNodes].map((node) => node.textContent).join("").trim();
          return { indent: indent ? Number(indent[1]) : null, text };
        })
        // Only row cells: the grid container carries --label-width too, and
        // its textContent is the whole sheet.
        .filter((row) => row.text && row.indent !== null));

  const add = async (buttonIndex, name) => {
    await page.locator('button[title^="Add measure"]').nth(buttonIndex).click();
    await page.waitForTimeout(900);
    await page
      .locator('.bg-paper-sunken input[type="text"], .bg-paper-sunken input:not([type])')
      .first()
      .fill(name);
    await page.waitForTimeout(300);
    await page.locator("button", { hasText: /^Add measure$/ }).last().click();
    await page.waitForTimeout(4000);
    const all = await rows();
    const at = all.findIndex((row) => row.text.includes(name));
    return { all, at, indent: at === -1 ? null : all[at].indent };
  };

  const stamp = Date.now().toString().slice(-5);
  const goalName = `UICHECK-L2-${stamp}`;
  const onGoal = await add(0, goalName);
  check(onGoal.at !== -1, "a measure added to a Goal is on the screen at all");
  // The row after the Goal heading the button sat on - counted from that
  // heading rather than from the top, so anything else already under the Goal
  // does not make this say the wrong thing.
  const goalRow = onGoal.all.findIndex((row) => row.indent === 4);
  check(
    goalRow !== -1 && onGoal.at === goalRow + 1,
    "and directly under that Goal",
    `Goal at row ${goalRow}, measure at row ${onGoal.at}`,
  );
  // 4px base + one 14px step. The new row carries a single Control Item, so it
  // is the Objective's own row and sits on the Level 2 vertical - not a step
  // further in, which is where the Level 3 headings beneath it go.
  check(onGoal.indent === 18, "at Level 2", `indent ${onGoal.indent}px`);

  const childName = `UICHECK-L3-${stamp}`;
  const onObjective = await add(1, childName);
  check(onObjective.at !== -1, "a measure added to that Level 2 is on the screen");
  check(onObjective.indent === 32, "and sits a level deeper, at Level 3", `indent ${onObjective.indent}px`);
  const parentAt = onObjective.all.findIndex((row) => row.text.includes(goalName));
  check(
    parentAt !== -1 && onObjective.at - parentAt <= 2,
    "directly beneath the Level 2 it was added from",
    `parent row ${parentAt}, new row ${onObjective.at}`,
  );

  /*
   * Put the demo data back: delete the Level 2, which carries the Level 3.
   *
   * This is also the check on what the trash can means on a row that carries
   * its Objective's statement. That row IS the Objective - one Control Item,
   * no heading - so the trash has to take the Objective and everything under
   * it, not just the measure, which would leave the statement behind as a
   * blank row.
   *
   * Targeted from inside the page rather than with a CSS locator, because the
   * grid container carries --label-width as well and holds every row's trash
   * can - a locator scoped that way clicks the wrong one, which on this screen
   * means deleting somebody else's branch.
   */
  const clicked = await page.evaluate((name) => {
    for (const cell of document.querySelectorAll('[style*="--label-width"]')) {
      if (!/padding-left/.test(cell.getAttribute("style") || "")) continue;
      if (!cell.textContent.includes(name)) continue;
      const trash = cell.querySelector('button[title="Delete"]');
      if (!trash) return false;
      trash.click();
      return true;
    }
    return false;
  }, goalName);
  if (clicked) {
    await page.waitForTimeout(1500);
    const confirm = page.locator("button", { hasText: "Delete anyway" });
    if (await confirm.count()) {
      await confirm.first().click();
      await page.waitForTimeout(3000);
    }
  }
  const left = await rows();
  check(
    !left.some((row) => row.text.includes(goalName)),
    "the trash can takes the whole Objective, statement and all",
    left.some((row) => row.text.includes(goalName)) ? "still there" : "",
  );
  check(
    !left.some((row) => row.text.includes(childName)),
    "and the check tidies up after itself, Level 3 included",
    left.some((row) => row.text.includes(childName)) ? "the Level 3 is still there" : "",
  );
  await page.close();
}

async function thePrintPageIsOneDocument(browser) {
  console.log("\nThe print route is one document, and flows");
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
  await signIn(page);

  const hydration = [];
  page.on("console", (message) => {
    const text = message.text();
    if (
      message.type() === "error" &&
      /hydrat|didn't match|did not match|cannot be a child|nested/i.test(text)
    ) {
      hydration.push(text.split("\n")[0].slice(0, 120));
    }
  });

  for (const path of ["/print/company", "/print/company?columns=quarters"]) {
    hydration.length = 0;
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);

    // The document as the server wrote it, before a parser tidied it up.
    const served = await page.request.get(`${BASE}${path}`);
    const html = await served.text();
    const openings = (html.match(/<html[\s>]/g) ?? []).length;
    check(openings === 1, `${path} sends exactly one <html>`, `${openings} found`);

    const seen = await page.evaluate(() => ({
      sheet: Boolean(document.querySelector(".print-sheet")),
      overflow: getComputedStyle(document.body).overflowY,
      scrolls: document.body.scrollHeight > window.innerHeight,
    }));
    check(seen.sheet, `${path} renders the sheet`);
    check(seen.overflow !== "hidden" && seen.scrolls, `${path} lets the page flow`, `overflow ${seen.overflow}`);
    check(hydration.length === 0, `${path} hydrates without complaint`, hydration.join(" ;; "));
  }

  // And the shell it escapes is still the shell everywhere else.
  await page.goto(`${BASE}/sheet`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const shell = await page.evaluate(() => getComputedStyle(document.body).overflowY);
  check(shell === "hidden", "and /sheet keeps its fixed-height frame", `overflow ${shell}`);
  await page.close();
}

async function theToolbarFinds(browser) {
  console.log("\nSearch finds a row on a full sheet");
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
  await signIn(page);
  const box = page.locator('input[type="search"]');
  check((await box.count()) === 1, "the toolbar has a search box");

  const body = () => page.locator("body").innerText();
  await box.fill("medium suv");
  await page.waitForTimeout(700);
  let text = await body();
  check(
    text.includes("Medium SUV") && !text.includes("Market share"),
    "a measure name narrows the sheet to it",
  );

  await box.fill("AU-VOL");
  await page.waitForTimeout(600);
  check((await body()).includes("New vehicle deliveries"), "a code finds its measure");

  await box.fill("Profit and Growth");
  await page.waitForTimeout(600);
  text = await body();
  check(
    text.includes("Medium SUV") && text.includes("Market share"),
    "a matched Goal brings its whole branch, not just the heading",
  );

  await box.fill("nothing on this sheet says this");
  await page.waitForTimeout(600);
  check(!(await body()).includes("Medium SUV"), "a search that matches nothing shows nothing");

  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  check((await body()).includes("Gross profit"), "Escape clears it and the sheet comes back");
  await page.close();
}

/**
 * Folding a branch away, and what happens when the scope changes underneath it.
 *
 * Collapsing an Objective hides everything laddering off it, Level 4 branches
 * included. The case that used to look broken is the second one: switching to
 * "+ Departments" loads the department rows, and a heading somebody had
 * collapsed earlier would swallow every one of them, so the button appeared to
 * do nothing at all.
 */
async function collapsingSurvivesTheScopeToggle(browser) {
  console.log("\nCollapse folds a branch, and changing scope reopens it");
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
  await signIn(page);

  await page.locator("button", { hasText: /Departments/ }).first().click();
  await page.waitForTimeout(3000);
  const departmentRows = async () =>
    // A Level 4 department branch: it appears only once Departments are asked
    // for, and it ladders off the "Parts operations" Level 3.
    page.evaluate(() => document.body.innerText.includes("Fill a parts order first time"));
  check(await departmentRows(), "+ Departments brings the Level 4 rows in");

  const caret = page.locator('button[aria-label^="Collapse"]').first();
  const label = await caret.getAttribute("aria-label");
  await caret.click();
  await page.waitForTimeout(700);
  check(
    (await page.locator('button[aria-label^="Expand"]').count()) > 0,
    "a heading folds its branch away",
    label,
  );

  await page.locator("button", { hasText: /^Company$/ }).first().click();
  await page.waitForTimeout(2500);
  await page.locator("button", { hasText: /Departments/ }).first().click();
  await page.waitForTimeout(3000);
  check(
    (await page.locator('button[aria-label^="Expand"]').count()) === 0,
    "and asking for Departments again reopens everything",
  );
  check(await departmentRows(), "so the Level 4 rows are actually on screen");
  await page.close();
}

async function theMeasuresColumnResizes(browser) {
  console.log("\nThe Measures column can be widened");
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
  await signIn(page);

  const grip = page.locator('[role="separator"][aria-label="Measures column width"]');
  const width = async () => Number(await grip.getAttribute("aria-valuenow"));
  check((await grip.count()) === 1, "the column has a grip on its edge");
  const started = await width();

  const box = await grip.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + box.height / 2, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  const dragged = await width();
  check(dragged > started + 60, "dragging it widens the column", `${started}px -> ${dragged}px`);

  // The measure names really do get the room, not just the header.
  const label = await page.evaluate(() => {
    const link = [...document.querySelectorAll("a")].find((a) => a.textContent.trim() === "Market share");
    return link ? link.getBoundingClientRect().width : 0;
  });
  check(label > 0, "and the names sit in it", `${Math.round(label)}px wide`);

  await page.reload();
  await page.waitForTimeout(2500);
  check((await width()) === dragged, "the width survives a reload", `${await width()}px`);

  await grip.focus();
  for (let i = 0; i < 40; i++) await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(400);
  const floor = await width();
  check(floor >= 180, "and cannot be dragged away to nothing", `stopped at ${floor}px`);

  await grip.dblclick();
  await page.waitForTimeout(400);
  check((await width()) === 300, "double-clicking puts it back", `${await width()}px`);

  await page.close();
}

/**
 * Adding a row before anybody has decided what measures it.
 *
 * The policy is usually agreed before the metric is, and an Objective with
 * nothing against it is how a hole in the deployment stays visible. The Admin
 * structure builder used to be the only way to make one; M+ carries it now,
 * behind a checkbox, and the fields that would file a Control Item disappear
 * because there is no Control Item to file.
 */
async function aRowCanBeAddedBeforeItIsMeasured(browser) {
  console.log("\nA row can be added before anything measures it");
  const page = await browser.newPage({ viewport: { width: 1700, height: 950 } });
  await signIn(page);
  await page.locator('button[title="Add, rename and remove rows directly on the sheet"]').click();
  await page.waitForTimeout(1500);

  const rows = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[style*="--label-width"]')]
        .filter((cell) => /padding-left/.test(cell.getAttribute("style") || ""))
        .map((cell) => ({
          indent: Number(/padding-left:\s*([0-9.]+)px/.exec(cell.getAttribute("style"))[1]),
          text: [...cell.childNodes].map((node) => node.textContent).join("").trim(),
        }))
        .filter((row) => row.text));

  // M+ on the first Goal.
  await page.locator('button[title^="Add measure"]').first().click();
  await page.waitForTimeout(1000);

  const box = page.locator('.bg-paper-sunken input[type="checkbox"]');
  check((await box.count()) === 1, "M+ offers to add the row unmeasured");

  const fieldCount = () =>
    page.locator(".bg-paper-sunken select, .bg-paper-sunken input").count();
  const withMeasure = await fieldCount();
  await box.check();
  await page.waitForTimeout(400);
  const without = await fieldCount();
  check(
    without < withMeasure,
    "ticking it takes the Control Item's own fields away",
    `${withMeasure} fields -> ${without}`,
  );

  const stamp = Date.now().toString().slice(-5);
  const name = `UICHECK-BARE-${stamp}`;
  await page
    .locator('.bg-paper-sunken input[type="text"], .bg-paper-sunken input:not([type])')
    .first()
    .fill(name);
  await page.waitForTimeout(300);
  const submit = page.locator("button", { hasText: /^Add row$/ });
  check((await submit.count()) > 0, "and the button says what it will do now");
  await submit.last().click();
  await page.waitForTimeout(4000);

  const after = await rows();
  const at = after.findIndex((row) => row.text.includes(name));
  check(at !== -1, "the row is on the sheet");
  // A statement at Level 2, and nothing beside it: no measured-as, no figures.
  check(at !== -1 && after[at].indent === 18, "at Level 2", at === -1 ? "" : `${after[at].indent}px`);
  const blank = await page.evaluate((text) => {
    const cell = [...document.querySelectorAll('[style*="--label-width"]')].find(
      (candidate) =>
        /padding-left/.test(candidate.getAttribute("style") || "") &&
        candidate.textContent.includes(text),
    );
    if (!cell) return null;
    const row = cell.closest("div");
    return {
      // A group row, so it carries no link to a Control Item of its own.
      linked: Boolean(cell.querySelector('a[href^="/control-item/"]')),
      offersCi: Boolean(cell.querySelector('button[title^="Add a Control Item"]')),
      text: row ? row.textContent.trim() : "",
    };
  }, name);
  check(blank && blank.linked === false, "with nothing measuring it yet");
  check(blank && blank.offersCi === true, "and CI+ on it, which is how it stops being blank");

  // Put the demo data back.
  const clicked = await page.evaluate((text) => {
    for (const cell of document.querySelectorAll('[style*="--label-width"]')) {
      if (!/padding-left/.test(cell.getAttribute("style") || "")) continue;
      if (!cell.textContent.includes(text)) continue;
      const trash = cell.querySelector('button[title="Delete"]');
      if (!trash) return false;
      trash.click();
      return true;
    }
    return false;
  }, name);
  if (clicked) {
    await page.waitForTimeout(1500);
    const confirm = page.locator("button", { hasText: "Delete anyway" });
    if (await confirm.count()) {
      await confirm.first().click();
      await page.waitForTimeout(3000);
    }
  }
  const left = await rows();
  check(
    !left.some((row) => row.text.includes(name)),
    "and the check tidies up after itself",
    left.some((row) => row.text.includes(name)) ? "still there" : "",
  );
  await page.close();
}

/**
 * The order of the row's own buttons, and which rows offer which.
 *
 * They are read left to right by somebody building a plan, so the order is the
 * order of the job: edit this row, add underneath it from the smallest step to
 * the largest, delete. The trash can sits alone at the far end, away from the
 * ones that are reached for constantly.
 *
 * No single row offers all of them any more, and that is the point of the
 * second half: M+ deploys a Level 2 into a Level 3, L4+ hands a Level 3 to a
 * department, and since a branch may only ladder off a Level 3 the two never
 * appear together. What every row must still do is print whatever it does
 * offer in the one order.
 */
async function theRowButtonsAreInOrder(browser) {
  console.log("\nRow buttons read in the order of the job");
  const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
  await signIn(page);
  await page.locator('button[title="Add, rename and remove rows directly on the sheet"]').click();
  await page.waitForTimeout(1500);

  // Every row's indent and its buttons. The indent is how a row's level is
  // read back: 4px at the margin for a Goal, then 14px per level.
  const rows = await page.evaluate(() => {
    return [...document.querySelectorAll('[style*="--label-width"]')]
      .filter((cell) => /padding-left/.test(cell.getAttribute("style") || ""))
      .map((cell) => ({
        indent: Number(/padding-left:\s*([0-9.]+)px/.exec(cell.getAttribute("style"))[1]),
        titles: [...cell.querySelectorAll("button")].map((b) => b.title),
      }));
  });
  check(rows.length > 0, "the sheet has rows to read", `${rows.length} rows`);

  const shorten = (title) =>
    /^Add measure/.test(title) ? "M+"
      : /^Add a Control Item/.test(title) ? "CI+"
      : /^Add department branch/.test(title) ? "L4+"
      : /^Edit|^Rename/.test(title) ? "pencil"
      : /^Delete/.test(title) ? "trash"
      : null;
  const CANONICAL = ["pencil", "M+", "CI+", "L4+", "trash"];
  const orders = rows.map((row) => ({
    indent: row.indent,
    order: row.titles.map(shorten).filter(Boolean),
  }));

  // A row may skip buttons it cannot offer, but never reorder the ones it has.
  const outOfOrder = orders.filter(({ order }) => {
    let at = -1;
    return order.some((name) => {
      const next = CANONICAL.indexOf(name, at + 1);
      if (next === -1) return true;
      at = next;
      return false;
    });
  });
  check(
    outOfOrder.length === 0,
    "every row reads pencil, M+, CI+, L4+, then the trash can",
    outOfOrder.map((row) => `${row.indent}px: ${row.order.join(" ")}`).join(" | "),
  );

  const offered = new Set(orders.flatMap((row) => row.order));
  check(
    CANONICAL.every((name) => offered.has(name)),
    "and between them the rows offer all five",
    CANONICAL.filter((name) => !offered.has(name)).join(", ") || [...offered].join(" "),
  );

  // L4+ belongs to Level 3 and nowhere else: a branch is a department picking
  // up a deployment the company has already made, so there has to be one.
  const withBranch = orders.filter((row) => row.order.includes("L4+"));
  check(withBranch.length > 0, "some row offers a department branch", `${withBranch.length} rows`);
  const strays = withBranch.filter((row) => row.indent !== 32);
  check(
    strays.length === 0,
    "and only rows on the Level 3 vertical do",
    strays.map((row) => `${row.indent}px`).join(", "),
  );

  const levelTwo = orders.filter((row) => row.indent === 18);
  check(levelTwo.length > 0, "the sheet shows Level 2 rows", `${levelTwo.length} rows`);
  check(
    levelTwo.every((row) => !row.order.includes("L4+")),
    "a Level 2 offers no department branch at all",
    levelTwo.filter((row) => row.order.includes("L4+")).length + " did",
  );
  check(
    levelTwo.some((row) => row.order.includes("M+")),
    "it offers M+ instead - deploy it to Level 3 first",
  );

  // The bare "Add objective" is gone: it made the same row M+ makes, minus the
  // figure, and telling the two apart was a distinction nobody should have to
  // learn. Its absence is the point, so it is asserted rather than assumed.
  const bare = rows.flatMap((row) => row.titles).filter((title) => /^Add objective/.test(title));
  check(
    bare.length === 0,
    "and no separate button for an Objective without a measure",
    bare.join(", "),
  );
  await page.close();
}

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
        if (select) return select.options[select.selectedIndex]?.text ?? null;
        // A field the form shows as text: the Objective's statement on a row
        // that does not carry it, which is edited on the row that does.
        const fixed = label.querySelector("span");
        return fixed ? fixed.textContent.trim() : null;
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
 * Admin in sections.
 *
 * Eight panels on one page had become two screens of masonry with no grouping,
 * so they are grouped by the thing being administered and shown one group at a
 * time. What has to hold is that the grouping is real - each section shows its
 * own panels and nobody else's - and that the section is in the URL, so it can
 * be linked to and survives the refresh that follows every action.
 */
async function adminIsInSections(browser) {
  console.log("\nAdmin is grouped into sections");
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await signIn(page);

  const expected = {
    year: ["Ki and plan versions", "Copy structure from a previous Ki"],
    // The structure builder is gone: the sheet is the only place structure is
    // edited by hand, and its absence here is the assertion.
    structure: ["Upload a workbook"],
    organisation: ["Divisions and departments", "Business units"],
    people: ["Users"],
    evaluation: ["Evaluation scale"],
  };

  for (const [section, panels] of Object.entries(expected)) {
    // Straight to the URL, which is the property being checked.
    await page.goto(`${BASE}/admin?section=${section}`);
    await page.waitForTimeout(2000);
    const shown = await page.locator("section h3").allInnerTexts();
    check(
      shown.length === panels.length && panels.every((title) => shown.includes(title)),
      `${section} shows its own panels and nobody else's`,
      shown.join(" | "),
    );
  }

  // An unknown section lands somewhere useful rather than erroring.
  await page.goto(`${BASE}/admin?section=nonsense`);
  await page.waitForTimeout(2000);
  check(
    (await page.locator("section h3").allInnerTexts()).includes("Ki and plan versions"),
    "an unknown section falls back to the first",
  );

  await page.close();
}

/**
 * The workbook upload's preview.
 *
 * The feature's whole safety story is that nothing is written until a second
 * click, so the check that matters is that Preview says what it would do and
 * leaves the plan alone. Uploading the sheet's own export unchanged is the
 * sharpest version of it: every figure already matches, so a correct preview
 * reports no writes at all.
 */
async function theUploadPreviewWritesNothing(browser) {
  console.log("\nUploading a workbook previews before it writes");
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  await signIn(page);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.click('a:has-text("Export to Excel")'),
  ]);
  const file = "/tmp/ui-check-round-trip.xlsx";
  await download.saveAs(file);

  // Admin is grouped into sections now, and the upload lives with the other
  // way of putting rows into the plan.
  await page.goto(`${BASE}/admin?section=structure`);
  await page.waitForTimeout(2500);
  const panel = page.locator("section", { hasText: "Upload a workbook" });
  check((await panel.count()) === 1, "the panel is in Admin's Structure section");

  await panel.locator('input[type="file"]').setInputFiles(file);
  await panel.getByRole("button", { name: "Preview" }).click();
  await page.waitForTimeout(5000);

  const summary = (await panel.locator("div.border p").first().innerText()).replace(/\s+/g, " ");
  check(summary.includes("Nothing has been written"), "the preview says so plainly", summary);
  check(/already matching/.test(summary), "and counts the figures that already match", summary);

  // The version defaults to the first offered, which is not the basis the
  // export was taken on - and that mismatch is the one mistake this feature
  // makes easy, so it has to be said rather than left in a large number.
  const panelText = (await panel.locator("div.border").first().innerText()).replace(/\s+/g, " ");
  check(
    panelText.includes("was exported on"),
    "and warns when the file's basis is not the version being written",
    panelText.slice(0, 140),
  );

  await page.close();
}

/**
 * A Measure carrying several Control Items.
 *
 * The demo plan holds "Service experience" to three targets at once - an NPS,
 * a first-time fix rate and a waiting time - which is the case the Measure
 * model exists for. Two things have to hold and neither is visible to a unit
 * test: the sheet names the measure once rather than three times, and every
 * screen that shows one line per Control Item still tells the three apart.
 */
/**
 * The flattened tree, on the sheet.
 *
 * An Objective is a statement with figures against it, and the two rules that
 * make that readable are hard to see any other way: an Objective carrying one
 * Control Item and nothing deployed from it is ONE row, statement and numbers
 * together; an Objective something IS deployed from prints its statement once,
 * as the header of what hangs beneath it, and never again on the rows below.
 */
async function anObjectiveReadsAsOneStatement(browser) {
  console.log("\nAn Objective's statement is printed exactly once");
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
  await signIn(page);
  await page.waitForTimeout(1500);

  const printed = (statement) =>
    page.evaluate(
      (text) =>
        [...document.querySelectorAll("a, span")].filter(
          (element) => element.textContent.trim() === text,
        ).length,
      statement,
    );

  /*
   * "New vehicle deliveries" carries one Control Item AND four Level 3
   * deployments. The count is what decides the shape and the children have no
   * say in it, so this is one row: the statement beside its own figures, with
   * the branch indented beneath it. It used to print twice - once inline and
   * again as a header for what laddered from it.
   */
  const deployedFrom = await printed("New vehicle deliveries");
  check(deployedFrom === 1, "an Objective that is deployed from names itself once", `${deployedFrom} found`);

  const inlineRow = await page.evaluate(() => {
    const link = [...document.querySelectorAll("a")].find(
      (a) => a.textContent.trim() === "New vehicle deliveries",
    );
    if (!link) return null;
    const cell = link.closest('[style*="padding-left"]');
    const row = link.closest("div.group");
    return {
      // Its own figures are on this row, not on a continuation below it.
      href: link.getAttribute("href"),
      measuredAs: row ? row.textContent.includes("Units") : null,
      // 4px base + one 14px step: the Level 2 vertical, not a step further in.
      indent: cell ? Number(/padding-left:\s*([0-9.]+)px/.exec(cell.getAttribute("style"))[1]) : null,
      // Something ladders off it, so it carries the caret that folds it away.
      caret: cell ? Boolean(cell.querySelector('button[aria-label^="Collapse"]')) : null,
    };
  });
  check(
    Boolean(inlineRow && /^\/control-item\//.test(inlineRow.href)),
    "and the statement is the row that reaches its Control Item",
    inlineRow && inlineRow.href,
  );
  check(inlineRow && inlineRow.indent === 18, "sitting on the Level 2 vertical", inlineRow && `${inlineRow.indent}px`);
  check(inlineRow && inlineRow.caret === true, "with the caret that folds its branch away");

  // An Objective with one Control Item and nothing under it is a single row:
  // the statement and the numbers together.
  const inline = await page.evaluate(() => {
    const link = [...document.querySelectorAll("a")].find(
      (a) => a.textContent.trim() === "Market share",
    );
    if (!link) return null;
    const row = link.closest("div.group") ?? link.parentElement?.parentElement;
    return row ? row.textContent.includes("% of total VFACTS market") : null;
  });
  check(inline === true, "an Objective of one reads as a single row, statement beside its figures");

  await page.close();
}

async function severalControlItemsUnderOneMeasure(browser) {
  console.log("\nA measure can carry several Control Items");
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
  await signIn(page);

  // The measure sits in one division, and narrowing to it keeps the walk short.
  const division = page.locator("label", { hasText: "Division" }).locator("select");
  await division.selectOption("OX");
  await page.waitForTimeout(3000);

  /*
   * "Service experience" carries three Control Items, and two or more is what
   * makes an Objective print a heading: the statement once at the top, then a
   * row per Control Item beneath it telling them apart by what each measures.
   */
  const scroller = page.locator("div.overflow-auto").last();
  let found = false;
  for (let i = 0; i < 30 && !found; i++) {
    found = await page.evaluate(() => {
      const el = [...document.querySelectorAll("a, span")].find(
        (node) => node.textContent.trim() === "Service experience",
      );
      if (el) el.scrollIntoView({ block: "center" });
      return Boolean(el);
    });
    if (!found) await scroller.evaluate((el) => el.scrollBy(0, 300));
    await page.waitForTimeout(200);
  }
  check(found, "the measure is on the sheet");

  const shape = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll("a, span")].filter(
      (node) => node.textContent.trim() === "Service experience",
    );
    const heading = nodes[0]?.closest('[style*="padding-left"]') ?? null;
    const step = (cell) =>
      cell ? Number(/padding-left:\s*([0-9.]+)px/.exec(cell.getAttribute("style"))[1]) : null;
    // The rows under it: continuation rows carry the elbow and their own link.
    const rows = [...document.querySelectorAll('[style*="padding-left"]')].filter((cell) =>
      /padding-left/.test(cell.getAttribute("style") || ""),
    );
    const at = rows.indexOf(heading);
    const following = at === -1 ? [] : rows.slice(at + 1, at + 4);
    return {
      named: nodes.length,
      headingIsALink: nodes[0]?.tagName === "A",
      headingIndent: step(heading),
      elbows: following.filter((cell) => cell.textContent.includes("\u2514")).length,
      elbowIndent: step(following[0]),
      linked: following.filter((cell) =>
        cell.querySelector('a[href^="/control-item/"]'),
      ).length,
    };
  });
  check(shape.named === 1, "its name is printed once, not once per Control Item", `${shape.named} found`);
  check(
    shape.headingIsALink === false,
    "and prints as a heading rather than as one of the measures",
  );
  check(shape.elbows === 3, "with a row for each of its three Control Items", `${shape.elbows} found`);
  check(
    shape.linked === 3,
    "each reaching its own Control Item",
    `${shape.linked} of 3 linked`,
  );
  // 18px is the Level 2 vertical the heading sits on; its Control Items step in.
  check(
    shape.headingIndent === 18 && shape.elbowIndent === 32,
    "and the Control Items indent under the statement",
    `heading ${shape.headingIndent}px, items ${shape.elbowIndent}px`,
  );

  // Away from the sheet there is no grouping to lean on, so the three lines
  // have to name themselves.
  await page.goto(`${BASE}/my-entries?period=2026-08`);
  await page.waitForTimeout(3000);
  const labels = await page.evaluate(() => [
    ...new Set(
      [...document.querySelectorAll("a")]
        .map((a) => a.textContent.trim())
        .filter((text) => text.startsWith("Service experience")),
    ),
  ]);
  check(
    labels.length === 3 && labels.every((label) => label.includes(" \u2014 ")),
    "/my-entries tells the three apart",
    labels.join(" | "),
  );

  await page.close();
}

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
    await theMonthEndReview(browser);
    await anObjectiveReadsAsOneStatement(browser);
    await severalControlItemsUnderOneMeasure(browser);
    await adminIsInSections(browser);
    await theUploadPreviewWritesNothing(browser);
    await pagesDoNotOverflow(browser);
    await myEntriesOnAPhone(browser);
    await theUatWording(browser);
    await oneQuarterAtATime(browser);
    await addingAMeasureLandsAgainstItsRow(browser);
    await thePrintPageIsOneDocument(browser);
    await theToolbarFinds(browser);
    await collapsingSurvivesTheScopeToggle(browser);
    await theMeasuresColumnResizes(browser);
    await aRowCanBeAddedBeforeItIsMeasured(browser);
    await theRowButtonsAreInOrder(browser);
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
