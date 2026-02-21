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

// POST: Create or update student
// If studentId is provided and exists, update it. Otherwise create a new one.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, email, styleNotes, studentId } = body;

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  // If studentId provided, try to update existing student
  if (studentId) {
    const existing = await prisma.student.findUnique({ where: { id: studentId } });
    if (existing) {
      const updated = await prisma.student.update({
        where: { id: studentId },
        data: {
          name,
          ...(email !== undefined && { email: email || null }),
          ...(styleNotes !== undefined && { styleNotes: styleNotes || null }),
        },
      });
      return NextResponse.json(updated);
    }
  }

  // Otherwise create new student
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
