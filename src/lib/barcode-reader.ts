/** Local decoding only. QR, PDF417 and other boarding-code symbologies share one payload path. */
let reader: Promise<typeof import("zxing-wasm/reader")> | null = null;
export function loadBarcodeReader() {
  if (!reader)
    reader = import("zxing-wasm/reader")
      .then(async (m) => {
        if (typeof window !== "undefined")
          await m.prepareZXingModule({
            overrides: {
              locateFile: (path) =>
                path.endsWith(".wasm") ? "/barcode/zxing_reader.wasm" : path,
            },
            fireImmediately: true,
          });
        return m;
      })
      .catch((e) => {
        reader = null;
        throw e;
      });
  return reader;
}
export async function decodeBarcode(image: ImageData): Promise<string | null> {
  const m = await loadBarcodeReader();
  const results = await m.readBarcodes(image, {
    formats: ["QRCode", "PDF417", "Aztec", "DataMatrix", "Code128"],
    tryHarder: true,
    tryRotate: true,
    maxNumberOfSymbols: 4,
  });
  const valid = results.filter((r) => r.isValid && r.text);
  return (
    valid.find((r) => /^(BP1:|M[1-4])/.test(r.text))?.text ??
    valid[0]?.text ??
    null
  );
}
export async function readBoardingImage(file: File): Promise<string | null> {
  if (!file.type.startsWith("image/") || file.size > 20 * 1024 * 1024)
    throw Error("image");
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 2800 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await decodeBarcode(
      ctx.getImageData(0, 0, canvas.width, canvas.height),
    );
  } finally {
    bitmap.close();
  }
}
