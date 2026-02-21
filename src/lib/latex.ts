// Server-side LaTeX PDF generation — style-aware, identical layout to HTML version
// Generates a .tex file and compiles it with pdflatex

import { execSync } from "child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
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

interface LatexConfig {
  fontFamily: string; // LaTeX font package
  textColor: string; // RGB triplet "r,g,b" (0-1)
  headingColor: string;
  subHeadingColor: string;
  accentColor: string;
  newInfoBorderColor: string;
  fontSize: string; // "11pt", "12pt", etc.
  lineSpread: string; // \linespread factor
  headingTransform: "uppercase" | "none" | "capitalize";
  headingUnderline: boolean;
  listMarker: string; // LaTeX item marker
  boldColor: string; // Color name for bold terms, or empty
}

const COLOR_MAP: Record<string, [number, number, number]> = {
  rouge: [0.86, 0.15, 0.15],
  red: [0.86, 0.15, 0.15],
  bleu: [0.15, 0.39, 0.92],
  blue: [0.15, 0.39, 0.92],
  vert: [0.02, 0.59, 0.41],
  green: [0.02, 0.59, 0.41],
  violet: [0.49, 0.23, 0.93],
  purple: [0.49, 0.23, 0.93],
  orange: [0.92, 0.35, 0.05],
  rose: [0.88, 0.11, 0.28],
  pink: [0.88, 0.11, 0.28],
  noir: [0.1, 0.1, 0.18],
  black: [0.1, 0.1, 0.18],
  gris: [0.42, 0.44, 0.5],
  gray: [0.42, 0.44, 0.5],
  marron: [0.57, 0.25, 0.05],
  brown: [0.57, 0.25, 0.05],
  jaune: [0.79, 0.54, 0.02],
  yellow: [0.79, 0.54, 0.02],
  "bleu foncé": [0.12, 0.25, 0.69],
  "bleu clair": [0.23, 0.51, 0.96],
  "rouge foncé": [0.6, 0.11, 0.11],
  "vert foncé": [0.09, 0.39, 0.2],
};

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16) / 255;
    const g = parseInt(clean[1] + clean[1], 16) / 255;
    const b = parseInt(clean[2] + clean[2], 16) / 255;
    return [r, g, b];
  }
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  return [r, g, b];
}

function rgbStr(rgb: [number, number, number]): string {
  return `${rgb[0].toFixed(3)},${rgb[1].toFixed(3)},${rgb[2].toFixed(3)}`;
}

function findColorInText(
  text: string,
  context: string
): [number, number, number] | null {
  const lower = text.toLowerCase();
  const contextIdx = lower.indexOf(context.toLowerCase());
  const zone =
    contextIdx >= 0
      ? lower.substring(Math.max(0, contextIdx - 30), contextIdx + 80)
      : lower;

  const hexMatch = zone.match(/#[0-9a-f]{3,6}/);
  if (hexMatch) return hexToRgb(hexMatch[0]);

  const sortedColors = Object.entries(COLOR_MAP).sort(
    (a, b) => b[0].length - a[0].length
  );
  for (const [name, rgb] of sortedColors) {
    if (zone.includes(name)) return rgb;
  }
  return null;
}

function extractLatexConfig(
  profile?: Partial<StyleProfile> | null
): LatexConfig {
  const defaults: LatexConfig = {
    fontFamily: "\\usepackage{helvet}\\renewcommand{\\familydefault}{\\sfdefault}",
    textColor: rgbStr([0.12, 0.16, 0.23]),
    headingColor: rgbStr([0.06, 0.09, 0.16]),
    subHeadingColor: rgbStr([0.2, 0.25, 0.33]),
    accentColor: rgbStr([0.39, 0.4, 0.95]),
    newInfoBorderColor: rgbStr([0.65, 0.71, 0.99]),
    fontSize: "11pt",
    lineSpread: "1.25",
    headingTransform: "none",
    headingUnderline: false,
    listMarker: "$\\bullet$",
    boldColor: "",
  };

  if (!profile) return defaults;

  const config = { ...defaults };
  const p = profile as Record<string, unknown>;

  // CSS-ready colors
  if (p.cssHeadingColor) {
    const rgb = hexToRgb(p.cssHeadingColor as string);
    config.headingColor = rgbStr(rgb);
    config.subHeadingColor = rgbStr(rgb);
  }
  if (p.cssAccentColor) {
    config.accentColor = rgbStr(hexToRgb(p.cssAccentColor as string));
  }
  if (p.cssTextColor) {
    config.textColor = rgbStr(hexToRgb(p.cssTextColor as string));
  }
  if (p.cssNewInfoColor) {
    config.newInfoBorderColor = rgbStr(hexToRgb(p.cssNewInfoColor as string));
  }

  // Font preference
  if (profile.fontPreference) {
    const fp = profile.fontPreference.toLowerCase();
    if (!p.cssFontFamily) {
      if (fp.includes("serif") && !fp.includes("sans")) {
        config.fontFamily = "\\usepackage{charter}";
      } else if (fp.includes("mono") || fp.includes("courier")) {
        config.fontFamily =
          "\\usepackage{courier}\\renewcommand{\\familydefault}{\\ttdefault}";
      } else if (fp.includes("calibri") || fp.includes("arial") || fp.includes("helvetica")) {
        config.fontFamily =
          "\\usepackage{helvet}\\renewcommand{\\familydefault}{\\sfdefault}";
      }
    }
  }

  // Capitalization
  if (profile.capitalization) {
    const cap = profile.capitalization.toLowerCase();
    if (cap.includes("majuscule") || cap.includes("uppercase")) {
      config.headingTransform = "uppercase";
    } else if (cap.includes("titre") || cap.includes("title case")) {
      config.headingTransform = "capitalize";
    }
  }

  // Heading underline
  if (profile.headingStyle) {
    const hs = profile.headingStyle.toLowerCase();
    if (hs.includes("soulign") || hs.includes("underline")) {
      config.headingUnderline = true;
    }
  }

  // List markers
  if (profile.listMarkers) {
    const lm = profile.listMarkers.toLowerCase();
    if (lm.includes("tiret") || lm.includes("-")) {
      config.listMarker = "--";
    } else if (lm.includes("flèche") || lm.includes("→")) {
      config.listMarker = "$\\rightarrow$";
    } else if (lm.includes("étoile") || lm.includes("*")) {
      config.listMarker = "$\\star$";
    } else if (lm.includes("puce") || lm.includes("•")) {
      config.listMarker = "$\\bullet$";
    }
  }

  // Colors from text descriptions
  if (profile.colors) {
    if (!p.cssHeadingColor) {
      const hc = findColorInText(profile.colors, "titre");
      if (hc) {
        config.headingColor = rgbStr(hc);
        config.subHeadingColor = rgbStr(hc);
      }
    }
    if (!p.cssAccentColor) {
      const ac =
        findColorInText(profile.colors, "important") ||
        findColorInText(profile.colors, "surlign") ||
        findColorInText(profile.colors, "clé");
      if (ac) config.accentColor = rgbStr(ac);
    }
    const bc =
      findColorInText(profile.colors, "gras") ||
      findColorInText(profile.colors, "important") ||
      findColorInText(profile.colors, "clé");
    if (bc) config.boldColor = rgbStr(bc);
  }

  // Derive newInfoBorderColor from accent if not set explicitly
  if (!p.cssNewInfoColor) {
    config.newInfoBorderColor = config.accentColor;
  }

  return config;
}

/** Escape special LaTeX characters */
function texEscape(text: string): string {
  return text
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/&/g, "\\&")
    .replace(/%/g, "\\%")
    .replace(/\$/g, "\\$")
    .replace(/#/g, "\\#")
    .replace(/_/g, "\\_")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}");
}

/** Process inline markdown formatting to LaTeX */
function inlineFormat(text: string, boldColor: string): string {
  let result = texEscape(text);

  // Bold: **text** or __text__
  if (boldColor) {
    result = result.replace(
      /\*\*(.+?)\*\*/g,
      `{\\color{boldcolor}\\textbf{$1}}`
    );
    result = result.replace(
      /\\_\\_(.+?)\\_\\_ /g,
      `{\\color{boldcolor}\\textbf{$1}}`
    );
  } else {
    result = result.replace(/\*\*(.+?)\*\*/g, "\\textbf{$1}");
    result = result.replace(/\\_\\_(.+?)\\_\\_ /g, "\\textbf{$1}");
  }

  // Italic: *text* or _text_
  result = result.replace(
    /(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g,
    "\\textit{$1}"
  );
  result = result.replace(
    /(?<!\\_)\\_(?!\\_)(.+?)(?<!\\_)\\_(?!\\_)/g,
    "\\textit{$1}"
  );

  return result;
}

function applyTransform(text: string, transform: string): string {
  if (transform === "uppercase") return `\\MakeUppercase{${text}}`;
  return text;
}

export function generateLatexSource(content: PdfContent): string {
  const cfg = extractLatexConfig(content.styleProfile);

  const lines = content.mergedNotes.split("\n");
  const bodyParts: string[] = [];
  let inItemize = false;

  const closeList = () => {
    if (inItemize) {
      bodyParts.push("\\end{itemize}");
      inItemize = false;
    }
  };

  for (const line of lines) {
    const isNew = line.startsWith("[NOUVEAU]");
    const raw = isNew ? line.replace("[NOUVEAU]", "").trim() : line;
    const formatted = inlineFormat(raw, cfg.boldColor);

    // Wrap new info with left border marker
    const wrapNew = (latex: string) => {
      if (!isNew) return latex;
      return `\\newinfo{${latex}}`;
    };

    // Empty line
    if (raw.trim() === "") {
      closeList();
      bodyParts.push("\\vspace{4pt}");
      continue;
    }

    // Markdown headings
    if (raw.startsWith("# ")) {
      closeList();
      const title = inlineFormat(raw.substring(2), cfg.boldColor);
      bodyParts.push(
        wrapNew(`\\notesectionI{${applyTransform(title, cfg.headingTransform)}}`)
      );
      continue;
    }
    if (raw.startsWith("## ")) {
      closeList();
      const title = inlineFormat(raw.substring(3), cfg.boldColor);
      bodyParts.push(
        wrapNew(
          `\\notesectionII{${applyTransform(title, cfg.headingTransform)}}`
        )
      );
      continue;
    }
    if (raw.startsWith("### ")) {
      closeList();
      const title = inlineFormat(raw.substring(4), cfg.boldColor);
      bodyParts.push(
        wrapNew(
          `\\notesectionIII{${applyTransform(title, cfg.headingTransform)}}`
        )
      );
      continue;
    }

    // ALL CAPS line (section title)
    if (
      raw.length >= 3 &&
      raw === raw.toUpperCase() &&
      /[A-ZÀ-Ü]/.test(raw) &&
      !/^[-=─═•→]/.test(raw)
    ) {
      closeList();
      bodyParts.push(wrapNew(`\\notesectionI{${formatted}}`));
      continue;
    }

    // Roman numeral section
    if (/^[IVXLC]+\.\s/.test(raw)) {
      closeList();
      bodyParts.push(wrapNew(`\\notesectionII{${formatted}}`));
      continue;
    }

    // Letter section
    if (/^[A-Z]\.\s/.test(raw) && raw.length > 3) {
      closeList();
      bodyParts.push(wrapNew(`\\notesectionIII{${formatted}}`));
      continue;
    }

    // Numbered heading
    if (/^\d+(\.\d+)*\.?\s/.test(raw) && raw.length < 80) {
      closeList();
      const level = (raw.match(/\./g) || []).length;
      const cmd = level <= 1 ? "\\notesectionII" : "\\notesectionIII";
      bodyParts.push(wrapNew(`${cmd}{${formatted}}`));
      continue;
    }

    // Separator lines
    if (/^[-=─═]{3,}$/.test(raw.trim())) {
      closeList();
      bodyParts.push("\\noteseparator");
      continue;
    }

    // List items
    const listMatch = raw.match(/^(\s*)([-•*→>])\s(.*)$/);
    if (listMatch) {
      const indent = listMatch[1].length;
      const text = listMatch[3];
      if (!inItemize) {
        bodyParts.push("\\begin{itemize}");
        inItemize = true;
      }
      const fmtText = inlineFormat(text, cfg.boldColor);
      const indentPrefix =
        indent >= 4
          ? "\\hspace{20pt}"
          : indent >= 2
            ? "\\hspace{10pt}"
            : "";
      if (isNew) {
        bodyParts.push(`  \\item ${indentPrefix}\\newinfoinline{${fmtText}}`);
      } else {
        bodyParts.push(`  \\item ${indentPrefix}${fmtText}`);
      }
      continue;
    }

    // Indented sub-item without marker
    if (raw.startsWith("  ") && raw.trim().length > 0) {
      if (!inItemize) {
        bodyParts.push("\\begin{itemize}");
        inItemize = true;
      }
      const indent = raw.length - raw.trimStart().length;
      const indentPrefix = indent >= 4 ? "\\hspace{20pt}" : "\\hspace{10pt}";
      const fmtText = inlineFormat(raw.trim(), cfg.boldColor);
      if (isNew) {
        bodyParts.push(
          `  \\item[] ${indentPrefix}\\newinfoinline{${fmtText}}`
        );
      } else {
        bodyParts.push(`  \\item[] ${indentPrefix}${fmtText}`);
      }
      continue;
    }

    // Regular paragraph
    closeList();
    if (isNew) {
      bodyParts.push(`\\newinfo{${formatted}}`);
    } else {
      bodyParts.push(`${formatted}\\par`);
    }
  }

  closeList();

  const body = bodyParts.join("\n");
  const newCount = content.newInfoHighlights.length;
  const footerRight = new Date().toLocaleDateString("fr-FR");
  const footerLeft = `Notes enrichies --- NotesMerge${newCount > 0 ? ` \\textperiodcentered{} ${newCount} nouvelles informations` : ""}`;

  const headingUnderlineRule = cfg.headingUnderline
    ? "\\par\\vspace{1pt}\\noindent\\textcolor{headingcolor}{\\rule{\\linewidth}{0.5pt}}\\vspace{2pt}"
    : "";

  const headingUnderlineRuleH1 = cfg.headingUnderline
    ? "\\par\\vspace{1pt}\\noindent\\textcolor{headingcolor}{\\rule{\\linewidth}{1pt}}\\vspace{2pt}"
    : "";

  return `\\documentclass[${cfg.fontSize},a4paper]{article}

% -- Encoding & Language --
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[french]{babel}

% -- Font --
${cfg.fontFamily}

% -- Layout --
\\usepackage[top=2.5cm, bottom=2.5cm, left=3cm, right=3cm]{geometry}
\\usepackage{parskip}
\\linespread{${cfg.lineSpread}}
\\setlength{\\parindent}{0pt}

% -- Colors --
\\usepackage{xcolor}
\\definecolor{textcolor}{rgb}{${cfg.textColor}}
\\definecolor{headingcolor}{rgb}{${cfg.headingColor}}
\\definecolor{subheadingcolor}{rgb}{${cfg.subHeadingColor}}
\\definecolor{accentcolor}{rgb}{${cfg.accentColor}}
\\definecolor{newinfocolor}{rgb}{${cfg.newInfoBorderColor}}
${cfg.boldColor ? `\\definecolor{boldcolor}{rgb}{${cfg.boldColor}}` : "\\definecolor{boldcolor}{rgb}{0,0,0}"}
\\definecolor{footergray}{rgb}{0.63,0.63,0.66}
\\definecolor{footerborder}{rgb}{0.89,0.91,0.94}

% -- Lists --
\\usepackage{enumitem}
\\setlist[itemize]{leftmargin=20pt, itemsep=1pt, parsep=0pt, topsep=2pt, label=${cfg.listMarker}}

% -- Footer --
\\usepackage{fancyhdr}
\\usepackage{lastpage}
\\pagestyle{fancy}
\\fancyhf{}
\\renewcommand{\\headrulewidth}{0pt}
\\renewcommand{\\footrulewidth}{0pt}

% -- Graphics for left border --
\\usepackage{tikz}
\\usepackage{mdframed}

% -- Base text color --
\\color{textcolor}

% -- Custom commands for headings --
\\newcommand{\\notesectionI}[1]{%
  \\vspace{12pt}%
  {\\Large\\bfseries\\color{headingcolor} #1}%
  ${headingUnderlineRuleH1}
  \\vspace{4pt}%
}

\\newcommand{\\notesectionII}[1]{%
  \\vspace{10pt}%
  {\\large\\bfseries\\color{headingcolor} #1}%
  ${headingUnderlineRule}
  \\vspace{3pt}%
}

\\newcommand{\\notesectionIII}[1]{%
  \\vspace{8pt}%
  {\\normalsize\\bfseries\\color{subheadingcolor} #1}%
  \\vspace{2pt}%
}

% -- New info indicator (left border) --
\\newmdenv[
  topline=false,
  bottomline=false,
  rightline=false,
  leftline=true,
  linewidth=2pt,
  linecolor=newinfocolor,
  innerleftmargin=8pt,
  innerrightmargin=0pt,
  innertopmargin=2pt,
  innerbottommargin=2pt,
  skipabove=2pt,
  skipbelow=2pt
]{newinfobox}

\\newcommand{\\newinfo}[1]{%
  \\begin{newinfobox}%
    #1%
  \\end{newinfobox}%
}

\\newcommand{\\newinfoinline}[1]{%
  {\\color{newinfocolor}\\vrule width 2pt\\hspace{4pt}}#1%
}

% -- Separator --
\\newcommand{\\noteseparator}{%
  \\vspace{8pt}%
  \\noindent\\textcolor{footerborder}{\\rule{\\linewidth}{0.4pt}}%
  \\vspace{8pt}%
}

\\begin{document}

${body}

\\vfill

\\noindent\\textcolor{footerborder}{\\rule{\\linewidth}{0.4pt}}

\\vspace{4pt}

{\\footnotesize\\color{footergray}
\\noindent ${footerLeft} \\hfill ${footerRight}
}

\\end{document}
`;
}

/** Compile LaTeX to PDF and return the PDF buffer */
export function compileLatexToPdf(texSource: string): Buffer {
  const tmpDir = mkdtempSync(join(tmpdir(), "notesmerge-"));
  const texFile = join(tmpDir, "notes.tex");

  writeFileSync(texFile, texSource, "utf-8");

  try {
    // Run pdflatex twice for proper references
    execSync(
      `pdflatex -interaction=nonstopmode -halt-on-error -output-directory="${tmpDir}" "${texFile}"`,
      { timeout: 30000, stdio: "pipe" }
    );
    execSync(
      `pdflatex -interaction=nonstopmode -halt-on-error -output-directory="${tmpDir}" "${texFile}"`,
      { timeout: 30000, stdio: "pipe" }
    );
  } catch (err) {
    // Try to read the log for debugging
    const logFile = join(tmpDir, "notes.log");
    let logContent = "";
    if (existsSync(logFile)) {
      logContent = readFileSync(logFile, "utf-8");
      // Extract relevant error lines
      const errorLines = logContent
        .split("\n")
        .filter((l) => l.startsWith("!") || l.includes("Error"))
        .slice(0, 10)
        .join("\n");
      console.error("LaTeX compilation errors:", errorLines);
    }
    throw new Error(
      `LaTeX compilation failed: ${err instanceof Error ? err.message : err}\n${logContent.slice(-500)}`
    );
  }

  const pdfFile = join(tmpDir, "notes.pdf");
  if (!existsSync(pdfFile)) {
    throw new Error("PDF file was not generated");
  }

  return readFileSync(pdfFile);
}
