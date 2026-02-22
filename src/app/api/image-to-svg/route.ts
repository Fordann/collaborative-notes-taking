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

interface PathInfo {
  d: string;
  area: number;
  sign: string;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function escapeXmlAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/**
 * Trace image and return individual paths with metadata
 */
function traceImageSeparated(
  luminanceBitmap: InstanceType<typeof Bitmap>,
  options: Record<string, unknown>
): { paths: PathInfo[]; width: number; height: number; fillColor: string } {
  const instance = new potrace.Potrace(options);
  instance._luminanceData = luminanceBitmap;
  instance._imageLoaded = true;

  // Trigger internal processing
  instance._bmToPathlist();
  instance._processPath();
  instance._processed = true;

  const blackOnWhite = instance._params.blackOnWhite;
  let fillColor = instance._params.color;
  if (fillColor === potrace.Potrace.COLOR_AUTO) {
    fillColor = blackOnWhite ? "black" : "white";
  }

  const paths: PathInfo[] = instance._pathlist.map(
    (path: { curve: unknown; area: number; sign: string; minX: number; minY: number; maxX: number; maxY: number }) => ({
      d: potraceUtils.renderCurve(path.curve),
      area: Math.abs(path.area),
      sign: path.sign,
      minX: path.minX,
      minY: path.minY,
      maxX: path.maxX,
      maxY: path.maxY,
    })
  );

  return {
    paths,
    width: luminanceBitmap.width,
    height: luminanceBitmap.height,
    fillColor,
  };
}

/**
 * Check if inner bbox is contained within outer bbox
 */
function bboxContains(outer: PathInfo, inner: PathInfo): boolean {
  return (
    inner.minX >= outer.minX &&
    inner.maxX <= outer.maxX &&
    inner.minY >= outer.minY &&
    inner.maxY <= outer.maxY
  );
}

/**
 * Group paths into outermost shapes with ALL their nested contours.
 *
 * In potrace with fill-rule="evenodd", nesting determines rendering:
 *   "+" at depth 0 → filled
 *   "-" at depth 1 → hole (transparent)
 *   "+" at depth 2 → filled again (island inside hole)
 *   ...
 *
 * ALL contours inside an outermost "+" must stay together in one <path>
 * for evenodd to work correctly. Splitting them breaks the alternation.
 */
function groupPaths(
  paths: PathInfo[],
  minAreaPercent: number
): { major: PathInfo[][]; merged: PathInfo[] } {
  const positivePaths = paths.filter((p) => p.sign === "+");

  // Sort positive by area descending (containers always have larger area)
  const sortedPositive = [...positivePaths].sort((a, b) => b.area - a.area);

  // Identify outermost "+" shapes (not contained in any larger "+" shape)
  const outermost: PathInfo[] = [];
  for (const pos of sortedPositive) {
    const isNested = outermost.some((outer) => bboxContains(outer, pos));
    if (!isNested) {
      outermost.push(pos);
    }
  }

  // For each outermost shape, collect ALL contours (both + and -) inside it
  const claimed = new Set<PathInfo>();
  const groups: { root: PathInfo; all: PathInfo[] }[] = [];

  for (const root of outermost) {
    claimed.add(root);
    const all: PathInfo[] = [root];
    for (const p of paths) {
      if (p === root || claimed.has(p)) continue;
      if (bboxContains(root, p)) {
        all.push(p);
        claimed.add(p);
      }
    }
    groups.push({ root, all });
  }

  // Area threshold
  const maxArea = Math.max(...outermost.map((p) => p.area), 1);
  const threshold = maxArea * (minAreaPercent / 100);

  const major: PathInfo[][] = [];
  const merged: PathInfo[] = paths.filter((p) => !claimed.has(p));

  for (const group of groups) {
    if (group.root.area >= threshold) {
      major.push(group.all);
    } else {
      merged.push(...group.all);
    }
  }

  return { major, merged };
}

/**
 * Combine multiple contours into a single d attribute with z-closed subpaths.
 */
function combinePathsD(contours: PathInfo[]): string {
  return contours.map((p) => p.d + " z").join(" ");
}

/**
 * Build separated SVG: major outermost shapes as individual <path>,
 * small detail merged into one background <path>.
 */
function buildSeparatedSvg(
  result: { paths: PathInfo[]; width: number; height: number; fillColor: string },
  background: string,
  minAreaPercent: number
): string {
  const { paths, width, height, fillColor } = result;
  const { major, merged } = groupPaths(paths, minAreaPercent);

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" version="1.1">\n`;
  svg += `<style>\n`;
  svg += `  .svg-shape { fill: ${escapeXmlAttr(fillColor)}; stroke: none; }\n`;
  svg += `  @keyframes svg-draw { from { opacity: 0; } to { opacity: 1; } }\n`;
  svg += `</style>\n`;

  if (background !== potrace.Potrace.COLOR_TRANSPARENT && background !== "transparent") {
    svg += `\t<rect x="0" y="0" width="100%" height="100%" fill="${escapeXmlAttr(background)}" />\n`;
  }

  svg += `<g class="svg-layer" data-layer="0" fill-rule="evenodd">\n`;

  // Merged background (small outermost shapes + all their nested contours)
  if (merged.length > 0) {
    const mergedD = combinePathsD(merged);
    svg += `\t<path class="svg-shape svg-detail" data-index="0" data-area="detail" d="${mergedD}"/>\n`;
  }

  // Major shapes: outermost + all nested contours in one <path>
  major.forEach((group, i) => {
    const d = combinePathsD(group);
    const idx = merged.length > 0 ? i + 1 : i;
    const rootArea = group[0].area;
    const childCount = group.length - 1;
    svg += `\t<path class="svg-shape" data-index="${idx}" data-area="${Math.round(rootArea)}" data-children="${childCount}" d="${d}"/>\n`;
  });

  svg += `</g>\n</svg>`;
  return svg;
}

interface PosterizeLayerPath {
  d: string;
  area: number;
  sign: string;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface PosterizeLayer {
  paths: PosterizeLayerPath[];
  opacity: number;
  threshold: number;
  fillColor: string;
}

/**
 * Posterize image and return separated layers with individual paths
 */
function posterizeImageSeparated(
  luminanceBitmap: InstanceType<typeof Bitmap>,
  options: Record<string, unknown>
): { layers: PosterizeLayer[]; width: number; height: number } {
  const instance = new potrace.Posterizer(options);
  instance._potrace._luminanceData = luminanceBitmap;
  instance._potrace._imageLoaded = true;

  // Access internal ranges
  const ranges = instance._getRanges();
  const innerPotrace = instance._potrace;
  const blackOnWhite = instance._params.blackOnWhite;

  innerPotrace.setParameters({ blackOnWhite });

  let actualPrevLayersOpacity = 0;
  const layers: PosterizeLayer[] = [];

  for (const colorStop of ranges) {
    const thisLayerOpacity = colorStop.colorIntensity;
    if (thisLayerOpacity === 0) continue;

    const calculatedOpacity =
      !actualPrevLayersOpacity || thisLayerOpacity === 1
        ? thisLayerOpacity
        : (actualPrevLayersOpacity - thisLayerOpacity) /
          (actualPrevLayersOpacity - 1);

    const clampedOpacity = Math.max(
      0,
      Math.min(1, parseFloat(calculatedOpacity.toFixed(3)))
    );
    actualPrevLayersOpacity +=
      (1 - actualPrevLayersOpacity) * clampedOpacity;

    innerPotrace.setParameters({ threshold: colorStop.value });

    // Trigger processing
    innerPotrace._bmToPathlist();
    innerPotrace._processPath();
    innerPotrace._processed = true;

    let fillColor = innerPotrace._params.color;
    if (fillColor === potrace.Potrace.COLOR_AUTO) {
      fillColor = blackOnWhite ? "black" : "white";
    }

    const paths: PosterizeLayerPath[] = innerPotrace._pathlist
      .map(
        (path: { curve: unknown; area: number; sign: string; minX: number; minY: number; maxX: number; maxY: number }) => ({
          d: potraceUtils.renderCurve(path.curve),
          area: Math.abs(path.area),
          sign: path.sign,
          minX: path.minX,
          minY: path.minY,
          maxX: path.maxX,
          maxY: path.maxY,
        })
      )
      .filter((p: PosterizeLayerPath) => p.d && p.d.trim() !== "");

    if (clampedOpacity > 0 && paths.length > 0) {
      layers.push({
        paths,
        opacity: clampedOpacity,
        threshold: colorStop.value,
        fillColor,
      });
    }

    // Reset for next iteration
    innerPotrace._processed = false;
    innerPotrace._pathlist = [];
  }

  return {
    layers,
    width: luminanceBitmap.width,
    height: luminanceBitmap.height,
  };
}

/**
 * Build separated posterize SVG with layers, grouping nested contours properly.
 */
function buildSeparatedPosterizeSvg(
  result: { layers: PosterizeLayer[]; width: number; height: number },
  background: string,
  minAreaPercent: number
): string {
  const { layers, width, height } = result;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" version="1.1">\n`;
  svg += `<style>\n`;
  svg += `  .svg-shape { stroke: none; }\n`;
  svg += `  @keyframes svg-draw { from { opacity: 0; } to { opacity: 1; } }\n`;
  svg += `</style>\n`;

  if (background !== potrace.Potrace.COLOR_TRANSPARENT && background !== "transparent") {
    svg += `\t<rect x="0" y="0" width="100%" height="100%" fill="${escapeXmlAttr(background)}" />\n`;
  }

  let globalPathIndex = 0;

  layers.forEach((layer, layerIndex) => {
    const { major, merged } = groupPaths(layer.paths, minAreaPercent);

    svg += `<g class="svg-layer" data-layer="${layerIndex}" data-opacity="${layer.opacity.toFixed(3)}" data-threshold="${layer.threshold}" fill-rule="evenodd" fill-opacity="${layer.opacity.toFixed(3)}">\n`;

    if (merged.length > 0) {
      const mergedD = combinePathsD(merged);
      svg += `\t<path class="svg-shape svg-detail" data-index="${globalPathIndex}" data-layer-index="${layerIndex}" data-area="detail" fill="${escapeXmlAttr(layer.fillColor)}" d="${mergedD}"/>\n`;
      globalPathIndex++;
    }

    major.forEach((group) => {
      const d = combinePathsD(group);
      const rootArea = group[0].area;
      svg += `\t<path class="svg-shape" data-index="${globalPathIndex}" data-layer-index="${layerIndex}" data-area="${Math.round(rootArea)}" data-children="${group.length - 1}" fill="${escapeXmlAttr(layer.fillColor)}" d="${d}"/>\n`;
      globalPathIndex++;
    });

    svg += `</g>\n`;
  });

  svg += `</svg>`;
  return svg;
}

// --- Original merged functions (non-separated) ---

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
  const separated = formData.get("separated") === "true";
  const minAreaPercent = parseFloat(
    (formData.get("minAreaPercent") as string) || "2"
  );

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

      if (separated) {
        const result = posterizeImageSeparated(luminanceBitmap, posterizeOptions);
        svg = buildSeparatedPosterizeSvg(result, background, minAreaPercent);
      } else {
        svg = posterizeImage(luminanceBitmap, posterizeOptions);
      }
    } else {
      if (separated) {
        const result = traceImageSeparated(luminanceBitmap, options);
        svg = buildSeparatedSvg(result, background, minAreaPercent);
      } else {
        svg = traceImage(luminanceBitmap, options);
      }
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
