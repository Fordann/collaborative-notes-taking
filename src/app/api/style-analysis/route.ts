import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { analyzeWritingStyle } from "@/lib/ai";

// POST: Analyze a student's writing style (background task)
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { studentId } = body;

  if (!studentId) {
    return NextResponse.json(
      { error: "studentId is required" },
      { status: 400 }
    );
  }

  const student = await prisma.student.findUnique({
    where: { id: studentId },
  });

  if (!student) {
    return NextResponse.json(
      { error: "Student not found" },
      { status: 404 }
    );
  }

  if (!student.styleNotes) {
    return NextResponse.json(
      { error: "No style notes to analyze" },
      { status: 400 }
    );
  }

  try {
    const styleProfile = await analyzeWritingStyle(student.styleNotes);

    await prisma.student.update({
      where: { id: studentId },
      data: { styleProfile: JSON.stringify(styleProfile) },
    });

    return NextResponse.json({ styleProfile });
  } catch (err) {
    console.error("Style analysis failed:", err);
    return NextResponse.json(
      { error: "Style analysis failed" },
      { status: 500 }
    );
  }
}
