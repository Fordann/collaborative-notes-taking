import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// POST: Create a new merge session for the group
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  const { groupId } = await params;
  const body = await req.json();
  const { title } = body;

  if (!title) {
    return NextResponse.json(
      { error: "title is required" },
      { status: 400 }
    );
  }

  const session = await prisma.mergeSession.create({
    data: {
      groupId,
      title,
      status: "collecting",
    },
  });

  return NextResponse.json(session);
}
