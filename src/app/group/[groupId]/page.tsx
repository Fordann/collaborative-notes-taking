"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import MemberList from "@/components/MemberList";
import FileUpload from "@/components/FileUpload";
import LoadingSpinner from "@/components/LoadingSpinner";

interface GroupData {
  id: string;
  name: string;
  code: string;
  courseTitle: string;
  members: {
    id: string;
    student: { id: string; name: string; styleNotes: string | null };
    isLeader: boolean;
    hasContributed: boolean;
    joinedAt: string;
  }[];
  sessions: {
    id: string;
    title: string;
    status: string;
    progress: number;
    createdAt: string;
    _count: { notes: number };
  }[];
}

export default function GroupDashboardPage() {
  const params = useParams();
  const router = useRouter();
  const groupId = params.groupId as string;
  const [group, setGroup] = useState<GroupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [sessionTitle, setSessionTitle] = useState("");
  const [creatingSession, setCreatingSession] = useState(false);

  // Style analysis state
  const [styleText, setStyleText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [analyzingStyle, setAnalyzingStyle] = useState(false);
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [fileMimeType, setFileMimeType] = useState<string | null>(null);
  const [reAnalyzeOpen, setReAnalyzeOpen] = useState(false);

  const fetchGroup = useCallback(async () => {
    try {
      const res = await fetch(`/api/groups/${groupId}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setGroup(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    fetchGroup();
    const interval = setInterval(fetchGroup, 10000);
    return () => clearInterval(interval);
  }, [fetchGroup]);

  // Check if current user has completed style analysis
  const studentId =
    typeof window !== "undefined"
      ? localStorage.getItem("studentId")
      : null;

  const currentMember = group?.members.find(
    (m) => m.student.id === studentId
  );
  const hasStyle = !!currentMember?.student.styleNotes;

  const copyCode = () => {
    if (group) {
      navigator.clipboard.writeText(group.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleFileSelect = async (file: File) => {
    if (file.type === "text/plain" || file.name.endsWith(".txt")) {
      const text = await file.text();
      setStyleText(text);
      setFileBase64(null);
      setFileMimeType(null);
      return;
    }

    // Capture image for visual analysis
    try {
      if (file.type.startsWith("image/")) {
        const b64 = await fileToBase64(file);
        setFileBase64(b64);
        setFileMimeType(file.type);
      } else if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
        // Render first PDF page to image for visual style analysis
        const { pdfPageToImage } = await import("@/lib/pdf-to-image");
        const b64 = await pdfPageToImage(file);
        setFileBase64(b64);
        setFileMimeType("image/png");
      } else {
        setFileBase64(null);
        setFileMimeType(null);
      }
    } catch {
      setFileBase64(null);
      setFileMimeType(null);
    }

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

  const handleAnalyzeStyle = async () => {
    if (!styleText.trim() || !studentId) return;

    setAnalyzingStyle(true);
    const studentName = localStorage.getItem("studentName") || "Étudiant";

    try {
      // Save style notes to student
      await fetch("/api/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId,
          name: studentName,
          styleNotes: styleText,
        }),
      });

      // Trigger background style analysis
      fetch("/api/style-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId,
          ...(fileBase64 && fileMimeType
            ? { fileData: fileBase64, fileMimeType }
            : {}),
        }),
      });

      // Refresh group data to update hasStyle
      await fetchGroup();
      setReAnalyzeOpen(false);
      setStyleText("");
    } catch {
      alert("Erreur lors de l'analyse. Réessaie.");
    } finally {
      setAnalyzingStyle(false);
    }
  };

  const createSession = async () => {
    if (!sessionTitle.trim()) return;
    setCreatingSession(true);

    try {
      const res = await fetch(`/api/groups/${groupId}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: sessionTitle }),
      });
      const session = await res.json();
      router.push(`/group/${groupId}/upload?sessionId=${session.id}`);
    } catch {
      alert("Erreur lors de la creation de la session");
    } finally {
      setCreatingSession(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center">
        <LoadingSpinner label="Chargement du groupe..." />
      </div>
    );
  }

  if (!group) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center">
        <p className="text-slate-500">Groupe introuvable</p>
      </div>
    );
  }

  const members = group.members.map((m) => ({
    id: m.student.id,
    name: m.student.name,
    isLeader: m.isLeader,
    hasContributed: m.hasContributed,
    joinedAt: m.joinedAt,
  }));

  return (
    <div className="space-y-6 pb-8">
      {/* Group header — always visible so the code can be shared */}
      <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl p-6 text-white">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">{group.name}</h1>
            <p className="text-indigo-100 text-sm mt-1">
              {group.courseTitle}
            </p>
          </div>
          <button
            onClick={copyCode}
            className="bg-white/20 hover:bg-white/30 backdrop-blur px-4 py-2 rounded-lg text-sm font-mono transition"
          >
            {copied ? "Copie !" : `Code: ${group.code}`}
          </button>
        </div>

        <div className="mt-4 flex items-center gap-4 text-sm text-indigo-100">
          <span>{group.members.length} membres</span>
          <span>|</span>
          <span>{group.sessions.length} sessions</span>
        </div>
      </div>

      {/* Style analysis gate — blocks the rest until completed */}
      {!hasStyle || reAnalyzeOpen ? (
        <div className="bg-white rounded-2xl border-2 border-indigo-200 p-6 space-y-4">
          <div className="text-center space-y-2">
            {hasStyle && (
              <button
                onClick={() => { setReAnalyzeOpen(false); setStyleText(""); }}
                className="text-xs text-slate-400 hover:text-slate-600 underline"
              >
                Annuler
              </button>
            )}
            <div className="text-3xl">✍️</div>
            <h2 className="text-lg font-bold text-slate-900">
              {hasStyle ? "Re-analyser ton style" : "Analyse de ton style d'écriture"}
            </h2>
            <p className="text-sm text-slate-500">
              {hasStyle
                ? "Uploade de nouvelles notes d'exemple pour améliorer l'extraction de ton style."
                : "Avant de commencer, uploade des notes dont tu es fier pour que l'IA apprenne ton style. Tes notes fusionnées seront rédigées dans TON style personnel."}
            </p>
          </div>

          <FileUpload
            onFileSelect={handleFileSelect}
            onTextInput={handleTextInput}
            label="Tes meilleures notes"
            description="Des notes de cours dont tu es fier (PDF, texte, image)"
            allowText={true}
          />

          {extracting && (
            <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-200 text-center">
              <p className="text-xs text-indigo-700">
                Extraction du texte en cours...
              </p>
            </div>
          )}

          {styleText && !analyzingStyle && (
            <div className="space-y-3">
              <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                <p className="text-xs text-emerald-700">
                  {styleText.length} caractères chargés
                </p>
              </div>
              <button
                onClick={handleAnalyzeStyle}
                className="w-full py-3 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition"
              >
                Analyser mon style
              </button>
            </div>
          )}

          {analyzingStyle && (
            <div className="text-center py-4">
              <LoadingSpinner label="Analyse de ton style en cours..." />
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="grid gap-6 md:grid-cols-2">
            {/* Members */}
            <MemberList members={members} />

            {/* New session */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
              <h3 className="font-semibold text-slate-800">
                Nouvelle session de notes
              </h3>
              <p className="text-xs text-slate-500">
                Cree une session pour un cours, puis chaque membre uploade ses
                notes.
              </p>

              <input
                type="text"
                value={sessionTitle}
                onChange={(e) => setSessionTitle(e.target.value)}
                placeholder="Ex: Cours du 21 fevrier - Chapitre 5"
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              />

              <button
                onClick={createSession}
                disabled={creatingSession || !sessionTitle.trim()}
                className="w-full py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition"
              >
                {creatingSession ? "Creation..." : "Creer la session"}
              </button>
            </div>
          </div>

          {/* Re-analyze style */}
          <button
            onClick={() => setReAnalyzeOpen(true)}
            className="text-xs text-slate-400 hover:text-indigo-600 transition underline"
          >
            Re-analyser mon style d&apos;écriture
          </button>

          {/* Sessions list */}
          {group.sessions.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-semibold text-slate-800">
                Sessions de notes
              </h3>
              <div className="grid gap-3">
                {group.sessions.map((session) => (
                  <div
                    key={session.id}
                    className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between hover:border-indigo-200 transition cursor-pointer"
                    onClick={() => {
                      if (session.status === "collecting") {
                        router.push(
                          `/group/${groupId}/upload?sessionId=${session.id}`
                        );
                      } else {
                        router.push(
                          `/group/${groupId}/merge/${session.id}`
                        );
                      }
                    }}
                  >
                    <div>
                      <h4 className="font-medium text-slate-800 text-sm">
                        {session.title}
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {session._count.notes} notes uploadees
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                          session.status === "completed"
                            ? "bg-emerald-50 text-emerald-600"
                            : session.status === "merging" ||
                                session.status === "analyzing"
                              ? "bg-amber-50 text-amber-600"
                              : "bg-blue-50 text-blue-600"
                        }`}
                      >
                        {session.status === "collecting"
                          ? "En attente"
                          : session.status === "analyzing"
                            ? "Analyse..."
                            : session.status === "merging"
                              ? `Fusion ${session.progress}%`
                              : session.status === "completed"
                                ? "Termine"
                                : session.status}
                      </span>
                      <span className="text-slate-400 text-sm">&rarr;</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
