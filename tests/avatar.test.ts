import { test } from "node:test";
import assert from "node:assert/strict";
import { avatarColors, validAvatar } from "../src/shared.ts";

test("avatar validation rejects executable images, bad coordinates and excessive drawings", () => {
  assert.equal(validAvatar([]), true);
  assert.equal(
    validAvatar([
      {
        color: avatarColors[0],
        points: [
          [0, 100],
          [50, 50],
        ],
      },
    ]),
    true,
  );
  for (const value of [
    "<svg onload='alert(1)'>",
    null,
    [{ color: "url(javascript:alert(1))", points: [[1, 1]] }],
    [{ color: avatarColors[0], points: [[101, 0]] }],
    [{ color: avatarColors[0], points: [[NaN, 1]] }],
    [{ color: avatarColors[0], points: [] }],
    [
      {
        color: avatarColors[0],
        points: Array.from({ length: 1001 }, () => [1, 1]),
      },
    ],
    Array.from({ length: 61 }, () => ({
      color: avatarColors[0],
      points: [[1, 1]],
    })),
  ])
    assert.equal(validAvatar(value), false);
});

test("photo avatars are decoded, normalized and reject unsafe or oversized inputs", async () => {
  const sharp = (await import("sharp")).default;
  const { normalizeAvatarPhoto } = await import("../server/avatar-photo.ts");
  const buffer = await sharp({
    create: { width: 256, height: 256, channels: 3, background: "#d6ad69" },
  })
    .jpeg()
    .toBuffer();
  const photo = `data:image/jpeg;base64,${buffer.toString("base64")}`;
  const normalized = await normalizeAvatarPhoto(photo);
  assert.ok(normalized && normalized.length < 12000);
  const meta = await sharp(
    Buffer.from(normalized!.split(",")[1], "base64"),
  ).metadata();
  assert.equal(meta.width, 128);
  assert.equal(meta.height, 128);
  assert.equal(meta.format, "jpeg");
  assert.equal(meta.exif, undefined);
  for (const input of [
    "https://example.com/photo.jpg",
    "data:image/svg+xml;base64,PHN2Zz4=",
    "data:image/jpeg;base64,/9j/bm90YW5pbWFnZQ==",
    photo + "a".repeat(130000),
  ])
    await assert.rejects(normalizeAvatarPhoto(input));
  const large = await sharp({
    create: { width: 1024, height: 1024, channels: 3, background: "red" },
  })
    .jpeg()
    .toBuffer();
  await assert.rejects(
    normalizeAvatarPhoto(`data:image/jpeg;base64,${large.toString("base64")}`),
  );
});
