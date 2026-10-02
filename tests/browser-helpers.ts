import type { Page } from "playwright";
export async function openOptionalAvatar(page: Page) {
  const editor = page.locator(".join-avatar");
  if (
    (await editor.count()) &&
    !(await editor.evaluate((el) => (el as HTMLDetailsElement).open))
  )
    await editor.locator("summary").click();
}

/** Existing end-to-end scenarios recover through the host approval protocol. */
export async function approveSeatRecovery(
  page: Page,
  host: import("playwright").APIRequestContext,
  origin: string,
  eventId: string,
  name: string,
) {
  await page
    .getByLabel("Your existing display name")
    .selectOption({ label: name });
  await page
    .getByRole("button", { name: "Ask host to approve", exact: true })
    .click();
  await page.getByText(/Waiting for your host to approve/).waitFor();
  const path = `${origin}/api/events/${eventId}`;
  const e = await (await host.get(path + "?host=1")).json();
  const request = e.recoveryRequests.find(
    (r: { name: string }) => r.name === name,
  );
  if (!request) throw new Error("Recovery request did not reach the host");
  const response = await host.post(path + `/recovery/${request.id}`, {
    headers: { Origin: origin },
    data: { decision: "approve" },
  });
  if (response.status() !== 200) throw new Error("Host approval failed");
}
