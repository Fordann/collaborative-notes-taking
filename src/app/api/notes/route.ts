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

  let note;
  if (existing) {
    // Update existing note
    note = await prisma.note.update({
      where: { id: existing.id },
      data: { content, originalType: originalType || "text", fileName },
    });
  } else {
    note = await prisma.note.create({
      data: {
        sessionId,
        studentId,
        content,
        originalType: originalType || "text",
        fileName,
      },
    });
  }

  // Check if all group members have now contributed — if so, auto-trigger merge
  const session = await prisma.mergeSession.findUnique({
    where: { id: sessionId },
    include: {
      notes: { select: { studentId: true } },
      group: {
        include: {
          members: { select: { studentId: true } },
        },
      },
    },
  });

  if (session && session.status === "collecting") {
    const memberIds = new Set(session.group.members.map((m) => m.studentId));
    const noteStudentIds = new Set(session.notes.map((n) => n.studentId));
    const allContributed = [...memberIds].every((id) => noteStudentIds.has(id));

    if (allContributed && memberIds.size >= 2) {
      // Auto-launch merge
      return NextResponse.json({ ...note, autoMerge: true });
    }
  }

  return NextResponse.json(note);
}
