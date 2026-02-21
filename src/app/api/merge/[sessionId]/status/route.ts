import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET: Get merge session status with results
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;

  const session = await prisma.mergeSession.findUnique({
    where: { id: sessionId },
    include: {
      group: {
        include: {
          members: {
            include: { student: true },
          },
        },
      },
      notes: {
        select: { studentId: true },
      },
      results: {
        include: {
          student: {
            select: { id: true, name: true },
          },
        },
      },
    },
  });

  if (!session) {
    return NextResponse.json(
      { error: "Session not found" },
      { status: 404 }
    );
  }

  return NextResponse.json(session);
}
