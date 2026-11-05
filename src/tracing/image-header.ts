export const MAX_FILE_BYTES = 4_000_000;
export const MAX_PIXELS = 16_000_000;
export const MAX_SIDE = 8000;
export function inspectImage(bytes: Uint8Array): {
  width: number;
  height: number;
  mime: "image/png" | "image/jpeg";
} {
  let width = 0,
    height = 0;
  let mime: "image/png" | "image/jpeg";
  if (
    bytes.length >= 24 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)
  ) {
    if (String.fromCharCode(...bytes.subarray(12, 16)) !== "IHDR")
      throw Error("The PNG header is not valid.");
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    width = view.getUint32(16);
    height = view.getUint32(20);
    mime = "image/png";
  } else if (bytes[0] === 255 && bytes[1] === 216) {
    mime = "image/jpeg";
    let i = 2;
    const frames = new Set([
      0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
      0xcf,
    ]);
    while (i + 3 < bytes.length) {
      if (bytes[i++] !== 255) throw Error("The JPEG header is not valid.");
      while (bytes[i] === 255) i++;
      const marker = bytes[i++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
      const length = (bytes[i] << 8) | bytes[i + 1];
      if (length < 2 || i + length > bytes.length)
        throw Error("The JPEG is incomplete.");
      if (frames.has(marker)) {
        if (length < 8) throw Error("The JPEG header is incomplete.");
        height = (bytes[i + 3] << 8) | bytes[i + 4];
        width = (bytes[i + 5] << 8) | bytes[i + 6];
        break;
      }
      i += length;
    }
  } else throw Error("This is not a valid PNG or JPG image.");
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1
  )
    throw Error("The image dimensions could not be read.");
  if (width > MAX_SIDE || height > MAX_SIDE || width * height > MAX_PIXELS)
    throw Error(
      "Use an image up to 16 megapixels, with no side longer than 8000 pixels.",
    );
  return { width, height, mime };
}
const checked = new Map<string, ReturnType<typeof inspectImage>>();
export function inspectDataURL(url: string) {
  const cached = checked.get(url);
  if (cached) return cached;
  if (
    typeof url !== "string" ||
    url.length > 5_400_000 ||
    !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(url)
  )
    throw Error("Invalid original image data.");
  const raw = atob(url.slice(url.indexOf(",") + 1));
  if (raw.length > MAX_FILE_BYTES)
    throw Error("The original image exceeds 4 MB.");
  const bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
  const dimensions = inspectImage(bytes);
  if (!url.startsWith(`data:${dimensions.mime};`))
    throw Error("The original image type does not match its data.");
  if (checked.size >= 32) checked.delete(checked.keys().next().value!);
  checked.set(url, dimensions);
  return dimensions;
}
