"use client";

/**
 * Renders the first page of a PDF file to a PNG image (base64).
 * Used client-side to capture the visual appearance of a PDF
 * before sending it through visual style analysis.
 */
export async function pdfPageToImage(file: File): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist");

  // Use the bundled worker
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  // Render first page at 2x scale for good quality
  const page = await pdf.getPage(1);
  const scale = 2;
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Cannot create canvas context");

  await page.render({ canvasContext: context, viewport }).promise;

  // Convert to PNG base64 (without the data:image/png;base64, prefix)
  const dataUrl = canvas.toDataURL("image/png");
  return dataUrl.split(",")[1];
}
