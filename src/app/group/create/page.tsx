"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CreateGroupPage() {
  const router = useRouter();
  const [groupName, setGroupName] = useState("");
  const [courseTitle, setCourseTitle] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim() || !courseTitle.trim()) return;

    setLoading(true);
    const studentName = localStorage.getItem("studentName") || "Étudiant";

    try {
      // Ensure student exists (verify cached ID is still valid)
      let studentId = localStorage.getItem("studentId");
      if (studentId) {
        const checkRes = await fetch(`/api/students?id=${studentId}`);
        if (!checkRes.ok) {
          localStorage.removeItem("studentId");
          studentId = null;
        }
      }
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

      // Create group
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: groupName,
          courseTitle,
          studentId,
        }),
      });

      const group = await res.json();

      // Check if student has style profile, if not redirect to setup
      const hasStyle = localStorage.getItem("hasStyleProfile");
      if (!hasStyle) {
        router.push(`/setup?groupId=${group.id}`);
      } else {
        router.push(`/group/${group.id}`);
      }
    } catch {
      alert("Erreur lors de la création du groupe");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-slate-900">
            Créer un groupe
          </h1>
          <p className="text-sm text-slate-500">
            Invite tes camarades avec le code qui sera généré.
          </p>
        </div>

        <form
          onSubmit={handleCreate}
          className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4"
        >
          <div>
            <label className="text-sm font-medium text-slate-700 mb-1.5 block">
              Nom du groupe
            </label>
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Ex: Groupe Bio L2"
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 mb-1.5 block">
              Cours / Matière
            </label>
            <input
              type="text"
              value={courseTitle}
              onChange={(e) => setCourseTitle(e.target.value)}
              placeholder="Ex: Biologie cellulaire - Chapitre 3"
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !groupName.trim() || !courseTitle.trim()}
            className="w-full py-3 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {loading ? "Création..." : "Créer le groupe"}
          </button>
        </form>
      </div>
    </div>
  );
}
