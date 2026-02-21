"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function JoinGroupPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;

    setLoading(true);
    setError("");
    const studentName = localStorage.getItem("studentName") || "Étudiant";

    try {
      // Ensure student exists
      let studentId = localStorage.getItem("studentId");
      if (!studentId) {
        const studentRes = await fetch("/api/students", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: studentName }),
        });
        const student = await studentRes.json();
        studentId = student.id;
        localStorage.setItem("studentId", studentId!);
      }

      // Join group by code
      const res = await fetch(`/api/groups?code=${code.toUpperCase().trim()}`);
      if (!res.ok) {
        setError("Groupe introuvable. Vérifie le code.");
        return;
      }

      const group = await res.json();

      // Add member to group
      await fetch(`/api/groups/${group.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId }),
      });

      // Check if student has style profile
      const hasStyle = localStorage.getItem("hasStyleProfile");
      if (!hasStyle) {
        router.push(`/setup?groupId=${group.id}`);
      } else {
        router.push(`/group/${group.id}`);
      }
    } catch {
      setError("Erreur de connexion. Réessaie.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-slate-900">
            Rejoindre un groupe
          </h1>
          <p className="text-sm text-slate-500">
            Entre le code partagé par ton camarade.
          </p>
        </div>

        <form
          onSubmit={handleJoin}
          className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4"
        >
          <div>
            <label className="text-sm font-medium text-slate-700 mb-1.5 block">
              Code du groupe
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase());
                setError("");
              }}
              placeholder="Ex: ABC123"
              maxLength={6}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl text-center text-2xl font-mono tracking-[0.3em] focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none uppercase"
            />
          </div>

          {error && (
            <p className="text-sm text-red-500 text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || code.length < 4}
            className="w-full py-3 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {loading ? "Recherche..." : "Rejoindre"}
          </button>
        </form>
      </div>
    </div>
  );
}
