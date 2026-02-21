/**
 * End-to-end test for the merge pipeline with mocked AI responses.
 *
 * Creates sample history notes for two students, simulates style analysis
 * and merge, then generates the output HTML so we can compare it visually
 * against the original notes.
 *
 * Run: npx tsx tests/merge-style-test.ts
 */

import { generateMergedNotesHTML, PdfContent } from "../src/lib/pdf";
import { StyleProfile } from "../src/lib/ai";
import * as fs from "fs";
import * as path from "path";

// ── Sample notes (student A — history course, structured with bold/red) ──

const studentA_originalNotes = `RÉVOLUTION FRANÇAISE (1789-1799)

I. Les causes de la Révolution

- **Crise financière** : dette massive après la guerre d'Amérique
- **Crise sociale** : inégalités entre les 3 ordres (clergé, noblesse, tiers état)
- Mauvaises récoltes de 1788 → hausse du prix du pain
- Influence des **Lumières** (Voltaire, Rousseau, Montesquieu)

II. Les événements clés

A. 1789 — L'année de rupture
  - 5 mai : ouverture des États généraux à Versailles
  - 20 juin : **Serment du Jeu de Paume**
  - 14 juillet : **Prise de la Bastille** → symbole de la fin de l'absolutisme
  - 4 août : abolition des privilèges
  - 26 août : **Déclaration des droits de l'homme et du citoyen**

B. 1791-1792 — La monarchie constitutionnelle
  - Fuite du roi à Varennes (juin 1791)
  - Guerre contre l'Autriche et la Prusse (avril 1792)
  - 10 août 1792 : prise des Tuileries → chute de la monarchie

III. La Terreur (1793-1794)

- Exécution de Louis XVI le 21 janvier 1793
- Comité de salut public dirigé par **Robespierre**
- Loi des suspects → arrestations massives
- Environ 17 000 exécutions officielles
- 9 thermidor an II (27 juillet 1794) : chute de Robespierre

IV. Bilan et héritage

- Fin de l'Ancien Régime et de la société d'ordres
- Principes de **liberté, égalité, fraternité**
- Naissance de la citoyenneté moderne
- Code civil préparé sous cette période`;

const studentB_notes = `Notes Révolution française

Causes :
- problèmes financiers, le royaume est endetté
- le peuple a faim, mauvaises récoltes
- les philosophes critiquent le roi (Rousseau, Voltaire)

Chronologie :
- 1789 : prise de la Bastille, DDHC
- 1791 : constitution, le roi essaie de fuir
- 1792 : guerre, fin de la monarchie, république
- 1793 : mort du roi, la Terreur avec Robespierre
- 1794 : fin de la Terreur
- 1799 : coup d'État de Napoléon Bonaparte

La Convention (1792-1795) :
- Girondins vs Montagnards
- Suffrage universel masculin instauré
- Calendrier républicain créé
- Abolition de l'esclavage dans les colonies (1794)

Le Directoire (1795-1799) :
- Régime instable, corruption
- Victoires militaires de Bonaparte en Italie
- 18 brumaire an VIII : coup d'État de Napoléon`;

// ── Mock style profile (what analyzeVisualStyle + analyzeWritingStyle would return) ──

const mockStyleProfile: StyleProfile = {
  tone: "académique, structuré",
  vocabulary: "intermédiaire à avancé, vocabulaire historique précis",
  sentenceStyle: "Phrases courtes, factuelles, style télégraphique dans les listes",
  voice: "Impersonnel",
  abbreviations: "→ pour conséquences/implications, DDHC, cf.",
  connectors: ["→", "cf.", "c'est-à-dire"],

  format: "outline",
  headingStyle: "MAJUSCULES pour titre principal, chiffres romains (I. II. III.) pour sections, lettres (A. B.) pour sous-sections",
  headingHierarchy: "3 niveaux: TITRE MAJUSCULE > I. Section numérotée > A. Sous-section",
  listMarkers: "- tirets",
  indentation: "2 niveaux d'imbrication avec 2 espaces",
  spacing: "Ligne vide entre chaque section principale",
  separators: "Lignes vides uniquement",
  emphasisPatterns: "**gras** pour les termes clés et les dates importantes",
  paragraphLength: "Court: points individuels",

  colors: "Titres en noir foncé, texte noir, termes importants en gras rouge",
  highlighting: "Aucun surlignage",
  emojiUsage: "Aucun",
  specialSymbols: "→ pour implications et conséquences",
  decorativeElements: "Aucun",

  fontPreference: "Sans-serif propre type Arial",
  sizeVariations: "Grands titres, texte de taille standard",
  capitalization: "TITRES PRINCIPAUX EN MAJUSCULES",
  boldItalicUsage: "Gras pour concepts clés, noms importants et dates cruciales",

  structure: "Organisation hiérarchique claire: titre > sections numérotées > sous-sections lettrées > listes à puces",
  definitionStyle: "Terme en gras suivi de : et définition",
  exampleUsage: "Dates et faits concrets en guise d'exemples",
  summaryStyle: "Section 'Bilan' en fin de document",
  detailLevel: "modéré à détaillé",
  mnemonics: "Aucun",
  crossReferences: "Aucun",

  examples: [
    "- **Crise financière** : dette massive après la guerre d'Amérique",
    "- 14 juillet : **Prise de la Bastille** → symbole de la fin de l'absolutisme",
    "RÉVOLUTION FRANÇAISE (1789-1799)",
    "III. La Terreur (1793-1794)",
    "A. 1789 — L'année de rupture",
  ],
  recurringPatterns: [
    "Date : **Événement en gras** → conséquence",
    "Sections numérotées en chiffres romains",
    "Sous-sections avec lettres majuscules",
  ],
  uniqueTraits: [
    "Utilise → pour montrer les conséquences",
    "Dates toujours précises avec jour/mois/année quand possible",
    "Termes clés systématiquement en gras",
  ],

  language: "fr",
  overallDescription:
    "Notes très structurées et hiérarchiques, style académique. Utilise les chiffres romains pour les grandes sections, les lettres pour les sous-sections, et les tirets pour les listes détaillées. Les termes clés sont en gras, les conséquences signalées par →. Style factuel, concis, pas de fioritures.",

  // CSS-ready values (from visual analysis of the PDF)
  cssHeadingColor: "#0f172a",
  cssAccentColor: "#dc2626",
  cssTextColor: "#1e293b",
  cssFontFamily: "Arial, Helvetica, sans-serif",
  cssNewInfoColor: "#6366f1",
};

// ── Mock merged content (what mergeNotesForStudent would return) ──

const mockMergedContent = `RÉVOLUTION FRANÇAISE (1789-1799)

I. Les causes de la Révolution

- **Crise financière** : dette massive après la guerre d'Amérique
- **Crise sociale** : inégalités entre les 3 ordres (clergé, noblesse, tiers état)
- Mauvaises récoltes de 1788 → hausse du prix du pain
- Influence des **Lumières** (Voltaire, Rousseau, Montesquieu)

II. Les événements clés

A. 1789 — L'année de rupture
  - 5 mai : ouverture des États généraux à Versailles
  - 20 juin : **Serment du Jeu de Paume**
  - 14 juillet : **Prise de la Bastille** → symbole de la fin de l'absolutisme
  - 4 août : abolition des privilèges
  - 26 août : **Déclaration des droits de l'homme et du citoyen**

B. 1791-1792 — La monarchie constitutionnelle
  - Fuite du roi à Varennes (juin 1791)
  - Guerre contre l'Autriche et la Prusse (avril 1792)
  - 10 août 1792 : prise des Tuileries → chute de la monarchie

III. La Terreur (1793-1794)

- Exécution de Louis XVI le 21 janvier 1793
- Comité de salut public dirigé par **Robespierre**
- Loi des suspects → arrestations massives
- Environ 17 000 exécutions officielles
- 9 thermidor an II (27 juillet 1794) : chute de Robespierre

IV. Bilan et héritage

- Fin de l'Ancien Régime et de la société d'ordres
- Principes de **liberté, égalité, fraternité**
- Naissance de la citoyenneté moderne
- Code civil préparé sous cette période

[NOUVEAU] V. La Convention nationale (1792-1795)

[NOUVEAU]   - Lutte entre **Girondins** (modérés) et **Montagnards** (radicaux)
[NOUVEAU]   - Instauration du **suffrage universel masculin**
[NOUVEAU]   - Création du **calendrier républicain**
[NOUVEAU]   - **Abolition de l'esclavage** dans les colonies (4 février 1794)

[NOUVEAU] VI. Le Directoire (1795-1799)

[NOUVEAU]   - Régime instable, marqué par la corruption
[NOUVEAU]   - Victoires militaires de **Bonaparte** en Italie (1796-1797)
[NOUVEAU]   - **18 brumaire an VIII** (9 novembre 1799) : coup d'État de Napoléon → fin de la Révolution`;

// ── Run the test ──

const pdfContent: PdfContent = {
  studentName: "Alice M.",
  courseTitle: "Histoire — Révolution Française",
  mergedNotes: mockMergedContent,
  completenessScore: 92,
  newInfoHighlights: [
    "La Convention nationale (1792-1795)",
    "Lutte entre Girondins et Montagnards",
    "Suffrage universel masculin",
    "Calendrier républicain",
    "Abolition de l'esclavage dans les colonies (1794)",
    "Le Directoire (1795-1799)",
    "Victoires de Bonaparte en Italie",
    "Coup d'État du 18 brumaire",
  ],
  originalScore: 60,
  styleProfile: mockStyleProfile,
};

// Generate output
const outputHtml = generateMergedNotesHTML(pdfContent);

// Also generate original notes (without merge, for comparison)
const originalContent: PdfContent = {
  studentName: "Alice M.",
  courseTitle: "Histoire — Révolution Française",
  mergedNotes: studentA_originalNotes,
  completenessScore: 60,
  newInfoHighlights: [],
  originalScore: 60,
  styleProfile: mockStyleProfile,
};
const originalHtml = generateMergedNotesHTML(originalContent);

// Write both files
const outDir = path.join(__dirname, "output");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

fs.writeFileSync(path.join(outDir, "original-notes.html"), originalHtml);
fs.writeFileSync(path.join(outDir, "merged-notes.html"), outputHtml);

console.log("✓ Test files generated:");
console.log(`  → ${path.join(outDir, "original-notes.html")}`);
console.log(`  → ${path.join(outDir, "merged-notes.html")}`);
console.log("");
console.log("Compare the two files in a browser to verify:");
console.log("  1. The merged notes look identical to the original EXCEPT for new sections");
console.log("  2. New sections (V. Convention, VI. Directoire) have a subtle left border");
console.log("  3. Font, colors, heading style, list markers all match");
console.log("  4. No gradient headers, no emojis, no progress bars, no branding");
