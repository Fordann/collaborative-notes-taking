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

  // Collect all studentIds who contributed to any session
  const allContributedStudentIds = new Set<string>();
  for (const session of group.sessions) {
    for (const note of session.notes) {
      allContributedStudentIds.add(note.studentId);
    }
  }

  const enrichedMembers = group.members.map(
    (m: { studentId: string; [key: string]: unknown }) => ({
      ...m,
      hasContributed: allContributedStudentIds.has(m.studentId),
    })
  );

  // Enrich each session with its contributor studentIds
  const enrichedSessions = group.sessions.map((session) => {
    const contributorIds = session.notes.map(
      (n: { studentId: string }) => n.studentId
    );
    return {
      ...session,
      contributorIds,
    };
  });

  return NextResponse.json({
    ...group,
    members: enrichedMembers,
    sessions: enrichedSessions,
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
