import { NextRequest, NextResponse } from "next/server";
import { PDFParse } from "pdf-parse";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type;

  try {
    let text = "";

    if (mimeType === "application/pdf") {
      const pdf = new PDFParse({ data: buffer });
      const result = await pdf.getText();
      text = result.text;
      await pdf.destroy();
    } else if (mimeType.startsWith("image/")) {
      // For images, use tesseract.js OCR
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("fra+eng");
      const { data } = await worker.recognize(buffer);
      text = data.text;
      await worker.terminate();
    } else {
      // Plain text files
      text = buffer.toString("utf-8");
    }

    if (!text.trim()) {
      return NextResponse.json(
        { error: "Could not extract text from this file" },
        { status: 422 }
      );
    }

    return NextResponse.json({ text });
  } catch (err) {
    console.error("Text extraction failed:", err);
    return NextResponse.json(
      { error: "Failed to extract text" },
      { status: 500 }
    );
  }
}
