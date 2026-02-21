import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET: Check if student exists
export async function GET(req: NextRequest) {
  const studentId = req.nextUrl.searchParams.get("id");

  if (!studentId) {
    return NextResponse.json({ error: "id parameter is required" }, { status: 400 });
  }

  const student = await prisma.student.findUnique({ where: { id: studentId } });

  if (!student) {
    return NextResponse.json({ exists: false }, { status: 404 });
  }

  return NextResponse.json(student);
}

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
