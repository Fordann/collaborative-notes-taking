// Server-side PDF generation — style-aware, minimal branding
// Generates HTML that closely matches the student's original note style

import { StyleProfile } from "./ai";

export interface PdfContent {
  studentName: string;
  courseTitle: string;
  mergedNotes: string;
  completenessScore: number;
  newInfoHighlights: string[];
  originalScore: number;
  styleProfile?: Partial<StyleProfile> | null;
}

interface CSSConfig {
  fontFamily: string;
  textColor: string;
  headingColor: string;
  subHeadingColor: string;
  accentColor: string;
  newInfoBorderColor: string;
  fontSize: string;
  lineHeight: string;
  headingTransform: string; // "uppercase" | "none" | "capitalize"
  headingBorder: boolean;
  listStyle: string; // CSS list-style-type or custom marker
  boldColor: string; // Color for bold/important terms
}

const COLOR_MAP: Record<string, string> = {
  rouge: "#dc2626",
  red: "#dc2626",
  bleu: "#2563eb",
  blue: "#2563eb",
  vert: "#059669",
  green: "#059669",
  violet: "#7c3aed",
  purple: "#7c3aed",
  orange: "#ea580c",
  rose: "#e11d48",
  pink: "#e11d48",
  noir: "#1a1a2e",
  black: "#1a1a2e",
  gris: "#6b7280",
  gray: "#6b7280",
  marron: "#92400e",
  brown: "#92400e",
  jaune: "#ca8a04",
  yellow: "#ca8a04",
  "bleu foncé": "#1e40af",
  "bleu clair": "#3b82f6",
  "rouge foncé": "#991b1b",
  "vert foncé": "#166534",
};

function findColorInText(text: string, context: string): string | null {
  const lower = text.toLowerCase();
  // Check for hex codes near context
  const contextIdx = lower.indexOf(context.toLowerCase());
  const zone =
    contextIdx >= 0
      ? lower.substring(Math.max(0, contextIdx - 30), contextIdx + 80)
      : lower;

  const hexMatch = zone.match(/#[0-9a-f]{3,6}/);
  if (hexMatch) return hexMatch[0];

  // Check for color names (longer names first for specificity)
  const sortedColors = Object.entries(COLOR_MAP).sort(
    (a, b) => b[0].length - a[0].length
  );
  for (const [name, hex] of sortedColors) {
    if (zone.includes(name)) return hex;
  }
  return null;
}

function extractCSS(profile?: Partial<StyleProfile> | null): CSSConfig {
  const defaults: CSSConfig = {
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    textColor: "#1e293b",
    headingColor: "#0f172a",
    subHeadingColor: "#334155",
    accentColor: "#6366f1",
    newInfoBorderColor: "#a5b4fc",
    fontSize: "14px",
    lineHeight: "1.65",
    headingTransform: "none",
    headingBorder: false,
    listStyle: "disc",
    boldColor: "inherit",
  };

  if (!profile) return defaults;

  const config = { ...defaults };
  const p = profile as Record<string, unknown>;

  // Use explicit CSS fields if present
  if (p.cssHeadingColor) config.headingColor = p.cssHeadingColor as string;
  if (p.cssAccentColor) config.accentColor = p.cssAccentColor as string;
  if (p.cssTextColor) config.textColor = p.cssTextColor as string;
  if (p.cssFontFamily) config.fontFamily = p.cssFontFamily as string;
  if (p.cssNewInfoColor)
    config.newInfoBorderColor = p.cssNewInfoColor as string;

  // Parse font preference
  if (profile.fontPreference) {
    const fp = profile.fontPreference.toLowerCase();
    if (!p.cssFontFamily) {
      if (fp.includes("serif") && !fp.includes("sans")) {
        config.fontFamily = "Georgia, 'Times New Roman', Times, serif";
      } else if (fp.includes("mono") || fp.includes("courier")) {
        config.fontFamily = "'Courier New', Courier, monospace";
      } else if (fp.includes("arial") || fp.includes("helvetica")) {
        config.fontFamily = "Arial, Helvetica, sans-serif";
      } else if (fp.includes("calibri")) {
        config.fontFamily = "Calibri, 'Segoe UI', sans-serif";
      }
    }
  }

  // Parse capitalization
  if (profile.capitalization) {
    const cap = profile.capitalization.toLowerCase();
    if (cap.includes("majuscule") || cap.includes("uppercase")) {
      config.headingTransform = "uppercase";
    } else if (cap.includes("titre") || cap.includes("title case")) {
      config.headingTransform = "capitalize";
    }
  }

  // Parse heading style for underlines
  if (profile.headingStyle) {
    const hs = profile.headingStyle.toLowerCase();
    if (hs.includes("soulign") || hs.includes("underline")) {
      config.headingBorder = true;
    }
  }

  // Parse list markers
  if (profile.listMarkers) {
    const lm = profile.listMarkers.toLowerCase();
    if (lm.includes("tiret") || lm.includes("-")) {
      config.listStyle = '"- "';
    } else if (lm.includes("flèche") || lm.includes("→")) {
      config.listStyle = '"→ "';
    } else if (lm.includes("étoile") || lm.includes("*")) {
      config.listStyle = '"* "';
    } else if (lm.includes("puce") || lm.includes("•")) {
      config.listStyle = "disc";
    }
  }

  // Parse colors from text descriptions
  if (profile.colors) {
    if (!p.cssHeadingColor) {
      const hc = findColorInText(profile.colors, "titre");
      if (hc) {
        config.headingColor = hc;
        config.subHeadingColor = hc;
      }
    }
    if (!p.cssAccentColor) {
      const ac =
        findColorInText(profile.colors, "important") ||
        findColorInText(profile.colors, "surlign") ||
        findColorInText(profile.colors, "clé");
      if (ac) config.accentColor = ac;
    }
    // Check for bold/important term colors
    const bc =
      findColorInText(profile.colors, "gras") ||
      findColorInText(profile.colors, "important") ||
      findColorInText(profile.colors, "clé");
    if (bc) config.boldColor = bc;
  }

  // Derive new info border from accent (lighter)
  if (!p.cssNewInfoColor) {
    config.newInfoBorderColor = config.accentColor + "60";
  }

  return config;
}

/** Convert inline markdown to HTML */
function inlineFormat(text: string, boldColor: string): string {
  // Bold: **text** or __text__
  let result = text.replace(
    /\*\*(.+?)\*\*/g,
    boldColor !== "inherit"
      ? `<strong style="color:${boldColor}">$1</strong>`
      : "<strong>$1</strong>"
  );
  result = result.replace(
    /__(.+?)__/g,
    boldColor !== "inherit"
      ? `<strong style="color:${boldColor}">$1</strong>`
      : "<strong>$1</strong>"
  );
  // Italic: *text* or _text_ (but not inside already processed bold)
  result = result.replace(
    /(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g,
    "<em>$1</em>"
  );
  result = result.replace(
    /(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g,
    "<em>$1</em>"
  );
  return result;
}

export function generateMergedNotesHTML(content: PdfContent): string {
  const css = extractCSS(content.styleProfile);

  // Determine if using custom list markers
  const isCustomMarker =
    css.listStyle.startsWith('"') || css.listStyle === "none";
  const markerCSS = isCustomMarker
    ? `list-style-type: none; padding-left: 0;`
    : `list-style-type: ${css.listStyle};`;
  const markerBefore = isCustomMarker
    ? `content: ${css.listStyle}; margin-right: 4px;`
    : "";

  const lines = content.mergedNotes.split("\n");
  const htmlParts: string[] = [];
  let inList = false;

  for (const line of lines) {
    const isNew = line.startsWith("[NOUVEAU]");
    const raw = isNew ? line.replace("[NOUVEAU]", "").trim() : line;
    const newClass = isNew ? " new-info" : "";
    const formatted = inlineFormat(raw, css.boldColor);

    // Empty line
    if (raw.trim() === "") {
      if (inList) {
        htmlParts.push("</ul>");
        inList = false;
      }
      htmlParts.push("<br/>");
      continue;
    }

    // Markdown headings: #, ##, ###
    if (raw.startsWith("# ")) {
      if (inList) { htmlParts.push("</ul>"); inList = false; }
      htmlParts.push(`<h1 class="h1${newClass}">${inlineFormat(raw.substring(2), css.boldColor)}</h1>`);
      continue;
    }
    if (raw.startsWith("## ")) {
      if (inList) { htmlParts.push("</ul>"); inList = false; }
      htmlParts.push(`<h2 class="h2${newClass}">${inlineFormat(raw.substring(3), css.boldColor)}</h2>`);
      continue;
    }
    if (raw.startsWith("### ")) {
      if (inList) { htmlParts.push("</ul>"); inList = false; }
      htmlParts.push(`<h3 class="h3${newClass}">${inlineFormat(raw.substring(4), css.boldColor)}</h3>`);
      continue;
    }

    // ALL CAPS line (likely a section title) — at least 3 chars, all uppercase letters/spaces/numbers
    if (
      raw.length >= 3 &&
      raw === raw.toUpperCase() &&
      /[A-ZÀ-Ü]/.test(raw) &&
      !/^[-=─═•→]/.test(raw)
    ) {
      if (inList) { htmlParts.push("</ul>"); inList = false; }
      htmlParts.push(`<h1 class="h1${newClass}">${formatted}</h1>`);
      continue;
    }

    // Roman numeral section: "I.", "II.", "III.", "IV." etc.
    if (/^[IVXLC]+\.\s/.test(raw)) {
      if (inList) { htmlParts.push("</ul>"); inList = false; }
      htmlParts.push(`<h2 class="h2${newClass}">${formatted}</h2>`);
      continue;
    }

    // Letter section: "A.", "B.", "C." etc.
    if (/^[A-Z]\.\s/.test(raw) && raw.length > 3) {
      if (inList) { htmlParts.push("</ul>"); inList = false; }
      htmlParts.push(`<h3 class="h3${newClass}">${formatted}</h3>`);
      continue;
    }

    // Numbered heading: "1.", "2.", "1.2", "1.2.3" at start — only if short-ish (heading, not a full paragraph)
    if (/^\d+(\.\d+)*\.?\s/.test(raw) && raw.length < 80) {
      if (inList) { htmlParts.push("</ul>"); inList = false; }
      const level = (raw.match(/\./g) || []).length;
      const tag = level <= 1 ? "h2" : "h3";
      htmlParts.push(`<${tag} class="${tag}${newClass}">${formatted}</${tag}>`);
      continue;
    }

    // Separator lines (---, ===, etc.)
    if (/^[-=─═]{3,}$/.test(raw.trim())) {
      if (inList) { htmlParts.push("</ul>"); inList = false; }
      htmlParts.push('<hr class="separator"/>');
      continue;
    }

    // List items: -, •, *, →, >, and indented variants
    const listMatch = raw.match(/^(\s*)([-•*→>])\s(.*)$/);
    if (listMatch) {
      const indent = listMatch[1].length;
      const marker = listMatch[2];
      const text = listMatch[3];
      if (!inList) {
        htmlParts.push("<ul>");
        inList = true;
      }
      const indentClass = indent >= 4 ? " indent-2" : indent >= 2 ? " indent-1" : "";
      const markerClass = marker === "→" ? " arrow-marker" : "";
      htmlParts.push(
        `<li class="item${indentClass}${markerClass}${newClass}">${inlineFormat(text, css.boldColor)}</li>`
      );
      continue;
    }

    // Indented sub-item without marker
    if (raw.startsWith("  ") && raw.trim().length > 0) {
      if (!inList) {
        htmlParts.push("<ul>");
        inList = true;
      }
      const indent = raw.length - raw.trimStart().length;
      const indentClass = indent >= 4 ? " indent-2" : " indent-1";
      htmlParts.push(
        `<li class="item no-marker${indentClass}${newClass}">${inlineFormat(raw.trim(), css.boldColor)}</li>`
      );
      continue;
    }

    // Regular paragraph
    if (inList) { htmlParts.push("</ul>"); inList = false; }
    htmlParts.push(`<p class="text${newClass}">${formatted}</p>`);
  }

  if (inList) htmlParts.push("</ul>");

  const notesHtml = htmlParts.join("\n");
  const newCount = content.newInfoHighlights.length;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>${content.courseTitle} — ${content.studentName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: ${css.fontFamily};
      color: ${css.textColor};
      line-height: ${css.lineHeight};
      padding: 40px 48px;
      max-width: 820px;
      margin: 0 auto;
      font-size: ${css.fontSize};
    }

    /* Headings */
    h1.h1 {
      font-size: 1.5em;
      margin: 30px 0 12px;
      color: ${css.headingColor};
      font-weight: 700;
      text-transform: ${css.headingTransform};
      ${css.headingBorder ? `border-bottom: 2px solid ${css.headingColor}; padding-bottom: 4px;` : ""}
    }

    h2.h2 {
      font-size: 1.2em;
      margin: 24px 0 8px;
      color: ${css.headingColor};
      font-weight: 600;
      text-transform: ${css.headingTransform};
      ${css.headingBorder ? `border-bottom: 1px solid ${css.headingColor}40; padding-bottom: 3px;` : ""}
    }

    h3.h3 {
      font-size: 1.05em;
      margin: 18px 0 6px;
      color: ${css.subHeadingColor};
      font-weight: 600;
    }

    /* Paragraphs */
    p.text { margin: 4px 0; }

    /* Lists */
    ul {
      margin: 2px 0;
      padding-left: 0;
      list-style: none;
    }

    li.item {
      margin: 2px 0 2px 20px;
      ${markerCSS}
    }
    ${markerBefore ? `li.item::before { ${markerBefore} }` : ""}

    li.item.indent-1 { margin-left: 40px; }
    li.item.indent-2 { margin-left: 60px; }

    li.item.no-marker { list-style: none; }
    li.item.no-marker::before { content: none; }

    li.item.arrow-marker { list-style: none; }
    li.item.arrow-marker::before { content: "→ "; margin-right: 4px; }

    /* Separators */
    hr.separator {
      border: none;
      border-top: 1px solid #d1d5db;
      margin: 16px 0;
    }

    /* Subtle indicator for new info — thin left border */
    .new-info {
      border-left: 2.5px solid ${css.newInfoBorderColor};
      padding-left: 8px;
    }

    h1.new-info, h2.new-info, h3.new-info {
      padding-left: 10px;
    }

    li.new-info {
      padding-left: 6px;
    }

    /* Footer — minimal */
    .footer {
      margin-top: 48px;
      padding-top: 14px;
      border-top: 1px solid #e2e8f0;
      font-size: 10px;
      color: #a1a1aa;
      display: flex;
      justify-content: space-between;
    }

    @media print {
      body { padding: 24px; }
      .new-info { border-left-color: #ccc; }
      .footer { position: fixed; bottom: 16px; left: 24px; right: 24px; }
    }
  </style>
</head>
<body>
  ${notesHtml}

  <div class="footer">
    <span>Notes enrichies — NotesMerge${newCount > 0 ? ` · ${newCount} nouvelles informations` : ""}</span>
    <span>${new Date().toLocaleDateString("fr-FR")}</span>
  </div>
</body>
</html>`;
}
