import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET: Get group details with members and sessions
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  const { groupId } = await params;

  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: {
      members: {
        include: { student: true },
      },
      sessions: {
        include: {
          _count: { select: { notes: true } },
          notes: { select: { studentId: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!group) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  // Enrich members with contribution status for the latest session
  const latestSession = group.sessions[0];
  const noteStudentIds: string[] = latestSession
    ? latestSession.notes.map((n: { studentId: string }) => n.studentId)
    : [];
  const contributedStudentIds = new Set<string>(noteStudentIds);

  const enrichedMembers = group.members.map(
    (m: { studentId: string; [key: string]: unknown }) => ({
      ...m,
      hasContributed: contributedStudentIds.has(m.studentId),
    })
  );

  return NextResponse.json({
    ...group,
    members: enrichedMembers,
  });
}

// POST: Add a member to the group
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  const { groupId } = await params;
  const body = await req.json();
  const { studentId } = body;

  if (!studentId) {
    return NextResponse.json(
      { error: "studentId is required" },
      { status: 400 }
    );
  }

  // Check if already a member
  const existing = await prisma.groupMember.findUnique({
    where: {
      studentId_groupId: { studentId, groupId },
    },
  });

  if (existing) {
    return NextResponse.json({ message: "Already a member" });
  }

  const member = await prisma.groupMember.create({
    data: { studentId, groupId },
    include: { student: true },
  });

  return NextResponse.json(member);
}
