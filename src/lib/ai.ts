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
  // -- Écriture --
  tone: string; // "formel", "décontracté", "académique", "conversationnel"
  vocabulary: string; // "simple", "intermédiaire", "avancé", "technique/jargon spécialisé"
  sentenceStyle: string; // "Phrases courtes et percutantes" / "Longues phrases complexes avec subordonnées"
  voice: string; // "Première personne (je)", "Impersonnel (on)", "Passif"
  abbreviations: string; // "Usage intensif (bcp, pr, ds, cf.)" / "Mots complets" / liste des abréviations récurrentes
  connectors: string[]; // Mots de transition typiques: ["donc", "par conséquent", "→", "en effet"]

  // -- Format & Mise en page --
  format: string; // "bullet_points", "paragraphs", "mixed", "outline", "cornell", "tableau", "mind_map"
  headingStyle: string; // "## Style Markdown" / "1.2.3 numérotation hiérarchique" / "TOUT EN MAJUSCULES" / "Souligné"
  headingHierarchy: string; // "3 niveaux: titre principal > sous-titre > sous-sous-titre" / "1 seul niveau"
  listMarkers: string; // "- tirets" / "• puces rondes" / "→ flèches" / "* étoiles" / "1. numérotés"
  indentation: string; // "2 niveaux d'imbrication" / "Plat, pas d'indentation" / "Profond, 3-4 niveaux"
  spacing: string; // "Ligne vide entre chaque section" / "Compact, pas d'espacement" / "Double espacement"
  separators: string; // "---" / "lignes vides" / "═══" / "aucun" / "traits de séparation"
  emphasisPatterns: string; // "**gras** pour les termes clés, _italique_ pour définitions" / "MAJUSCULES pour l'important"
  paragraphLength: string; // "Court: 1-2 phrases" / "Moyen: 3-4 phrases" / "Long: 5+ phrases"

  // -- Style visuel --
  colors: string; // "Titres en bleu, surlignage jaune, rouge pour l'important" / "Monochrome"
  highlighting: string; // "Surlignage fréquent pour les définitions" / "Minimal" / "Aucun"
  emojiUsage: string; // "Fréquent (📌, ⚠️, ✅, 💡)" / "Rare" / "Aucun" + exemples
  specialSymbols: string; // "→ pour implications, ⚡ pour important, ★ pour examen, ⚠️ pour attention"
  decorativeElements: string; // "Encadrés pour les définitions, lignes pour séparer" / "Aucun"

  // -- Typographie --
  fontPreference: string; // "Sans-serif propre" / "Serif académique" / "Manuscrit"
  sizeVariations: string; // "Grands titres, texte moyen, petites annotations" / "Taille uniforme"
  capitalization: string; // "TITRES EN MAJUSCULES" / "Casse De Titre" / "tout en minuscules"
  boldItalicUsage: string; // "Gras pour concepts clés, italique pour exemples" / "Peu de mise en forme"

  // -- Organisation du contenu --
  structure: string; // Description globale de l'organisation
  definitionStyle: string; // "Terme : définition" / "Terme = définition" / "Terme en gras suivi d'explication"
  exampleUsage: string; // "Fréquent avec préfixe 'Ex:'" / "Rare" / "Exemples en encadré"
  summaryStyle: string; // "Résumé en fin de section" / "TL;DR en début" / "Pas de résumé"
  detailLevel: string; // "concis", "modéré", "détaillé", "exhaustif"
  mnemonics: string; // "Utilise des moyens mnémotechniques" / "Aucun"
  crossReferences: string; // "Renvois fréquents (cf. chapitre 2)" / "Aucun renvoi"

  // -- Patterns caractéristiques --
  examples: string[]; // 5+ extraits représentatifs montrant le style
  recurringPatterns: string[]; // "Commence chaque section par une question", "Utilise des analogies"
  uniqueTraits: string[]; // Traits distinctifs uniques à cet étudiant

  // -- Langue --
  language: string; // "fr", "en", "fr+en mélangé"

  // -- Description synthétique --
  overallDescription: string; // Paragraphe détaillé décrivant le style unique de cet étudiant
}

export async function analyzeWritingStyle(
  notes: string
): Promise<StyleProfile> {
  const response = await callWithRetry({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: `Tu es un expert en analyse de styles d'écriture et de prise de notes. Analyse les notes suivantes avec une EXTRÊME attention aux détails pour créer un profil de style exhaustif qui permettrait de reproduire FIDÈLEMENT le style de cet étudiant.

Notes à analyser:
"""
${notes}
"""

Analyse CHAQUE aspect du style: comment l'étudiant organise ses idées, quels symboles il utilise, comment il met en forme, quel ton il adopte, ses tics d'écriture, ses abréviations, ses connecteurs logiques préférés, etc.

Retourne UNIQUEMENT un objet JSON (pas de texte avant ou après) avec cette structure:
{
  "tone": "description précise du ton (formel/décontracté/académique/conversationnel + nuances)",
  "vocabulary": "niveau et type de vocabulaire (simple/technique/jargon + exemples de mots caractéristiques)",
  "sentenceStyle": "description de la construction des phrases (longueur, complexité, style)",
  "voice": "voix narrative utilisée (je/on/nous/impersonnel/passif)",
  "abbreviations": "liste des abréviations utilisées et leur fréquence, ex: 'bcp=beaucoup, pr=pour, ds=dans'",
  "connectors": ["liste", "des", "connecteurs", "logiques", "favoris"],

  "format": "type principal de formatage (bullet_points/paragraphs/mixed/outline/cornell/tableau)",
  "headingStyle": "comment les titres sont formatés (markdown ##, numérotation 1.2.3, majuscules, etc.)",
  "headingHierarchy": "nombre de niveaux et description de la hiérarchie utilisée",
  "listMarkers": "marqueurs de liste utilisés (tirets -, puces •, flèches →, numéros, etc.)",
  "indentation": "style et profondeur d'indentation (plat/2 niveaux/profond)",
  "spacing": "gestion de l'espacement entre sections et paragraphes",
  "separators": "séparateurs visuels utilisés entre sections (---, lignes vides, etc.)",
  "emphasisPatterns": "comment l'étudiant met en valeur les infos importantes (gras, majuscules, souligné, etc.)",
  "paragraphLength": "longueur typique des paragraphes ou des points",

  "colors": "couleurs détectées ou inférées (titres, surlignage, annotations) ou 'Monochrome/Non détecté'",
  "highlighting": "usage du surlignage et pour quel type de contenu",
  "emojiUsage": "utilisation d'emojis avec exemples précis, ou 'Aucun'",
  "specialSymbols": "symboles spéciaux utilisés et leur signification (→, ⚡, ★, ⚠️, etc.)",
  "decorativeElements": "éléments décoratifs (encadrés, bordures, séparateurs graphiques)",

  "fontPreference": "préférence de police détectée ou inférée du style",
  "sizeVariations": "variations de taille entre titres, texte, annotations",
  "capitalization": "patterns de capitalisation (TITRES EN MAJ, Casse De Titre, minuscules)",
  "boldItalicUsage": "utilisation du gras et de l'italique et pour quel type de contenu",

  "structure": "description détaillée de l'organisation globale du document",
  "definitionStyle": "comment les définitions sont présentées (Terme: def / Terme = def / gras + explication)",
  "exampleUsage": "comment les exemples sont introduits et présentés",
  "summaryStyle": "présence et style des résumés (fin de section, début, aucun)",
  "detailLevel": "niveau de détail global (concis/modéré/détaillé/exhaustif)",
  "mnemonics": "utilisation de moyens mnémotechniques ou d'astuces de mémorisation",
  "crossReferences": "renvois entre sections ou à d'autres documents",

  "examples": ["5 à 8 extraits textuels EXACTS tirés des notes qui illustrent le mieux le style unique de cet étudiant"],
  "recurringPatterns": ["patterns récurrents observés dans la prise de notes"],
  "uniqueTraits": ["traits distinctifs et uniques à cet étudiant qui le différencient"],

  "language": "code langue détectée (fr, en, etc.)",
  "overallDescription": "Paragraphe de synthèse détaillé (5-8 phrases) décrivant le style unique de cet étudiant, ses forces, ses particularités, et ce qui rend ses notes reconnaissables entre mille."
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

export async function analyzeVisualStyle(
  fileBase64: string,
  mimeType: string
): Promise<Partial<StyleProfile>> {
  const mediaType = mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp";

  const response = await callWithRetry({
    model: "claude-sonnet-4-20250514",
    max_tokens: 3000,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType,
              data: fileBase64,
            },
          },
          {
            type: "text",
            text: `Tu es un expert en analyse visuelle de documents. Analyse cette image de notes d'étudiant et identifie TOUS les éléments visuels et de mise en page avec une précision maximale.

Concentre-toi sur ce qui est VISIBLE dans l'image:
- Couleurs utilisées (texte, titres, surlignage, annotations, fond)
- Police(s) d'écriture (serif, sans-serif, manuscrite, taille relative)
- Tailles de police (grandes pour titres, moyennes pour texte, petites pour annotations)
- Mise en page (marges, colonnes, espacement, alignement)
- Éléments décoratifs (encadrés, bordures, flèches, dessins, schémas)
- Style de surlignage (couleur, fréquence, ce qui est surligné)
- Utilisation du gras, italique, souligné
- Symboles et marqueurs visuels (puces, numéros, icônes, étoiles)
- Organisation spatiale (comment l'espace est utilisé sur la page)

Retourne UNIQUEMENT un objet JSON (pas de texte avant ou après):
{
  "colors": "description précise de TOUTES les couleurs observées et leur usage (ex: 'Titres en bleu foncé (#2563EB), texte noir, définitions surlignées en jaune, annotations en rouge dans la marge')",
  "highlighting": "description du surlignage observé (couleurs, fréquence, ce qui est surligné)",
  "fontPreference": "police(s) observée(s) avec description (ex: 'Sans-serif type Arial pour le texte, serif pour les titres')",
  "sizeVariations": "variations de taille précises (ex: 'Titres ~18pt, sous-titres ~14pt, texte ~11pt, annotations ~9pt')",
  "boldItalicUsage": "utilisation observée du gras et italique (ex: 'Gras pour tous les termes clés, italique pour les citations')",
  "decorativeElements": "éléments décoratifs observés (encadrés, bordures, flèches, schémas, dessins)",
  "headingStyle": "style visuel exact des titres (couleur, taille, gras, souligné, etc.)",
  "spacing": "espacement visuel observé entre les éléments",
  "specialSymbols": "symboles visuels observés et leur contexte d'utilisation",
  "emojiUsage": "emojis ou icônes visibles et leur usage",
  "capitalization": "patterns de capitalisation observés visuellement",
  "overallVisualDescription": "description globale de l'apparence visuelle du document en 3-5 phrases"
}`,
          },
        ],
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return {};
  }
  return JSON.parse(jsonMatch[0]);
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
  const sp = input.targetStudent.styleProfile;
  const styleDesc = `
=== PROFIL DE STYLE COMPLET DE ${input.targetStudent.name} ===

📝 ÉCRITURE:
- Ton: ${sp.tone}
- Vocabulaire: ${sp.vocabulary}
- Style de phrases: ${sp.sentenceStyle}
- Voix narrative: ${sp.voice}
- Abréviations: ${sp.abbreviations}
- Connecteurs favoris: ${(sp.connectors || []).join(", ")}

📐 FORMAT & MISE EN PAGE:
- Format principal: ${sp.format}
- Style de titres: ${sp.headingStyle}
- Hiérarchie: ${sp.headingHierarchy}
- Marqueurs de liste: ${sp.listMarkers}
- Indentation: ${sp.indentation}
- Espacement: ${sp.spacing}
- Séparateurs: ${sp.separators}
- Mise en valeur: ${sp.emphasisPatterns}
- Longueur paragraphes: ${sp.paragraphLength}

🎨 STYLE VISUEL:
- Couleurs: ${sp.colors}
- Surlignage: ${sp.highlighting}
- Emojis: ${sp.emojiUsage}
- Symboles spéciaux: ${sp.specialSymbols}
- Éléments décoratifs: ${sp.decorativeElements}

🔤 TYPOGRAPHIE:
- Police préférée: ${sp.fontPreference}
- Variations de taille: ${sp.sizeVariations}
- Capitalisation: ${sp.capitalization}
- Gras/Italique: ${sp.boldItalicUsage}

📚 ORGANISATION:
- Structure globale: ${sp.structure}
- Style de définitions: ${sp.definitionStyle}
- Utilisation d'exemples: ${sp.exampleUsage}
- Résumés: ${sp.summaryStyle}
- Niveau de détail: ${sp.detailLevel}
- Mnémoniques: ${sp.mnemonics}
- Renvois: ${sp.crossReferences}

🔑 PATTERNS & TRAITS UNIQUES:
- Patterns récurrents: ${(sp.recurringPatterns || []).join("; ")}
- Traits distinctifs: ${(sp.uniqueTraits || []).join("; ")}

✍️ EXEMPLES REPRÉSENTATIFS DU STYLE:
${(sp.examples || []).map((ex, i) => `  ${i + 1}. "${ex}"`).join("\n")}

📋 DESCRIPTION SYNTHÉTIQUE:
${sp.overallDescription}

Langue: ${sp.language}
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

INSTRUCTIONS CRITIQUES — Respecte CHAQUE détail du style:
1. Garde les notes originales de l'étudiant comme BASE INTOUCHABLE
2. Intègre les informations manquantes en les rédigeant EXACTEMENT dans son style
3. Marque les nouvelles informations avec [NOUVEAU] au début de chaque ajout
4. REPRODUIS FIDÈLEMENT:
   - Ses marqueurs de liste exacts (${sp.listMarkers})
   - Son style de titres (${sp.headingStyle})
   - Ses abréviations habituelles (${sp.abbreviations})
   - Son ton et sa voix narrative (${sp.tone}, ${sp.voice})
   - Ses connecteurs logiques favoris (${(sp.connectors || []).join(", ")})
   - Ses symboles et emojis habituels (${sp.specialSymbols}, ${sp.emojiUsage})
   - Sa mise en valeur (${sp.emphasisPatterns})
   - Son style de définitions (${sp.definitionStyle})
   - Son niveau de détail (${sp.detailLevel})
5. Les nouvelles sections doivent être INDISTINGUABLES du style original
6. Si l'étudiant utilise des abréviations, utilise-les aussi dans les ajouts
7. Respecte l'espacement et l'indentation (${sp.spacing}, ${sp.indentation})

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
