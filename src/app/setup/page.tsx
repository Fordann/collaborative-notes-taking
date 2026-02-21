"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import FileUpload from "@/components/FileUpload";
import LoadingSpinner from "@/components/LoadingSpinner";

export default function SetupPage() {
  return (
    <Suspense fallback={<LoadingSpinner label="Chargement..." />}>
      <SetupPageInner />
    </Suspense>
  );
}

function SetupPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const groupId = searchParams.get("groupId");
  const [step, setStep] = useState<"upload" | "analyzing" | "done">("upload");
  const [styleText, setStyleText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [fileMimeType, setFileMimeType] = useState<string | null>(null);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1]); // Remove data:...;base64, prefix
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleFileSelect = async (file: File) => {
    // For plain text files, read directly (no visual analysis possible)
    if (file.type === "text/plain" || file.name.endsWith(".txt")) {
      const text = await file.text();
      setStyleText(text);
      setFileBase64(null);
      setFileMimeType(null);
      return;
    }

    // Store original file as base64 for visual style analysis
    try {
      const b64 = await fileToBase64(file);
      // For images, store directly for vision analysis
      if (file.type.startsWith("image/")) {
        setFileBase64(b64);
        setFileMimeType(file.type);
      } else {
        // For PDFs, we can't use vision directly but we clear the visual data
        setFileBase64(null);
        setFileMimeType(null);
      }
    } catch {
      setFileBase64(null);
      setFileMimeType(null);
    }

    // For PDFs and images, use server-side extraction for text
    setExtracting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/extract-text", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Impossible d'extraire le texte du fichier");
        return;
      }
      const { text } = await res.json();
      setStyleText(text);
    } catch {
      alert("Erreur lors de l'extraction du texte");
    } finally {
      setExtracting(false);
    }
  };

  const handleTextInput = (text: string) => {
    setStyleText(text);
  };

  const handleAnalyze = async () => {
    if (!styleText.trim()) return;

    setStep("analyzing");
    const studentName = localStorage.getItem("studentName") || "Étudiant";

    try {
      // Update existing student with style notes (preserve studentId)
      const existingId = localStorage.getItem("studentId");
      const res = await fetch("/api/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: existingId || undefined,
          name: studentName,
          email: localStorage.getItem("studentEmail") || undefined,
          styleNotes: styleText,
        }),
      });

      const student = await res.json();
      localStorage.setItem("studentId", student.id);

      // Trigger background style analysis (with optional visual data)
      fetch("/api/style-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: student.id,
          ...(fileBase64 && fileMimeType ? { fileData: fileBase64, fileMimeType } : {}),
        }),
      });

      setStep("done");

      // Redirect to group after brief success message
      setTimeout(() => {
        if (groupId) {
          router.push(`/group/${groupId}`);
        }
      }, 1500);
    } catch {
      setStep("upload");
      alert("Erreur lors de l'analyse. Réessaie.");
    }
  };

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-slate-900">
            Analyse de ton style
          </h1>
          <p className="text-sm text-slate-500">
            Uploade des notes dont tu es fier pour que l&apos;IA apprenne ton style
            d&apos;écriture.
          </p>
        </div>

        {step === "upload" && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <FileUpload
              onFileSelect={handleFileSelect}
              onTextInput={handleTextInput}
              label="Tes meilleures notes"
              description="Des notes de cours dont tu es fier (PDF, texte, image)"
              allowText={true}
            />

            {extracting && (
              <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-200 text-center">
                <p className="text-xs text-indigo-700">Extraction du texte en cours...</p>
              </div>
            )}
            {styleText && (
              <div className="space-y-3">
                <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                  <p className="text-xs text-emerald-700">
                    ✅ {styleText.length} caractères chargés
                  </p>
                </div>
                <button
                  onClick={handleAnalyze}
                  className="w-full py-3 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition"
                >
                  Analyser mon style
                </button>
              </div>
            )}

            <button
              onClick={() => {
                // Skip style analysis, keep existing student
                const existingId = localStorage.getItem("studentId");
                if (existingId && groupId) {
                  router.push(`/group/${groupId}`);
                  return;
                }
                const studentName = localStorage.getItem("studentName") || "Étudiant";
                fetch("/api/students", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ studentId: existingId || undefined, name: studentName }),
                })
                  .then((r) => r.json())
                  .then((student) => {
                    localStorage.setItem("studentId", student.id);
                    if (groupId) router.push(`/group/${groupId}`);
                  });
              }}
              className="w-full text-center text-xs text-slate-400 hover:text-slate-600 transition"
            >
              Passer cette étape →
            </button>
          </div>
        )}

        {step === "analyzing" && (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
            <LoadingSpinner label="Analyse de ton style en cours..." />
            <p className="text-xs text-slate-400 mt-4">
              L&apos;IA apprend tes préférences de prise de notes
            </p>
          </div>
        )}

        {step === "done" && (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-3">
            <div className="text-4xl">✨</div>
            <h2 className="text-lg font-semibold text-slate-800">
              Style analysé !
            </h2>
            <p className="text-sm text-slate-500">Redirection en cours...</p>
          </div>
        )}
      </div>
    </div>
  );
}
