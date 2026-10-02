import sharp from "sharp";
import { validAvatarPhoto } from "../src/shared.js";
/** Only bounded, decoded JPEGs are stored; re-encoding strips metadata. */
export async function normalizeBottlePhoto(
  value: unknown,
): Promise<string | undefined> {
  if (value === "") return undefined;
  const invalid = () =>
    Object.assign(new Error("Choose a valid JPEG, PNG or WebP bottle photo."), {
      status: 400,
    });
  if (!validAvatarPhoto(value)) throw invalid();
  try {
    const input = Buffer.from(value.split(",")[1], "base64");
    const options = { limitInputPixels: 512 * 512 };
    const metadata = await sharp(input, options).metadata();
    if (
      metadata.format !== "jpeg" ||
      !metadata.width ||
      !metadata.height ||
      metadata.width > 512 ||
      metadata.height > 512
    )
      throw invalid();
    const encoded = await sharp(input, options)
      .rotate()
      .resize(360, 480, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 70 })
      .toBuffer();
    if (encoded.length > 60000) throw invalid();
    return `data:image/jpeg;base64,${encoded.toString("base64")}`;
  } catch {
    throw invalid();
  }
}
