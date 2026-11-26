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
