"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import MemberList from "@/components/MemberList";
import LoadingSpinner from "@/components/LoadingSpinner";

interface GroupData {
  id: string;
  name: string;
  code: string;
  courseTitle: string;
  members: {
    id: string;
    student: { id: string; name: string };
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

  const fetchGroup = useCallback(async () => {
    try {
      const res = await fetch(`/api/groups/${groupId}`);
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
    // Poll for updates every 10s
    const interval = setInterval(fetchGroup, 10000);
    return () => clearInterval(interval);
  }, [fetchGroup]);

  const copyCode = () => {
    if (group) {
      navigator.clipboard.writeText(group.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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
    hasContributed: m.hasContributed,
    joinedAt: m.joinedAt,
  }));

  return (
    <div className="space-y-6 pb-8">
      {/* Group header */}
      <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl p-6 text-white">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">{group.name}</h1>
            <p className="text-indigo-100 text-sm mt-1">{group.courseTitle}</p>
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

      <div className="grid gap-6 md:grid-cols-2">
        {/* Members */}
        <MemberList members={members} />

        {/* New session */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <h3 className="font-semibold text-slate-800">
            Nouvelle session de notes
          </h3>
          <p className="text-xs text-slate-500">
            Cree une session pour un cours, puis chaque membre uploade ses notes.
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

      {/* Sessions list */}
      {group.sessions.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-slate-800">Sessions de notes</h3>
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
    </div>
  );
}
