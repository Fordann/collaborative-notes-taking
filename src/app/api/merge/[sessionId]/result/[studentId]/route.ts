import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateMergedNotesHTML } from "@/lib/pdf";
import { generateLatexSource, compileLatexToPdf } from "@/lib/latex";

// GET: Get the merged result as PDF or HTML
// ?format=pdf  → returns compiled PDF binary (default)
// ?format=html → returns JSON with html field (legacy)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string; studentId: string }> }
) {
  const { sessionId, studentId } = await params;
  const format = req.nextUrl.searchParams.get("format") || "pdf";

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

  const newInfoHighlights: string[] = result.newInfoHighlights
    ? JSON.parse(result.newInfoHighlights)
    : [];

  const originalScore = Math.max(
    10,
    Math.round((result.completenessScore || 50) * 0.65)
  );

  let styleProfile = null;
  if (result.student.styleProfile) {
    try {
      styleProfile = JSON.parse(result.student.styleProfile);
    } catch {
      // ignore parse errors
    }
  }

  const pdfContent = {
    studentName: result.student.name,
    courseTitle: result.session.group.courseTitle,
    mergedNotes: result.mergedContent,
    completenessScore: result.completenessScore || 0,
    newInfoHighlights,
    originalScore,
    styleProfile,
  };

  // Return compiled PDF
  if (format === "pdf") {
    try {
      const texSource = generateLatexSource(pdfContent);
      const pdfBuffer = compileLatexToPdf(texSource);

      const fileName = `${result.student.name.replace(/[^a-zA-Z0-9àâäéèêëïîôùûüÿçÀÂÄÉÈÊËÏÎÔÙÛÜŸÇ -]/g, "")}_${result.session.group.courseTitle.replace(/[^a-zA-Z0-9àâäéèêëïîôùûüÿçÀÂÄÉÈÊËÏÎÔÙÛÜŸÇ -]/g, "")}.pdf`;

      return new NextResponse(new Uint8Array(pdfBuffer), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${fileName}"`,
          "Content-Length": pdfBuffer.length.toString(),
        },
      });
    } catch (err) {
      console.error("PDF generation failed, falling back to HTML:", err);
      // Fall through to HTML if LaTeX fails
    }
  }

  // HTML fallback
  const html = generateMergedNotesHTML(pdfContent);
  return NextResponse.json({ html, result });
}
