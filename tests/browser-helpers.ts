import type { Page } from "playwright";
export async function openOptionalAvatar(page: Page) {
  const editor = page.locator(".join-avatar");
  if (
    (await editor.count()) &&
    !(await editor.evaluate((el) => (el as HTMLDetailsElement).open))
  )
    await editor.locator("summary").click();
}
