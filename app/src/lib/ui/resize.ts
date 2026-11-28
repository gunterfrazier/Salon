/**
 * Shrink a phone photo in the browser before upload: longest side ≤ maxSide,
 * re-encoded as JPEG. Keeps uploads small (usually 200–500 KB) and strips
 * location metadata, since the image is redrawn.
 */
export async function shrinkImage(file: File, maxSide = 1600, quality = 0.82): Promise<File> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob: Blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Couldn't process photo"))), "image/jpeg", quality));
  return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
}

/**
 * Shrink a logo, keeping a transparent background: transparent logos stay PNG
 * (JPEG would fill the background in), others become JPEG like photos.
 */
export async function shrinkLogo(file: File, maxSide = 800): Promise<{ file: File; transparent: boolean }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const transparent = hasTransparency(ctx.getImageData(0, 0, w, h).data);
  const type = transparent ? "image/png" : "image/jpeg";
  const blob: Blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Couldn't process the logo"))), type, transparent ? undefined : 0.9));
  return { file: new File([blob], file.name.replace(/\.\w+$/, "") + (transparent ? ".png" : ".jpg"), { type }), transparent };
}

/** Whether any noticeable part of the picture is see-through (RGBA bytes). */
export function hasTransparency(rgba: Uint8ClampedArray | Uint8Array): boolean {
  let clear = 0;
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] < 250) clear++;
  // Ignore a few soft edge pixels; a real transparent background is a lot of them.
  return clear > Math.max(16, (rgba.length / 4) * 0.01);
}
