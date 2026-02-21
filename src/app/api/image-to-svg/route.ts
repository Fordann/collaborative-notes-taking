import { NextRequest, NextResponse } from "next/server";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const potrace = require("potrace");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Bitmap = require("potrace/lib/types/Bitmap");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const potraceUtils = require("potrace/lib/utils");

/**
 * Bypass Jimp entirely by loading image pixels with sharp
 * and building the Potrace luminance bitmap ourselves.
 */
async function loadImageWithSharp(imageBuffer: Buffer) {
  const sharp = (await import("sharp")).default;
  const image = sharp(imageBuffer).resize({
    width: 2048,
    height: 2048,
    fit: "inside",
    withoutEnlargement: true,
  });

  const { data, info } = await image
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  const bitmap = new Bitmap(width, height);

  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    const opacity = data[idx + 3] / 255;
    const r = 255 + (data[idx + 0] - 255) * opacity;
    const g = 255 + (data[idx + 1] - 255) * opacity;
    const b = 255 + (data[idx + 2] - 255) * opacity;
    bitmap.data[i] = potraceUtils.luminance(r, g, b);
  }

  return bitmap;
}

function traceImage(
  luminanceBitmap: InstanceType<typeof Bitmap>,
  options: Record<string, unknown>
): string {
  const instance = new potrace.Potrace(options);
  instance._luminanceData = luminanceBitmap;
  instance._imageLoaded = true;
  return instance.getSVG();
}

function posterizeImage(
  luminanceBitmap: InstanceType<typeof Bitmap>,
  options: Record<string, unknown>
): string {
  const instance = new potrace.Posterizer(options);
  instance._potrace._luminanceData = luminanceBitmap;
  instance._potrace._imageLoaded = true;
  return instance.getSVG();
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const mode = (formData.get("mode") as string) || "trace";
  const threshold = formData.get("threshold") as string | null;
  const color = (formData.get("color") as string) || "auto";
  const background = (formData.get("background") as string) || "transparent";
  const turdSize = formData.get("turdSize") as string | null;
  const steps = formData.get("steps") as string | null;

  if (!file) {
    return NextResponse.json(
      { error: "Aucun fichier fourni" },
      { status: 400 }
    );
  }

  if (!file.type.startsWith("image/")) {
    return NextResponse.json(
      { error: "Le fichier doit être une image (PNG, JPG, BMP, GIF)" },
      { status: 400 }
    );
  }

  const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: "L'image ne doit pas dépasser 10 Mo" },
      { status: 400 }
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const luminanceBitmap = await loadImageWithSharp(buffer);

    const options: Record<string, unknown> = {
      color: color === "auto" ? potrace.Potrace.COLOR_AUTO : color,
      background:
        background === "transparent"
          ? potrace.Potrace.COLOR_TRANSPARENT
          : background,
      turdSize: turdSize ? parseInt(turdSize, 10) : 2,
      optCurve: true,
      optTolerance: 0.2,
    };

    if (threshold && threshold !== "auto") {
      options.threshold = parseInt(threshold, 10);
    } else {
      options.threshold = potrace.Potrace.THRESHOLD_AUTO;
    }

    let svg: string;

    if (mode === "posterize") {
      const posterizeOptions = {
        ...options,
        steps: steps ? parseInt(steps, 10) : 4,
      };
      svg = posterizeImage(luminanceBitmap, posterizeOptions);
    } else {
      svg = traceImage(luminanceBitmap, options);
    }

    return new NextResponse(svg, {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml",
      },
    });
  } catch (err) {
    console.error("Image to SVG conversion failed:", err);
    return NextResponse.json(
      { error: "La conversion a échoué. Vérifiez que l'image est valide." },
      { status: 500 }
    );
  }
}
