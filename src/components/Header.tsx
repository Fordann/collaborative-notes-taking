"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Header() {
  const pathname = usePathname();
  const isHome = pathname === "/";

  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg text-indigo-600">
          <span className="text-2xl">📝</span>
          <span>NotesMerge</span>
        </Link>

        {!isHome && (
          <nav className="flex items-center gap-4 text-sm">
            <Link
              href="/group/create"
              className="text-slate-600 hover:text-indigo-600 transition"
            >
              Créer un groupe
            </Link>
            <Link
              href="/group/join"
              className="text-slate-600 hover:text-indigo-600 transition"
            >
              Rejoindre
            </Link>
          </nav>
        )}
      </div>
    </header>
  );
}
