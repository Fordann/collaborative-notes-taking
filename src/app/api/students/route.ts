import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// POST: Create or get student
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, email, styleNotes } = body;

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const student = await prisma.student.create({
    data: {
      name,
      email: email || null,
      styleNotes: styleNotes || null,
    },
  });

  return NextResponse.json(student);
}

// PATCH: Update student (email, style)
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { studentId, email } = body;

  if (!studentId) {
    return NextResponse.json(
      { error: "studentId is required" },
      { status: 400 }
    );
  }

  const student = await prisma.student.update({
    where: { id: studentId },
    data: {
      ...(email && { email }),
    },
  });

  return NextResponse.json(student);
}
