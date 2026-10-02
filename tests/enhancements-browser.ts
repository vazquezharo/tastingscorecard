import { openOptionalAvatar } from "./browser-helpers";
import { chromium, expect } from "playwright/test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { choices } from "../src/shared.ts";

const origin = process.env.TEST_URL || "http://127.0.0.1:3017";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
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
  for (const page of [host, guest])
    page.on("pageerror", (e) => errors.push(e.message));
  await host.goto(origin + "/host");
  await host.getByLabel("Host password").fill("local-rehearsal-only");
  await host
    .getByRole("button", { name: "Open host controls", exact: true })
    .click();
  await host
    .getByLabel("Name your evening")
    .fill("Demo · readiness practice review");
  await host.getByRole("button", { name: "Create event", exact: true }).click();
  await host.waitForURL(/\/host\/e\//);
  const id = host.url().split("/").at(-1)!;
  const path = origin + "/api/events/" + id;
  const readHost = async () => (await hc.request.get(path + "?host=1")).json();
  const control = async (action: string, extra = {}) => {
    const e = await readHost();
    const response = await hc.request.post(path + "/control", {
      headers: { Origin: origin },
      data: { action, revision: e.controlRevision, ...extra },
    });
    assert.equal(response.status(), 200);
  };
  await guest.goto(origin + "/e/" + id);
  await guest.getByLabel("Your name").fill("Alex");
  await guest.getByLabel("Create a recovery PIN", { exact: true }).fill("4826");
  await openOptionalAvatar(guest);
  await guest.locator(".drawing-surface").click();
  await guest
    .getByRole("button", { name: "Take my seat", exact: true })
    .click();
  await guest.getByText("Try a practice round", { exact: true }).click();
  const practice = guest.locator(".practice-round");
  await practice.locator("select").selectOption(choices[0]);
  await practice.getByRole("button", { name: "7.0", exact: true }).click();
  await practice
    .getByRole("button", { name: "Increase rating", exact: true })
    .click();
  await practice.locator("textarea").fill("PRIVATE practice note");
  await expect(practice.locator(".save-state.confirmed")).toBeVisible();
  await guest.reload();
  await guest.getByText("Try a practice round", { exact: true }).click();
  await expect(
    practice.getByRole("spinbutton", { name: "Your rating" }),
  ).toHaveValue("7.1");
  assert.ok(
    !JSON.stringify(await readHost()).includes("PRIVATE practice note"),
  );
  await gc.setOffline(true);
  await practice.getByRole("button", { name: "8.0", exact: true }).click();
  await expect(practice.getByText("Not saved", { exact: true })).toBeVisible();
  await gc.setOffline(false);
  await expect(practice.locator(".save-state.confirmed")).toBeVisible({
    timeout: 15000,
  });
  await control("key", { key: [...choices] });
  await control("start");
  await expect(practice).toHaveCount(0);
  await expect(
    host.getByRole("heading", {
      name: "0 of 1 ready for round 1",
      exact: true,
    }),
  ).toBeVisible();
  await expect(host.locator(".host-readiness")).toContainText("Waiting: Alex");
  await guest
    .getByRole("button", { name: "Review scorecard", exact: true })
    .click();
  const review = guest.locator(".scorecard-review");
  await expect(review.locator("li")).toHaveCount(8);
  await expect(
    review.getByRole("button", { name: "Submit scorecard", exact: true }),
  ).toBeDisabled();
  await expect(
    review.getByRole("button", { name: "Edit round 8", exact: true }),
  ).toBeDisabled();
  await review
    .getByRole("button", { name: "Edit round 1", exact: true })
    .click();
  await expect(guest.locator("#guess-1")).toBeFocused();
  await guest.locator("#guess-1").selectOption(choices[0]);
  await guest.getByRole("button", { name: "7.0", exact: true }).last().click();
  await expect(
    guest.locator(".round-card:not([hidden]) .save-state.confirmed"),
  ).toBeVisible();
  await expect(
    host.getByRole("heading", {
      name: "1 of 1 ready for round 1",
      exact: true,
    }),
  ).toBeVisible();
  await guest
    .getByRole("button", { name: "Clear rating", exact: true })
    .click();
  await expect(
    host.getByRole("heading", {
      name: "0 of 1 ready for round 1",
      exact: true,
    }),
  ).toBeVisible();
  await guest.getByRole("button", { name: "7.0", exact: true }).last().click();
  await expect(
    guest.locator(".round-card:not([hidden]) .save-state.confirmed"),
  ).toBeVisible();
  for (let r = 2; r <= 8; r++) {
    await control("unlock");
    await expect(
      host.getByRole("heading", {
        name: `0 of 1 ready for round ${r}`,
        exact: true,
      }),
    ).toBeVisible();
    await expect(guest.locator(`#guess-${r}`)).toBeVisible();
    await guest
      .locator(`#guess-${r}`)
      .selectOption(r === 2 ? choices[0] : choices[r - 1]);
    await guest
      .getByRole("button", { name: "7.0", exact: true })
      .last()
      .click();
    await expect(
      guest.locator(".round-card:not([hidden]) .save-state.confirmed"),
    ).toBeVisible();
  }
  await guest
    .getByRole("button", { name: "Review scorecard", exact: true })
    .click();
  await expect(review.locator("li").first()).toContainText(
    "Repeated wine choice",
  );
  await expect(
    review.getByRole("button", { name: "Submit scorecard", exact: true }),
  ).toBeDisabled();
  await review
    .getByRole("button", { name: "Edit round 2", exact: true })
    .click();
  await guest.locator("#guess-2").selectOption(choices[1]);
  await expect(
    guest.locator(".round-card:not([hidden]) .save-state.confirmed"),
  ).toBeVisible();
  await guest
    .getByRole("button", { name: "Review scorecard", exact: true })
    .click();
  await expect(review.locator(".needs-attention")).toHaveCount(0);
  // Retained offline changes must prevent submission even when the server card is valid.
  await gc.setOffline(true);
  await guest.locator("#notes-2").fill("Pending scored note");
  await expect(
    review.getByText("Changes not confirmed saved", { exact: true }),
  ).toBeVisible();
  await expect(
    review.getByRole("button", { name: "Waiting for saves…", exact: true }),
  ).toBeDisabled();
  await gc.setOffline(false);
  await expect(
    review.getByRole("button", { name: "Submit scorecard", exact: true }),
  ).toBeEnabled({ timeout: 15000 });
  for (const page of [host, guest]) {
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    const scan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    assert.deepEqual(
      scan.violations.map((v) => v.id),
      [],
    );
  }
  mkdirSync("test-artifacts", { recursive: true });
  await guest.screenshot({
    path: "test-artifacts/scorecard-review.png",
    fullPage: true,
  });
  await host.screenshot({
    path: "test-artifacts/host-readiness.png",
    fullPage: true,
  });
  await review
    .getByRole("button", { name: "Submit scorecard", exact: true })
    .click();
  await expect(
    guest.getByText("Scorecard submitted", { exact: true }),
  ).toBeVisible();
  await guest.reload();
  await expect(
    guest.getByText("Scorecard submitted", { exact: true }),
  ).toBeVisible();
  await control("lock");
  await expect(
    guest.getByRole("heading", { name: "Final Scorecard", exact: true }),
  ).toBeVisible();
  await expect(host.locator(".host-readiness")).toHaveCount(0);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: saved practice, offline retry, privacy, live readiness, clearing/reset by round, eight-round review, duplicates, pending-save submission guard, accessibility, mobile layout, submission and lock transition.",
  );
} finally {
  await browser.close();
}
