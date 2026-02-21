import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { analyzeWritingStyle, analyzeVisualStyle } from "@/lib/ai";
import type { StyleProfile } from "@/lib/ai";

// POST: Analyze a student's writing style (background task)
// Optionally accepts fileData (base64) + fileMimeType for visual analysis
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { studentId, fileData, fileMimeType } = body;

  if (!studentId) {
    return NextResponse.json(
      { error: "studentId is required" },
      { status: 400 }
    );
  }

  const student = await prisma.student.findUnique({
    where: { id: studentId },
  });

  if (!student) {
    return NextResponse.json(
      { error: "Student not found" },
      { status: 404 }
    );
  }

  if (!student.styleNotes) {
    return NextResponse.json(
      { error: "No style notes to analyze" },
      { status: 400 }
    );
  }

  try {
    // Step 1: Analyze writing style from text
    const textProfile = await analyzeWritingStyle(student.styleNotes);

    // Step 2: If an image was provided, also do visual analysis
    let finalProfile: StyleProfile = textProfile;
    if (fileData && fileMimeType && fileMimeType.startsWith("image/")) {
      try {
        const visualProfile = await analyzeVisualStyle(fileData, fileMimeType);
        // Merge visual data into text profile (visual takes precedence for visual fields)
        finalProfile = {
          ...textProfile,
          ...(visualProfile.colors && { colors: visualProfile.colors }),
          ...(visualProfile.highlighting && { highlighting: visualProfile.highlighting }),
          ...(visualProfile.fontPreference && { fontPreference: visualProfile.fontPreference }),
          ...(visualProfile.sizeVariations && { sizeVariations: visualProfile.sizeVariations }),
          ...(visualProfile.boldItalicUsage && { boldItalicUsage: visualProfile.boldItalicUsage }),
          ...(visualProfile.decorativeElements && { decorativeElements: visualProfile.decorativeElements }),
          ...(visualProfile.headingStyle && { headingStyle: `${textProfile.headingStyle} | Visuel: ${visualProfile.headingStyle}` }),
          ...(visualProfile.spacing && { spacing: `${textProfile.spacing} | Visuel: ${visualProfile.spacing}` }),
          ...(visualProfile.specialSymbols && { specialSymbols: `${textProfile.specialSymbols} | Visuel: ${visualProfile.specialSymbols}` }),
          ...(visualProfile.emojiUsage && { emojiUsage: `${textProfile.emojiUsage} | Visuel: ${visualProfile.emojiUsage}` }),
          ...(visualProfile.capitalization && { capitalization: `${textProfile.capitalization} | Visuel: ${visualProfile.capitalization}` }),
        };
        // Append visual description to overall description
        const visualDesc = (visualProfile as Record<string, unknown>).overallVisualDescription;
        if (visualDesc) {
          finalProfile.overallDescription = `${textProfile.overallDescription}\n\nAnalyse visuelle: ${visualDesc}`;
        }
      } catch (visualErr) {
        console.warn("Visual analysis failed, using text-only profile:", visualErr);
      }
    }

    await prisma.student.update({
      where: { id: studentId },
      data: { styleProfile: JSON.stringify(finalProfile) },
    });

    return NextResponse.json({ styleProfile: finalProfile });
  } catch (err) {
    console.error("Style analysis failed:", err);
    return NextResponse.json(
      { error: "Style analysis failed" },
      { status: 500 }
    );
  }
}
