"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import ProgressBar from "@/components/ProgressBar";
import LoadingSpinner from "@/components/LoadingSpinner";

interface MergeStatus {
  id: string;
  title: string;
  status: string;
  progress: number;
  group: {
    name: string;
    courseTitle: string;
  };
  results: {
    id: string;
    studentId: string;
    student: { id: string; name: string };
    completenessScore: number;
    newInfoHighlights: string;
    mergedContent: string;
  }[];
}

const mergeSteps = [
  { label: "Analyse des notes du groupe", threshold: 10 },
  { label: "Identification des informations manquantes", threshold: 30 },
  { label: "Fusion intelligente en cours", threshold: 50 },
  { label: "Redaction dans le style de chaque etudiant", threshold: 70 },
  { label: "Generation des PDF personnalises", threshold: 90 },
  { label: "Termine !", threshold: 100 },
];

export default function MergePage() {
  const params = useParams();
  const sessionId = params.sessionId as string;
  const groupId = params.groupId as string;

  const [mergeStatus, setMergeStatus] = useState<MergeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedResult, setSelectedResult] = useState<string | null>(null);

  const studentId =
    typeof window !== "undefined" ? localStorage.getItem("studentId") : null;

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/merge/${sessionId}/status`);
      if (res.ok) {
        const data = await res.json();
        setMergeStatus(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchStatus();
    // Poll more frequently during merge
    const interval = setInterval(fetchStatus, 2000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const downloadPdf = async (resultStudentId: string) => {
    const res = await fetch(
      `/api/merge/${sessionId}/result/${resultStudentId}`
    );
    if (res.ok) {
      const data = await res.json();
      // Open the HTML in a new tab for printing/saving as PDF
      const win = window.open("", "_blank");
      if (win) {
        win.document.write(data.html);
        win.document.close();
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center">
        <LoadingSpinner label="Chargement..." />
      </div>
    );
  }

  if (!mergeStatus) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center">
        <p className="text-slate-500">Session introuvable</p>
      </div>
    );
  }

  const isCompleted = mergeStatus.status === "completed";
  const isMerging =
    mergeStatus.status === "merging" || mergeStatus.status === "analyzing";
  const currentStep = mergeSteps.find(
    (s) => mergeStatus.progress <= s.threshold
  );

  // Find current student's result
  const myResult = mergeStatus.results.find(
    (r) => r.studentId === studentId
  );

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-center gap-2 text-sm text-indigo-600 mb-2">
          <a href={`/group/${groupId}`} className="hover:text-indigo-700">
            {mergeStatus.group.name}
          </a>
          <span className="text-slate-300">/</span>
          <span className="text-slate-600">{mergeStatus.title}</span>
        </div>
        <h1 className="text-xl font-bold text-slate-900">
          {isCompleted ? "Merge termine !" : "Merge en cours..."}
        </h1>
      </div>

      {/* Progress during merge */}
      {isMerging && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6">
          <ProgressBar
            progress={mergeStatus.progress}
            label={currentStep?.label || "En cours..."}
            color="indigo"
          />

          <div className="space-y-2">
            {mergeSteps.map((step, i) => (
              <div
                key={i}
                className={`flex items-center gap-3 text-sm ${
                  mergeStatus.progress >= step.threshold
                    ? "text-emerald-600"
                    : mergeStatus.progress >= step.threshold - 20
                    ? "text-indigo-600"
                    : "text-slate-300"
                }`}
              >
                <span>
                  {mergeStatus.progress >= step.threshold
                    ? "&#10003;"
                    : mergeStatus.progress >= step.threshold - 20
                    ? "..."
                    : "&#9711;"}
                </span>
                <span>{step.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {isCompleted && (
        <div className="space-y-6">
          {/* My personalized result */}
          {myResult && (
            <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl p-6 text-white">
              <h2 className="text-lg font-bold mb-3">Ton PDF personnalise</h2>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="bg-white/10 rounded-xl p-4">
                  <p className="text-sm opacity-80">Score de completude</p>
                  <p className="text-3xl font-bold">
                    {Math.round(myResult.completenessScore)}%
                  </p>
                </div>
                <div className="bg-white/10 rounded-xl p-4">
                  <p className="text-sm opacity-80">Infos ajoutees</p>
                  <p className="text-3xl font-bold">
                    {myResult.newInfoHighlights
                      ? JSON.parse(myResult.newInfoHighlights).length
                      : 0}
                  </p>
                </div>
              </div>

              <button
                onClick={() => downloadPdf(myResult.studentId)}
                className="w-full py-3 bg-white text-indigo-600 rounded-xl text-sm font-bold hover:bg-indigo-50 transition"
              >
                Telecharger mon PDF personnalise
              </button>
            </div>
          )}

          {/* New info highlights for current student */}
          {myResult?.newInfoHighlights && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
              <h3 className="font-semibold text-amber-800 mb-3">
                Nouvelles informations ajoutees
              </h3>
              <ul className="space-y-2">
                {JSON.parse(myResult.newInfoHighlights).map(
                  (highlight: string, i: number) => (
                    <li
                      key={i}
                      className="text-sm text-amber-900 pl-4 border-l-2 border-amber-300"
                    >
                      {highlight}
                    </li>
                  )
                )}
              </ul>
            </div>
          )}

          {/* All results */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
            <h3 className="font-semibold text-slate-800">
              Resultats de tous les membres
            </h3>
            <div className="space-y-3">
              {mergeStatus.results.map((result) => (
                <div
                  key={result.id}
                  className={`flex items-center justify-between p-3 rounded-lg border transition cursor-pointer ${
                    selectedResult === result.id
                      ? "border-indigo-300 bg-indigo-50"
                      : "border-slate-100 hover:border-slate-200"
                  }`}
                  onClick={() =>
                    setSelectedResult(
                      selectedResult === result.id ? null : result.id
                    )
                  }
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-medium">
                      {result.student.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-700">
                        {result.student.name}
                        {result.studentId === studentId && (
                          <span className="ml-2 text-xs text-indigo-600">
                            (toi)
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-slate-400">
                        Completude: {Math.round(result.completenessScore)}%
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      downloadPdf(result.studentId);
                    }}
                    className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                  >
                    PDF
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Preview area */}
          {selectedResult && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="font-semibold text-slate-800 mb-3">Apercu</h3>
              <div className="prose prose-sm max-w-none">
                <pre className="whitespace-pre-wrap text-xs text-slate-600 bg-slate-50 p-4 rounded-lg max-h-96 overflow-y-auto">
                  {mergeStatus.results
                    .find((r) => r.id === selectedResult)
                    ?.mergedContent.substring(0, 2000)}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Waiting state */}
      {!isMerging && !isCompleted && (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-3">
          <div className="text-3xl">&#9201;</div>
          <h2 className="font-semibold text-slate-700">
            En attente du lancement
          </h2>
          <p className="text-sm text-slate-500">
            Le merge sera lance quand tous les membres auront uploade leurs
            notes.
          </p>
        </div>
      )}
    </div>
  );
}
