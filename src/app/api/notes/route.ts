import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// POST: Upload notes to a session
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { sessionId, studentId, content, originalType, fileName } = body;

  if (!sessionId || !studentId || !content) {
    return NextResponse.json(
      { error: "sessionId, studentId, and content are required" },
      { status: 400 }
    );
  }

  // Check if student already submitted for this session
  const existing = await prisma.note.findFirst({
    where: { sessionId, studentId },
  });

  if (existing) {
    // Update existing note
    const note = await prisma.note.update({
      where: { id: existing.id },
      data: { content, originalType: originalType || "text", fileName },
    });
    return NextResponse.json(note);
  }

  const note = await prisma.note.create({
    data: {
      sessionId,
      studentId,
      content,
      originalType: originalType || "text",
      fileName,
    },
  });

  return NextResponse.json(note);
}
