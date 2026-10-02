import sharp from "sharp";
import { validAvatarPhoto } from "../src/shared.js";
export async function normalizeAvatarPhoto(
  value: unknown,
): Promise<string | undefined> {
  if (value === undefined || value === "") return undefined;
  const invalid = () =>
    Object.assign(
      new Error(
        "Choose a valid photo. Use JPEG, PNG or WebP in the photo picker.",
      ),
      { status: 400 },
    );
  if (!validAvatarPhoto(value)) throw invalid();
  try {
    const input = Buffer.from(value.split(",")[1], "base64");
    const metadata = await sharp(input, {
      limitInputPixels: 512 * 512,
    }).metadata();
    if (
      metadata.format !== "jpeg" ||
      !metadata.width ||
      !metadata.height ||
      metadata.width > 512 ||
      metadata.height > 512
    )
      throw invalid();
    let encoded = await sharp(input, { limitInputPixels: 512 * 512 })
      .rotate()
      .resize(128, 128, { fit: "cover" })
      .jpeg({ quality: 70 })
      .toBuffer();
    if (encoded.length > 8500)
      encoded = await sharp(input, { limitInputPixels: 512 * 512 })
        .rotate()
        .resize(96, 96, { fit: "cover" })
        .jpeg({ quality: 50 })
        .toBuffer();
    if (encoded.length > 8500) throw invalid();
    return `data:image/jpeg;base64,${encoded.toString("base64")}`;
  } catch {
    throw invalid();
  }
}
