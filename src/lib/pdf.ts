// Server-side PDF generation using simple HTML-to-PDF approach
// We'll generate HTML and use the browser's print functionality for MVP

export interface PdfContent {
  studentName: string;
  courseTitle: string;
  mergedNotes: string;
  completenessScore: number;
  newInfoHighlights: string[];
  originalScore: number;
}

export function generateMergedNotesHTML(content: PdfContent): string {
  const notesHtml = content.mergedNotes
    .split("\n")
    .map((line) => {
      if (line.startsWith("[NOUVEAU]")) {
        return `<p class="new-info">${line.replace("[NOUVEAU]", "✨ ")}</p>`;
      }
      if (line.startsWith("# ")) {
        return `<h1>${line.substring(2)}</h1>`;
      }
      if (line.startsWith("## ")) {
        return `<h2>${line.substring(3)}</h2>`;
      }
      if (line.startsWith("### ")) {
        return `<h3>${line.substring(4)}</h3>`;
      }
      if (line.startsWith("- ") || line.startsWith("• ")) {
        return `<li>${line.substring(2)}</li>`;
      }
      if (line.trim() === "") {
        return "<br/>";
      }
      return `<p>${line}</p>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Notes fusionnées - ${content.studentName}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'Inter', sans-serif;
      color: #1a1a2e;
      line-height: 1.6;
      padding: 40px;
      max-width: 800px;
      margin: 0 auto;
    }

    .header {
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      color: white;
      padding: 30px;
      border-radius: 16px;
      margin-bottom: 30px;
    }

    .header h1 { font-size: 24px; margin-bottom: 8px; }
    .header .subtitle { opacity: 0.9; font-size: 14px; }

    .score-bar {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-top: 16px;
      background: rgba(255,255,255,0.15);
      padding: 12px 16px;
      border-radius: 8px;
    }

    .score-label { font-size: 13px; opacity: 0.9; }
    .score-value { font-size: 28px; font-weight: 700; }

    .progress-track {
      flex: 1;
      height: 8px;
      background: rgba(255,255,255,0.2);
      border-radius: 4px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: #34d399;
      border-radius: 4px;
      transition: width 0.3s;
    }

    .improvement {
      font-size: 12px;
      background: #34d399;
      color: #1a1a2e;
      padding: 2px 8px;
      border-radius: 12px;
      font-weight: 600;
    }

    .new-info-summary {
      background: #fef3c7;
      border-left: 4px solid #f59e0b;
      padding: 16px 20px;
      border-radius: 0 8px 8px 0;
      margin-bottom: 24px;
    }

    .new-info-summary h3 {
      color: #92400e;
      font-size: 14px;
      margin-bottom: 8px;
    }

    .new-info-summary ul { list-style: none; }
    .new-info-summary li {
      padding: 4px 0;
      font-size: 13px;
      color: #78350f;
    }
    .new-info-summary li::before { content: "✨ "; }

    .notes-content {
      background: white;
      padding: 24px;
      border-radius: 12px;
      border: 1px solid #e5e7eb;
    }

    .notes-content h1 { font-size: 20px; margin: 20px 0 12px; color: #6366f1; }
    .notes-content h2 { font-size: 17px; margin: 16px 0 8px; color: #4f46e5; }
    .notes-content h3 { font-size: 15px; margin: 12px 0 6px; color: #6366f1; }
    .notes-content p { margin: 4px 0; font-size: 14px; }
    .notes-content li { margin: 2px 0 2px 20px; font-size: 14px; }

    .new-info {
      background: linear-gradient(90deg, #fef9c3, transparent);
      padding: 4px 8px;
      border-radius: 4px;
      border-left: 3px solid #f59e0b;
    }

    .footer {
      margin-top: 30px;
      text-align: center;
      font-size: 12px;
      color: #9ca3af;
    }

    @media print {
      body { padding: 20px; }
      .header { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>📝 Notes fusionnées</h1>
    <div class="subtitle">${content.courseTitle} — ${content.studentName}</div>
    <div class="score-bar">
      <div>
        <div class="score-label">Complétude</div>
        <div class="score-value">${Math.round(content.completenessScore)}%</div>
      </div>
      <div class="progress-track">
        <div class="progress-fill" style="width: ${content.completenessScore}%"></div>
      </div>
      <div class="improvement">${content.originalScore}% → ${Math.round(content.completenessScore)}%</div>
    </div>
  </div>

  ${
    content.newInfoHighlights.length > 0
      ? `<div class="new-info-summary">
    <h3>Nouvelles informations ajoutées (${content.newInfoHighlights.length})</h3>
    <ul>
      ${content.newInfoHighlights.map((h) => `<li>${h}</li>`).join("\n")}
    </ul>
  </div>`
      : ""
  }

  <div class="notes-content">
    ${notesHtml}
  </div>

  <div class="footer">
    Généré par NotesMerge AI — ${new Date().toLocaleDateString("fr-FR")}
  </div>
</body>
</html>`;
}
