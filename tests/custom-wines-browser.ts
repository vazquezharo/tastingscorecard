import { chromium } from "playwright";
import assert from "node:assert/strict";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
const origin = process.env.TEST_URL || "http://127.0.0.1:3013";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  const hc = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const gc = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const host = await hc.newPage(),
    guest = await gc.newPage();
  const errors: string[] = [];
  for (const p of [host, guest])
    p.on("pageerror", (e) => errors.push(e.message));
  await host.goto(origin + "/host");
  await host.getByLabel("Host password").fill(process.env.HOST_PASSWORD!);
  await host
    .getByRole("button", { name: "Open host controls", exact: true })
    .click();
  await host.getByLabel("Name your evening").fill("Demo · custom wine browser");
  await host.getByRole("button", { name: "Create event", exact: true }).click();
  await host.waitForURL(/\/host\/e\//);
  const id = host.url().split("/").at(-1)!;
  await host.getByText("Edit event wines", { exact: true }).click();
  await host.getByLabel("Wine type 1", { exact: true }).fill("Nebbiolo");
  await host
    .getByLabel("Producer 1", { exact: true })
    .fill("Demo Private Producer");
  for (let i = 0; i < 2; i++)
    await host.waitForResponse(
      (r) => r.url().includes("?host=1") && r.status() === 200,
    );
  assert.equal(
    await host.getByLabel("Wine type 1", { exact: true }).inputValue(),
    "Nebbiolo",
  );
  await host.getByLabel("Wine type 2", { exact: true }).fill("nebbiolo");
  assert.equal(
    await host
      .getByRole("button", { name: "Save wine list", exact: true })
      .isDisabled(),
    true,
  );
  await host.getByLabel("Wine type 2", { exact: true }).fill("Grenache");
  await host
    .getByRole("button", { name: "Save wine list", exact: true })
    .click();
  await host.getByText("Wine list saved.", { exact: true }).waitFor();
  await host.reload();
  await host.getByText("Edit event wines", { exact: true }).click();
  assert.equal(
    await host.getByLabel("Wine type 1", { exact: true }).inputValue(),
    "Nebbiolo",
  );
  assert.equal(
    await host.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  const scan = await new AxeBuilder({ page: host })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  assert.deepEqual(
    scan.violations.map((v) => v.id),
    [],
  );
  mkdirSync("test-artifacts/custom-wines", { recursive: true });
  await host.screenshot({
    path: "test-artifacts/custom-wines/host-phone.png",
    fullPage: true,
  });
  const e = await (
    await hc.request.get(`${origin}/api/events/${id}?host=1`)
  ).json();
  for (let r = 1; r <= 8; r++)
    await host
      .getByLabel(`Answer for round ${r}`, { exact: true })
      .selectOption(e.choices[r - 1]);
  await host
    .getByRole("button", { name: "Save answer key", exact: true })
    .click();
  await host
    .getByRole("button", { name: "Start round 1", exact: true })
    .click();
  await guest.goto(`${origin}/e/${id}`);
  await guest.getByLabel("Your name").fill("Custom guest");
  await guest.getByLabel("Create a recovery PIN", { exact: true }).fill("4826");
  await guest.locator(".drawing-surface").click();
  await guest
    .getByRole("button", { name: "Take my seat", exact: true })
    .click();
  await guest.locator("#guess-1").waitFor();
  assert.deepEqual(await guest.locator("#guess-1 option").allTextContents(), [
    "Choose a wine type",
    ...e.choices,
  ]);
  assert.ok(
    !(await guest.locator("body").innerText()).includes(
      "Demo Private Producer",
    ),
  );
  await guest.locator("#guess-1").selectOption("Nebbiolo");
  await guest.getByRole("button", { name: "8.0", exact: true }).click();
  await guest
    .locator(".round-card:not([hidden]) .save-state.confirmed")
    .waitFor();
  await guest.reload();
  assert.equal(await guest.locator("#guess-1").inputValue(), "Nebbiolo");
  assert.equal(
    await host.getByText("Edit event wines", { exact: true }).count(),
    0,
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      passed: true,
      hostEditAndSave: true,
      editsSurvivePolling: true,
      duplicateValidation: true,
      refreshPersistence: true,
      mobileOverflow: false,
      axeViolations: 0,
      guestCustomChoicesAndSave: true,
      producerPrivate: true,
      editorHiddenAfterStart: true,
      pageErrors: errors,
    }),
  );
} finally {
  await browser.close();
}
