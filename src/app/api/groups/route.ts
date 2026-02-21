import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateGroupCode } from "@/lib/utils";

// POST: Create a group
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, courseTitle, studentId } = body;

  if (!name || !courseTitle) {
    return NextResponse.json(
      { error: "name and courseTitle are required" },
      { status: 400 }
    );
  }

  // Generate unique code
  let code = generateGroupCode();
  let exists = await prisma.group.findUnique({ where: { code } });
  while (exists) {
    code = generateGroupCode();
    exists = await prisma.group.findUnique({ where: { code } });
  }

  const group = await prisma.group.create({
    data: {
      name,
      courseTitle,
      code,
      ...(studentId && {
        members: {
          create: { studentId, isLeader: true },
        },
      }),
    },
    include: {
      members: {
        include: { student: true },
      },
    },
  });

  return NextResponse.json(group);
}

// GET: Find group by code
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.json(
      { error: "code parameter is required" },
      { status: 400 }
    );
  }

  const group = await prisma.group.findUnique({
    where: { code: code.toUpperCase() },
    include: {
      members: {
        include: { student: true },
      },
    },
  });

  if (!group) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  return NextResponse.json(group);
}
