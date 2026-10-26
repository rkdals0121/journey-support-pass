export function locationPhotoError(file: {
  size: number;
  name: string;
  type: string;
}): string | null {
  if (file.size > 20 * 1024 * 1024) return "photo_too_large";
  if (!file.size) return "photo_format";
  const validType = /^image\/(jpeg|png|webp|avif|heic|heif)$/.test(
    file.type.toLowerCase(),
  );
  if (
    file.type
      ? !validType
      : !/\.(jpe?g|png|webp|avif|heic|heif)$/i.test(file.name)
  )
    return "photo_format";
  return null;
}
/** Browser-only photo OCR. No image or OCR text is sent to an application server. */
export async function readLocationPhoto(
  file: File,
  signal: AbortSignal,
): Promise<string> {
  if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
  const invalid = locationPhotoError(file);
  if (invalid) throw Error(invalid);
  let worker:
    | Awaited<ReturnType<typeof import("tesseract.js").createWorker>>
    | undefined;
  let url: string | undefined, canvas: HTMLCanvasElement | undefined;
  let rejectAbort: (reason: unknown) => void = () => {};
  const abort = new Promise<never>((_, reject) => {
    rejectAbort = reject;
  });
  const cancel = () => {
    rejectAbort(new DOMException("Cancelled", "AbortError"));
    void worker?.terminate().catch(() => {});
  };
  signal.addEventListener("abort", cancel, { once: true });
  const task = (async () => {
    url = URL.createObjectURL(file);
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
    } catch {
      throw Error("photo_format");
    }
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    const scale = Math.min(
      1,
      1800 / Math.max(image.naturalWidth, image.naturalHeight),
    );
    canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas
      .getContext("2d")!
      .drawImage(image, 0, 0, canvas.width, canvas.height);
    // Release the original decoded photo before loading the recognition models.
    image.src = "";
    URL.revokeObjectURL(url);
    url = undefined;
    const t = await import("tesseract.js");
    // The library otherwise throws a second, unhandled error after rejecting a failed OCR job.
    worker = await t.createWorker(["eng", "kor"], undefined, {
      errorHandler: () => rejectAbort(new Error("photo_ocr")),
    });
    if (signal.aborted) {
      await worker.terminate();
      throw new DOMException("Cancelled", "AbortError");
    }
    const result = await worker.recognize(canvas);
    return result.data.text.slice(0, 4000);
  })();
  try {
    return await Promise.race([task, abort]);
  } finally {
    signal.removeEventListener("abort", cancel);
    if (url) URL.revokeObjectURL(url);
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
    void worker?.terminate().catch(() => {});
    // If model loading completes after cancellation, the task notices the signal and terminates that worker.
    void task.catch(() => {});
  }
}
