"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import FileUpload from "@/components/FileUpload";
import MemberList from "@/components/MemberList";
import LoadingSpinner from "@/components/LoadingSpinner";

interface SessionData {
  id: string;
  title: string;
  status: string;
  group: {
    id: string;
    name: string;
    courseTitle: string;
    members: {
      student: { id: string; name: string };
      isLeader: boolean;
    }[];
  };
  notes: {
    studentId: string;
  }[];
}

export default function UploadPage() {
  return (
    <Suspense fallback={<LoadingSpinner label="Chargement..." />}>
      <UploadPageInner />
    </Suspense>
  );
}

function UploadPageInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const groupId = params.groupId as string;
  const sessionId = searchParams.get("sessionId");

  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [noteContent, setNoteContent] = useState("");

  const studentId =
    typeof window !== "undefined" ? localStorage.getItem("studentId") : null;

  const fetchSession = useCallback(async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(`/api/merge/${sessionId}/status`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setSession(data);
        // Check if current student already uploaded
        if (studentId && data.notes.some((n: { studentId: string }) => n.studentId === studentId)) {
          setUploaded(true);
        }
        // Redirect if merge has started
        if (data.status === "analyzing" || data.status === "merging" || data.status === "completed") {
          router.push(`/group/${groupId}/merge/${sessionId}`);
          return;
        }

        // Auto-trigger merge if all members contributed but merge wasn't started yet
        const noteIds = new Set(data.notes.map((n: { studentId: string }) => n.studentId));
        const allMembersContributed =
          data.group.members.length >= 2 &&
          data.group.members.every((m: { student: { id: string } }) => noteIds.has(m.student.id));
        if (allMembersContributed && data.status === "collecting") {
          try {
            await fetch(`/api/merge`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sessionId }),
            });
            router.push(`/group/${groupId}/merge/${sessionId}`);
            return;
          } catch {
            // Fall through — user can still trigger manually
          }
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [sessionId, studentId]);

  useEffect(() => {
    fetchSession();
    const interval = setInterval(fetchSession, 5000);
    return () => clearInterval(interval);
  }, [fetchSession]);

  const [extracting, setExtracting] = useState(false);

  const handleFileUpload = async (file: File) => {
    // For plain text files, read directly
    if (file.type === "text/plain" || file.name.endsWith(".txt")) {
      const text = await file.text();
      setNoteContent(text);
      return;
    }

    // For PDFs and images, use server-side extraction
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
      setNoteContent(text);
    } catch {
      alert("Erreur lors de l'extraction du texte");
    } finally {
      setExtracting(false);
    }
  };

  const handleTextInput = (text: string) => {
    setNoteContent(text);
  };

  const submitNotes = async () => {
    if (!noteContent.trim() || !sessionId || !studentId) return;

    setUploading(true);
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          studentId,
          content: noteContent,
          originalType: "text",
        }),
      });
      const data = await res.json();
      setUploaded(true);
      fetchSession();

      // Auto-trigger merge if all members have contributed
      if (data.autoMerge) {
        await fetch(`/api/merge`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        router.push(`/group/${groupId}/merge/${sessionId}`);
      }
    } catch {
      alert("Erreur lors de l'upload");
    } finally {
      setUploading(false);
    }
  };

  const launchMerge = async () => {
    if (!sessionId) return;

    try {
      await fetch(`/api/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      router.push(`/group/${groupId}/merge/${sessionId}`);
    } catch {
      alert("Erreur lors du lancement du merge");
    }
  };

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center">
        <LoadingSpinner label="Chargement..." />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center">
        <p className="text-slate-500">Session introuvable</p>
      </div>
    );
  }

  const contributedStudentIds = new Set(session.notes.map((n) => n.studentId));
  const members = session.group.members.map((m) => ({
    id: m.student.id,
    name: m.student.name,
    hasContributed: contributedStudentIds.has(m.student.id),
    isLeader: m.isLeader,
    joinedAt: "",
  }));

  const isCurrentUserLeader = members.some((m) => m.id === studentId && m.isLeader);
  const allContributed = members.every((m) => m.hasContributed);
  const canMerge = session.notes.length >= 2;

  return (
    <div className="space-y-6 pb-8">
      {/* Session header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-center gap-2 text-sm text-indigo-600 mb-2">
          <button
            onClick={() => router.push(`/group/${groupId}`)}
            className="hover:text-indigo-700"
          >
            {session.group.name}
          </button>
          <span className="text-slate-300">/</span>
          <span className="text-slate-600">{session.title}</span>
        </div>
        <h1 className="text-xl font-bold text-slate-900">{session.title}</h1>
        <p className="text-sm text-slate-500 mt-1">
          {session.group.courseTitle}
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Upload area */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          {uploaded ? (
            <div className="text-center py-8 space-y-3">
              <div className="text-4xl">&#10003;</div>
              <h3 className="font-semibold text-emerald-700">
                Notes uploadees !
              </h3>
              <p className="text-sm text-slate-500">
                En attente des autres membres...
              </p>
            </div>
          ) : (
            <>
              <h3 className="font-semibold text-slate-800">
                Upload tes notes
              </h3>
              <FileUpload
                onFileSelect={handleFileUpload}
                onTextInput={handleTextInput}
                label="Notes de ce cours"
                description="PDF, image ou fichier texte"
              />
              {extracting && (
                <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-200 text-center">
                  <p className="text-xs text-indigo-700">Extraction du texte en cours...</p>
                </div>
              )}
              {noteContent && (
                <div className="space-y-3">
                  <div className="p-3 bg-slate-50 rounded-lg max-h-32 overflow-y-auto">
                    <p className="text-xs text-slate-600 whitespace-pre-wrap">
                      {noteContent.substring(0, 500)}
                      {noteContent.length > 500 ? "..." : ""}
                    </p>
                  </div>
                  <button
                    onClick={submitNotes}
                    disabled={uploading}
                    className="w-full py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition"
                  >
                    {uploading ? "Upload en cours..." : "Soumettre mes notes"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Members status */}
        <div className="space-y-4">
          <MemberList members={members} />

          {allContributed && canMerge && (
            <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200 text-center">
              <p className="text-sm text-emerald-700 font-medium">
                Tous les membres ont contribue !
              </p>
            </div>
          )}

          {canMerge && isCurrentUserLeader && (
            <button
              onClick={launchMerge}
              className="w-full py-3 rounded-xl text-sm font-medium transition bg-amber-500 text-white hover:bg-amber-600"
            >
              Lancer le merge ({session.notes.length}/{members.length} notes)
            </button>
          )}

          {!canMerge && (
            <p className="text-center text-xs text-slate-400">
              Au moins 2 notes sont necessaires pour lancer le merge
            </p>
          )}
        </div>
      </div>

      {/* Email notification option */}
      <EmailNotification sessionId={sessionId || ""} />
    </div>
  );
}

function EmailNotification({ sessionId }: { sessionId: string }) {
  const [email, setEmail] = useState("");
  const [saved, setSaved] = useState(false);

  const saveEmail = () => {
    if (!email.trim()) return;
    localStorage.setItem("studentEmail", email);
    // In a real app, this would save to the backend
    fetch("/api/students", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentId: localStorage.getItem("studentId"),
        email,
        sessionId,
      }),
    });
    setSaved(true);
  };

  if (saved) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
        <p className="text-sm text-emerald-700">
          Tu recevras un email quand le merge sera termine.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h3 className="font-medium text-slate-800 text-sm mb-2">
        Recevoir le resultat par email
      </h3>
      <p className="text-xs text-slate-500 mb-3">
        Le merge peut prendre quelques minutes. Laisse ton email pour etre
        notifie.
      </p>
      <div className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="ton.email@univ.fr"
          className="flex-1 px-4 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
        />
        <button
          onClick={saveEmail}
          disabled={!email.includes("@")}
          className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition"
        >
          Notifier
        </button>
      </div>
    </div>
  );
}
