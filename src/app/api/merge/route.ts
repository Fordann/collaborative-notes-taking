import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { mergeNotesForStudent, analyzeWritingStyle } from "@/lib/ai";
import type { StyleProfile } from "@/lib/ai";

interface NoteWithStudent {
  id: string;
  content: string;
  student: {
    id: string;
    name: string;
    styleProfile: string | null;
    styleNotes: string | null;
  };
}

interface SessionWithRelations {
  id: string;
  notes: NoteWithStudent[];
  group: {
    members: { student: { id: string; name: string } }[];
  };
}

// POST: Launch the merge process for a session
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { sessionId } = body;

  if (!sessionId) {
    return NextResponse.json(
      { error: "sessionId is required" },
      { status: 400 }
    );
  }

  // Get session with notes and student info
  const session = await prisma.mergeSession.findUnique({
    where: { id: sessionId },
    include: {
      notes: {
        include: {
          student: true,
        },
      },
      group: {
        include: {
          members: {
            include: { student: true },
          },
        },
      },
    },
  });

  if (!session) {
    return NextResponse.json(
      { error: "Session not found" },
      { status: 404 }
    );
  }

  if (session.notes.length < 2) {
    return NextResponse.json(
      { error: "At least 2 notes are required" },
      { status: 400 }
    );
  }

  // Start the merge process in the background
  await prisma.mergeSession.update({
    where: { id: sessionId },
    data: { status: "analyzing", progress: 5 },
  });

  // Run merge asynchronously
  processMerge(session as unknown as SessionWithRelations).catch(
    (err: unknown) => {
      console.error("Merge failed:", err);
      prisma.mergeSession.update({
        where: { id: sessionId },
        data: { status: "failed", progress: 0 },
      });
    }
  );

  return NextResponse.json({ status: "started", sessionId });
}

async function processMerge(session: SessionWithRelations) {
  const sessionId = session.id;
  const totalStudents = session.notes.length;
  let completedStudents = 0;

  // Step 1: Analyze styles for all students who don't have one
  await prisma.mergeSession.update({
    where: { id: sessionId },
    data: { status: "analyzing", progress: 10 },
  });

  for (const note of session.notes) {
    if (!note.student.styleProfile) {
      try {
        const textToAnalyze = note.student.styleNotes || note.content;
        const styleProfile = await analyzeWritingStyle(textToAnalyze);
        await prisma.student.update({
          where: { id: note.student.id },
          data: { styleProfile: JSON.stringify(styleProfile) },
        });
        note.student.styleProfile = JSON.stringify(styleProfile);
      } catch (err) {
        console.error(
          `Style analysis failed for ${note.student.name}:`,
          err
        );
        const defaultProfile: StyleProfile = {
          tone: "décontracté",
          vocabulary: "intermédiaire",
          sentenceStyle: "Phrases de longueur moyenne, style direct",
          voice: "Impersonnel",
          abbreviations: "Quelques abréviations courantes",
          connectors: ["donc", "ensuite", "aussi", "par exemple"],
          format: "mixed",
          headingStyle: "## Style markdown avec hiérarchie",
          headingHierarchy: "2-3 niveaux",
          listMarkers: "- tirets",
          indentation: "1-2 niveaux",
          spacing: "Ligne vide entre sections",
          separators: "Lignes vides",
          emphasisPatterns: "**gras** pour les termes importants",
          paragraphLength: "Moyen: 2-3 phrases",
          colors: "Non détecté",
          highlighting: "Minimal",
          emojiUsage: "Aucun",
          specialSymbols: "Aucun symbole spécial",
          decorativeElements: "Aucun",
          fontPreference: "Sans-serif",
          sizeVariations: "Titres plus grands, texte uniforme",
          capitalization: "Standard",
          boldItalicUsage: "Gras pour les concepts clés",
          structure: "Titres et sous-titres avec des listes à puces",
          definitionStyle: "Terme: définition",
          exampleUsage: "Occasionnel",
          summaryStyle: "Pas de résumé",
          detailLevel: "modéré",
          mnemonics: "Aucun",
          crossReferences: "Aucun",
          examples: [],
          recurringPatterns: [],
          uniqueTraits: [],
          language: "fr",
          overallDescription: "Style de prise de notes standard avec des titres, des listes à puces et un niveau de détail modéré.",
        };
        note.student.styleProfile = JSON.stringify(defaultProfile);
      }
    }
  }

  // Step 2: Merge for each student
  await prisma.mergeSession.update({
    where: { id: sessionId },
    data: { status: "merging", progress: 25 },
  });

  const allStudentNotes = session.notes.map((n: NoteWithStudent) => ({
    studentName: n.student.name,
    content: n.content,
  }));

  for (const note of session.notes) {
    const styleProfile = JSON.parse(
      note.student.styleProfile || "{}"
    ) as StyleProfile;

    try {
      const result = await mergeNotesForStudent(
        {
          studentNotes: allStudentNotes,
          targetStudent: {
            name: note.student.name,
            styleProfile,
            originalNotes: note.content,
          },
        },
        async (_step: string, progress: number) => {
          const overallProgress =
            25 +
            (completedStudents / totalStudents) * 65 +
            (progress / 100) * (65 / totalStudents);
          await prisma.mergeSession.update({
            where: { id: sessionId },
            data: { progress: Math.round(overallProgress) },
          });
        }
      );

      await prisma.mergeResult.upsert({
        where: {
          sessionId_studentId: {
            sessionId,
            studentId: note.student.id,
          },
        },
        create: {
          sessionId,
          studentId: note.student.id,
          mergedContent: result.mergedContent,
          newInfoHighlights: JSON.stringify(result.newInfoHighlights),
          completenessScore: result.completenessScore,
        },
        update: {
          mergedContent: result.mergedContent,
          newInfoHighlights: JSON.stringify(result.newInfoHighlights),
          completenessScore: result.completenessScore,
        },
      });

      completedStudents++;
    } catch (err) {
      console.error(`Merge failed for ${note.student.name}:`, err);
    }
  }

  // Step 3: Mark as completed
  await prisma.mergeSession.update({
    where: { id: sessionId },
    data: { status: "completed", progress: 100 },
  });
}
