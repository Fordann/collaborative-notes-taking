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

// ── Contour tree ──────────────────────────────────────────────────────────

interface ContourNode {
  path: PathInfo;
  children: ContourNode[];
}

/**
 * Build a nesting tree from a flat list of paths.
 * Sorted by area desc, each node's parent is the smallest contour that
 * contains it (tightest fit).
 */
function buildContourTree(paths: PathInfo[]): ContourNode[] {
  const sorted = [...paths].sort((a, b) => b.area - a.area);
  const nodes: ContourNode[] = sorted.map((p) => ({
    path: p,
    children: [],
  }));
  const roots: ContourNode[] = [];

  for (let i = 0; i < nodes.length; i++) {
    let foundParent = false;
    // Search backwards (smaller area first) for the tightest container
    for (let j = i - 1; j >= 0; j--) {
      if (bboxContains(nodes[j].path, nodes[i].path)) {
        nodes[j].children.push(nodes[i]);
        foundParent = true;
        break;
      }
    }
    if (!foundParent) {
      roots.push(nodes[i]);
    }
  }

  return roots;
}

/** Collect all PathInfo in a subtree (node + all descendants) */
function collectSubtree(node: ContourNode): PathInfo[] {
  const result: PathInfo[] = [node.path];
  for (const child of node.children) {
    result.push(...collectSubtree(child));
  }
  return result;
}

// ── Entity grouping ───────────────────────────────────────────────────────

interface EntityGroup {
  /** Root "+" path + direct "-" holes (+ small merged sub-parts) */
  body: PathInfo[];
  /** Each depth-2 "+" subtree that is large enough to animate */
  parts: PathInfo[][];
}

/**
 * Group paths hierarchically:
 *
 * Potrace alternates signs with depth:
 *   depth 0: "+" (filled)
 *   depth 1: "-" (hole/transparent)
 *   depth 2: "+" (island = sub-part inside a hole)
 *   depth 3: "-" (detail hole in sub-part)
 *   …
 *
 * For each outermost "+" (entity), we split:
 *   • body  = root "+" + direct depth-1 "-" children + small sub-parts
 *   • parts = each depth-2 "+" subtree above area threshold
 *
 * The body renders as "entity outline with holes".
 * Each part fills in one of those holes as a separate animatable shape.
 * Together they reproduce the original evenodd rendering.
 */
function groupPathsHierarchical(
  paths: PathInfo[],
  minAreaPercent: number
): { entities: EntityGroup[]; merged: PathInfo[] } {
  const tree = buildContourTree(paths);

  // Only "+" roots are entities
  const outermostPositive = tree.filter((n) => n.path.sign === "+");
  const maxArea = Math.max(...outermostPositive.map((n) => n.path.area), 1);
  const entityThreshold = maxArea * (minAreaPercent / 100);

  const entities: EntityGroup[] = [];
  const merged: PathInfo[] = [];

  // Non-"+" root nodes (rare, safety net)
  for (const n of tree) {
    if (n.path.sign !== "+") {
      merged.push(...collectSubtree(n));
    }
  }

  for (const root of outermostPositive) {
    if (root.path.area < entityThreshold) {
      // Small entity → merge entirely
      merged.push(...collectSubtree(root));
      continue;
    }

    const body: PathInfo[] = [root.path];
    const parts: PathInfo[][] = [];

    // Sub-part threshold relative to entity
    const subPartThreshold = root.path.area * (minAreaPercent / 100);

    for (const child of root.children) {
      if (child.path.sign === "-") {
        // Direct hole → part of body
        body.push(child.path);

        // Depth-2 "+" children of this hole are potential sub-parts
        for (const grandchild of child.children) {
          if (grandchild.path.sign === "+") {
            const subtree = collectSubtree(grandchild);
            if (grandchild.path.area >= subPartThreshold) {
              parts.push(subtree);
            } else {
              body.push(...subtree);
            }
          } else {
            // "-" under "-" (unusual), merge into body
            body.push(...collectSubtree(grandchild));
          }
        }
      } else {
        // "+" under "+" (unusual in potrace), merge into body
        body.push(...collectSubtree(child));
      }
    }

    entities.push({ body, parts });
  }

  return { entities, merged };
}

/**
 * Combine multiple contours into a single d attribute with z-closed subpaths.
 */
function combinePathsD(contours: PathInfo[]): string {
  return contours.map((p) => p.d + " z").join(" ");
}

/**
 * Build separated SVG with entity groups and sub-part granularity.
 *
 * Structure:
 *   <g class="svg-layer">
 *     <path class="svg-shape svg-detail" />           ← merged small entities
 *     <g class="svg-entity" data-entity="0">
 *       <path class="svg-shape svg-body" />            ← entity outline + holes
 *       <path class="svg-shape svg-part" data-part="0" /> ← sub-part
 *       <path class="svg-shape svg-part" data-part="1" /> ← sub-part
 *     </g>
 *     <path class="svg-shape" data-entity="1" />       ← entity without sub-parts
 *   </g>
 */
function buildSeparatedSvg(
  result: {
    paths: PathInfo[];
    width: number;
    height: number;
    fillColor: string;
  },
  background: string,
  minAreaPercent: number
): string {
  const { paths, width, height, fillColor } = result;
  const { entities, merged } = groupPathsHierarchical(paths, minAreaPercent);

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" version="1.1">\n`;
  svg += `<style>\n`;
  svg += `  .svg-shape { fill: ${escapeXmlAttr(fillColor)}; stroke: none; }\n`;
  svg += `  @keyframes svg-draw { from { opacity: 0; } to { opacity: 1; } }\n`;
  svg += `</style>\n`;

  if (
    background !== potrace.Potrace.COLOR_TRANSPARENT &&
    background !== "transparent"
  ) {
    svg += `\t<rect x="0" y="0" width="100%" height="100%" fill="${escapeXmlAttr(background)}" />\n`;
  }

  svg += `<g class="svg-layer" data-layer="0" fill-rule="evenodd">\n`;

  let idx = 0;

  // Merged detail background
  if (merged.length > 0) {
    svg += `\t<path class="svg-shape svg-detail" data-index="${idx}" data-area="detail" d="${combinePathsD(merged)}"/>\n`;
    idx++;
  }

  // Entities
  entities.forEach((entity, entityIdx) => {
    if (entity.parts.length === 0) {
      // No sub-parts → single <path>
      svg += `\t<path class="svg-shape" data-index="${idx}" data-entity="${entityIdx}" d="${combinePathsD(entity.body)}"/>\n`;
      idx++;
    } else {
      // Has sub-parts → <g> wrapper
      svg += `\t<g class="svg-entity" data-entity="${entityIdx}">\n`;

      // Body (outline + holes)
      svg += `\t\t<path class="svg-shape svg-body" data-index="${idx}" data-entity="${entityIdx}" d="${combinePathsD(entity.body)}"/>\n`;
      idx++;

      // Sub-parts
      entity.parts.forEach((part, partIdx) => {
        svg += `\t\t<path class="svg-shape svg-part" data-index="${idx}" data-entity="${entityIdx}" data-part="${partIdx}" data-area="${Math.round(part[0].area)}" d="${combinePathsD(part)}"/>\n`;
        idx++;
      });

      svg += `\t</g>\n`;
    }
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
 * Build separated posterize SVG with entity/sub-part hierarchy per layer.
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

  if (
    background !== potrace.Potrace.COLOR_TRANSPARENT &&
    background !== "transparent"
  ) {
    svg += `\t<rect x="0" y="0" width="100%" height="100%" fill="${escapeXmlAttr(background)}" />\n`;
  }

  let idx = 0;

  layers.forEach((layer, layerIndex) => {
    const { entities, merged } = groupPathsHierarchical(
      layer.paths,
      minAreaPercent
    );
    const fill = escapeXmlAttr(layer.fillColor);

    svg += `<g class="svg-layer" data-layer="${layerIndex}" data-opacity="${layer.opacity.toFixed(3)}" data-threshold="${layer.threshold}" fill-rule="evenodd" fill-opacity="${layer.opacity.toFixed(3)}">\n`;

    if (merged.length > 0) {
      svg += `\t<path class="svg-shape svg-detail" data-index="${idx}" data-layer-index="${layerIndex}" data-area="detail" fill="${fill}" d="${combinePathsD(merged)}"/>\n`;
      idx++;
    }

    entities.forEach((entity, entityIdx) => {
      if (entity.parts.length === 0) {
        svg += `\t<path class="svg-shape" data-index="${idx}" data-entity="${entityIdx}" data-layer-index="${layerIndex}" fill="${fill}" d="${combinePathsD(entity.body)}"/>\n`;
        idx++;
      } else {
        svg += `\t<g class="svg-entity" data-entity="${entityIdx}" data-layer-index="${layerIndex}">\n`;
        svg += `\t\t<path class="svg-shape svg-body" data-index="${idx}" data-entity="${entityIdx}" fill="${fill}" d="${combinePathsD(entity.body)}"/>\n`;
        idx++;
        entity.parts.forEach((part, partIdx) => {
          svg += `\t\t<path class="svg-shape svg-part" data-index="${idx}" data-entity="${entityIdx}" data-part="${partIdx}" data-area="${Math.round(part[0].area)}" fill="${fill}" d="${combinePathsD(part)}"/>\n`;
          idx++;
        });
        svg += `\t</g>\n`;
      }
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
