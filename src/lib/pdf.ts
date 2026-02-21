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
};

function findColorInText(text: string, context: string): string | null {
  const lower = text.toLowerCase();
  // Check for hex codes first
  const hexMatch = lower.match(/#[0-9a-f]{3,6}/);
  if (hexMatch) return hexMatch[0];

  // Check for color names near the context keyword
  const contextIdx = lower.indexOf(context.toLowerCase());
  const searchZone =
    contextIdx >= 0
      ? lower.substring(Math.max(0, contextIdx - 20), contextIdx + 60)
      : lower;

  for (const [name, hex] of Object.entries(COLOR_MAP)) {
    if (searchZone.includes(name)) return hex;
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
  };

  if (!profile) return defaults;

  const config = { ...defaults };

  // Use explicit CSS fields if the profile has them
  if ((profile as Record<string, unknown>).cssHeadingColor)
    config.headingColor = (profile as Record<string, unknown>)
      .cssHeadingColor as string;
  if ((profile as Record<string, unknown>).cssAccentColor)
    config.accentColor = (profile as Record<string, unknown>)
      .cssAccentColor as string;
  if ((profile as Record<string, unknown>).cssTextColor)
    config.textColor = (profile as Record<string, unknown>)
      .cssTextColor as string;
  if ((profile as Record<string, unknown>).cssFontFamily)
    config.fontFamily = (profile as Record<string, unknown>)
      .cssFontFamily as string;
  if ((profile as Record<string, unknown>).cssNewInfoColor)
    config.newInfoBorderColor = (profile as Record<string, unknown>)
      .cssNewInfoColor as string;

  // Parse font preference
  if (profile.fontPreference) {
    const fp = profile.fontPreference.toLowerCase();
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

  // Parse colors from text description
  if (profile.colors) {
    const headingColor = findColorInText(profile.colors, "titre");
    if (headingColor) {
      config.headingColor = headingColor;
      config.subHeadingColor = headingColor;
    }
    const accentColor =
      findColorInText(profile.colors, "important") ||
      findColorInText(profile.colors, "surlign") ||
      findColorInText(profile.colors, "clé");
    if (accentColor) {
      config.accentColor = accentColor;
    }
  }

  // Use accent color for new info border (lighter version)
  config.newInfoBorderColor = config.accentColor + "60"; // 37% opacity

  return config;
}

export function generateMergedNotesHTML(content: PdfContent): string {
  const css = extractCSS(content.styleProfile);

  const notesHtml = content.mergedNotes
    .split("\n")
    .map((line) => {
      const isNew = line.startsWith("[NOUVEAU]");
      const cleanLine = isNew ? line.replace("[NOUVEAU]", "").trim() : line;
      const wrapClass = isNew ? ' class="new-info"' : "";

      if (cleanLine.startsWith("# ")) {
        return `<h1${wrapClass}>${cleanLine.substring(2)}</h1>`;
      }
      if (cleanLine.startsWith("## ")) {
        return `<h2${wrapClass}>${cleanLine.substring(3)}</h2>`;
      }
      if (cleanLine.startsWith("### ")) {
        return `<h3${wrapClass}>${cleanLine.substring(4)}</h3>`;
      }
      if (cleanLine.startsWith("- ") || cleanLine.startsWith("• ")) {
        return `<li${wrapClass}>${cleanLine.substring(2)}</li>`;
      }
      if (cleanLine.startsWith("→ ")) {
        return `<li class="arrow${isNew ? " new-info" : ""}">${cleanLine.substring(2)}</li>`;
      }
      if (cleanLine.trim() === "") {
        return "<br/>";
      }
      return `<p${wrapClass}>${cleanLine}</p>`;
    })
    .join("\n");

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
      padding: 40px;
      max-width: 800px;
      margin: 0 auto;
      font-size: ${css.fontSize};
    }

    h1 {
      font-size: 1.45em;
      margin: 28px 0 12px;
      color: ${css.headingColor};
      font-weight: 700;
    }

    h2 {
      font-size: 1.2em;
      margin: 22px 0 8px;
      color: ${css.headingColor};
      font-weight: 600;
    }

    h3 {
      font-size: 1.05em;
      margin: 16px 0 6px;
      color: ${css.subHeadingColor};
      font-weight: 600;
    }

    p { margin: 3px 0; }

    li {
      margin: 2px 0 2px 20px;
      list-style-type: disc;
    }

    li.arrow {
      list-style-type: none;
      margin-left: 12px;
    }
    li.arrow::before {
      content: "→ ";
    }

    /* Subtle indicator for new info — just a thin left border */
    .new-info {
      border-left: 2.5px solid ${css.accentColor};
      padding-left: 8px;
      margin-left: -10px;
    }

    h1.new-info, h2.new-info, h3.new-info {
      margin-left: 0;
      padding-left: 10px;
    }

    li.new-info {
      margin-left: 20px;
      padding-left: 6px;
    }

    .footer {
      margin-top: 48px;
      padding-top: 16px;
      border-top: 1px solid #e2e8f0;
      font-size: 11px;
      color: #94a3b8;
      display: flex;
      justify-content: space-between;
    }

    @media print {
      body { padding: 20px; }
      .footer { position: fixed; bottom: 20px; left: 20px; right: 20px; }
    }
  </style>
</head>
<body>
  ${notesHtml}

  <div class="footer">
    <span>Notes enrichies par NotesMerge${newCount > 0 ? ` · ${newCount} nouvelles informations` : ""}</span>
    <span>${new Date().toLocaleDateString("fr-FR")}</span>
  </div>
</body>
</html>`;
}
