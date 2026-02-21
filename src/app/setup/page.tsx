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

  const handleFileSelect = async (file: File) => {
    // Read file content
    const text = await file.text();
    setStyleText(text);
  };

  const handleTextInput = (text: string) => {
    setStyleText(text);
  };

  const handleAnalyze = async () => {
    if (!styleText.trim()) return;

    setStep("analyzing");
    const studentName = localStorage.getItem("studentName") || "Étudiant";

    try {
      // Create/update student with style notes
      const res = await fetch("/api/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: studentName,
          email: localStorage.getItem("studentEmail") || undefined,
          styleNotes: styleText,
        }),
      });

      const student = await res.json();
      localStorage.setItem("studentId", student.id);

      // Trigger background style analysis
      fetch("/api/style-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: student.id }),
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
                // Skip style analysis, create student without it
                const studentName = localStorage.getItem("studentName") || "Étudiant";
                fetch("/api/students", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ name: studentName }),
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
