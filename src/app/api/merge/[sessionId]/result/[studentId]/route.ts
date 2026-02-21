import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateMergedNotesHTML } from "@/lib/pdf";

// GET: Get the merged result as HTML (for PDF download)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string; studentId: string }> }
) {
  const { sessionId, studentId } = await params;

  const result = await prisma.mergeResult.findUnique({
    where: {
      sessionId_studentId: { sessionId, studentId },
    },
    include: {
      student: true,
      session: {
        include: {
          group: true,
          notes: {
            where: { studentId },
            select: { content: true },
          },
        },
      },
    },
  });

  if (!result) {
    return NextResponse.json(
      { error: "Result not found" },
      { status: 404 }
    );
  }

  const originalContent = result.session.notes[0]?.content || "";
  const newInfoHighlights: string[] = result.newInfoHighlights
    ? JSON.parse(result.newInfoHighlights)
    : [];

  // Estimate original completeness score
  const originalScore = Math.max(
    10,
    Math.round((result.completenessScore || 50) * 0.65)
  );

  const html = generateMergedNotesHTML({
    studentName: result.student.name,
    courseTitle: result.session.group.courseTitle,
    mergedNotes: result.mergedContent,
    completenessScore: result.completenessScore || 0,
    newInfoHighlights,
    originalScore,
  });

  return NextResponse.json({ html, result });
}
