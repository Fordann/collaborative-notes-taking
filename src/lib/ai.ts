import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "",
});

async function callWithRetry(
  params: Anthropic.Messages.MessageCreateParamsNonStreaming,
  maxRetries = 4
): Promise<Anthropic.Messages.Message> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await anthropic.messages.create(params);
    } catch (err: unknown) {
      const isRateLimit =
        err instanceof Anthropic.RateLimitError ||
        (err instanceof Error && "status" in err && (err as { status: number }).status === 429);
      if (!isRateLimit || attempt === maxRetries) throw err;
      const delay = Math.pow(2, attempt + 1) * 1000; // 2s, 4s, 8s, 16s
      console.warn(`Rate limited, retrying in ${delay / 1000}s (attempt ${attempt + 1}/${maxRetries})...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("Unreachable");
}

export interface StyleProfile {
  format: "bullet_points" | "paragraphs" | "mixed" | "outline";
  detailLevel: "concise" | "moderate" | "detailed";
  vocabulary: "simple" | "intermediate" | "advanced";
  structure: string;
  tone: "formal" | "casual" | "academic";
  examples: string[];
  language: string;
}

export async function analyzeWritingStyle(
  notes: string
): Promise<StyleProfile> {
  const response = await callWithRetry({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `Analyse le style de prise de notes suivant et retourne un profil JSON détaillé.

Notes à analyser:
"""
${notes}
"""

Retourne UNIQUEMENT un objet JSON avec cette structure exacte (pas de texte avant ou après):
{
  "format": "bullet_points" | "paragraphs" | "mixed" | "outline",
  "detailLevel": "concise" | "moderate" | "detailed",
  "vocabulary": "simple" | "intermediate" | "advanced",
  "structure": "description de la structure utilisée (titres, sous-titres, numérotation, etc.)",
  "tone": "formal" | "casual" | "academic",
  "examples": ["3 phrases/fragments typiques du style de l'étudiant"],
  "language": "fr" ou "en" selon la langue détectée
}`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Failed to parse style profile from AI response");
  }
  return JSON.parse(jsonMatch[0]) as StyleProfile;
}

export interface MergeInput {
  studentNotes: { studentName: string; content: string }[];
  targetStudent: { name: string; styleProfile: StyleProfile; originalNotes: string };
}

export interface MergeOutput {
  mergedContent: string;
  newInfoHighlights: string[];
  completenessScore: number;
}

export async function mergeNotesForStudent(
  input: MergeInput,
  onProgress?: (step: string, progress: number) => void
): Promise<MergeOutput> {
  onProgress?.("Analyse des notes du groupe...", 10);

  // Step 1: Identify all unique information across all notes
  const allNotesText = input.studentNotes
    .map((n) => `=== Notes de ${n.studentName} ===\n${n.content}`)
    .join("\n\n");

  onProgress?.("Identification des informations manquantes...", 30);

  // Step 2: Find what target student is missing
  const gapAnalysis = await callWithRetry({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: `Tu es un assistant qui aide les étudiants à fusionner leurs notes de cours.

Voici les notes de tous les étudiants du groupe:
${allNotesText}

Voici les notes de l'étudiant cible (${input.targetStudent.name}):
"""
${input.targetStudent.originalNotes}
"""

Analyse et retourne un JSON avec:
1. "missingTopics": liste des sujets/informations présents dans les notes des autres mais absents des notes de ${input.targetStudent.name}
2. "completenessScore": pourcentage de couverture des notes de ${input.targetStudent.name} par rapport à l'ensemble (0-100)
3. "allTopics": nombre total de sujets/concepts identifiés dans l'ensemble des notes

Retourne UNIQUEMENT le JSON.`,
      },
    ],
  });

  const gapText =
    gapAnalysis.content[0].type === "text" ? gapAnalysis.content[0].text : "";
  const gapJson = JSON.parse(gapText.match(/\{[\s\S]*\}/)?.[0] || "{}");

  onProgress?.("Fusion intelligente en cours...", 50);

  // Step 3: Generate merged notes in the student's style
  const styleDesc = `
Format: ${input.targetStudent.styleProfile.format}
Niveau de détail: ${input.targetStudent.styleProfile.detailLevel}
Vocabulaire: ${input.targetStudent.styleProfile.vocabulary}
Structure: ${input.targetStudent.styleProfile.structure}
Ton: ${input.targetStudent.styleProfile.tone}
Exemples de son style: ${input.targetStudent.styleProfile.examples.join(" | ")}
Langue: ${input.targetStudent.styleProfile.language}
  `.trim();

  onProgress?.("Rédaction dans ton style personnel...", 70);

  const mergeResponse = await callWithRetry({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8000,
    messages: [
      {
        role: "user",
        content: `Tu es un assistant spécialisé dans la fusion de notes étudiantes.

OBJECTIF: Créer une version enrichie des notes de ${input.targetStudent.name} en intégrant les informations manquantes des autres étudiants, tout en respectant EXACTEMENT son style de prise de notes.

STYLE DE L'ÉTUDIANT:
${styleDesc}

NOTES ORIGINALES DE ${input.targetStudent.name}:
"""
${input.targetStudent.originalNotes}
"""

TOUTES LES NOTES DU GROUPE:
${allNotesText}

INFORMATIONS MANQUANTES IDENTIFIÉES:
${JSON.stringify(gapJson.missingTopics || [])}

INSTRUCTIONS:
1. Garde les notes originales de l'étudiant comme base
2. Intègre les informations manquantes en respectant son style
3. Marque les nouvelles informations ajoutées avec [NOUVEAU] au début de chaque section ajoutée
4. Respecte le format (${input.targetStudent.styleProfile.format}), le vocabulaire (${input.targetStudent.styleProfile.vocabulary}), et le ton (${input.targetStudent.styleProfile.tone})
5. Maintiens la structure et l'organisation typiques de cet étudiant

Retourne UNIQUEMENT les notes fusionnées, rien d'autre.`,
      },
    ],
  });

  onProgress?.("Finalisation...", 90);

  const mergedContent =
    mergeResponse.content[0].type === "text"
      ? mergeResponse.content[0].text
      : "";

  // Extract highlighted new info
  const newInfoRegex = /\[NOUVEAU\][^\n]*/g;
  const newInfoHighlights = mergedContent.match(newInfoRegex) || [];

  onProgress?.("Terminé!", 100);

  return {
    mergedContent,
    newInfoHighlights: newInfoHighlights.map((h) =>
      h.replace("[NOUVEAU]", "").trim()
    ),
    completenessScore: gapJson.completenessScore || 0,
  };
}
