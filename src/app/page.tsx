"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState("");

  const handleContinue = (action: "create" | "join") => {
    if (!name.trim()) return;
    localStorage.setItem("studentName", name.trim());

    if (action === "create") {
      router.push("/group/create");
    } else {
      router.push("/group/join");
    }
  };

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center">
      <div className="w-full max-w-md space-y-8">
        {/* Hero */}
        <div className="text-center space-y-3">
          <h1 className="text-4xl font-bold text-slate-900">NotesMerge</h1>
          <p className="text-lg text-slate-500">
            Fusionne les notes de ton groupe.
            <br />
            <span className="text-indigo-600 font-medium">
              Recois un PDF dans TON style.
            </span>
          </p>
        </div>

        {/* How it works */}
        <div className="grid grid-cols-3 gap-3 py-4">
          {[
            { icon: "1.", label: "Upload tes notes" },
            { icon: "2.", label: "L'IA fusionne" },
            { icon: "3.", label: "PDF personnalise" },
          ].map((step, i) => (
            <div
              key={i}
              className="text-center p-3 rounded-xl bg-white border border-slate-100"
            >
              <div className="text-lg font-bold text-indigo-600 mb-1">
                {step.icon}
              </div>
              <p className="text-xs text-slate-600">{step.label}</p>
            </div>
          ))}
        </div>

        {/* Name input */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700 mb-1.5 block">
              Ton prenom
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Marie, Theo..."
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) {
                  handleContinue("create");
                }
              }}
            />
          </div>

          {name.trim() && (
            <div className="space-y-2.5">
              <button
                onClick={() => handleContinue("create")}
                className="w-full py-3 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition flex items-center justify-center gap-2"
              >
                Creer un groupe
              </button>
              <button
                onClick={() => handleContinue("join")}
                className="w-full py-3 bg-white text-indigo-600 border-2 border-indigo-200 rounded-xl text-sm font-medium hover:bg-indigo-50 transition flex items-center justify-center gap-2"
              >
                Rejoindre un groupe
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-slate-400">
          Pas de compte requis. Juste ton prenom et c&apos;est parti.
        </p>
      </div>
    </div>
  );
}
