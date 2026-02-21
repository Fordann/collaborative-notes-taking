import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/Header";

export const metadata: Metadata = {
  title: "NotesMerge - Fusionne tes notes de cours",
  description:
    "Chaque étudiant uploade ses notes, l'IA les fusionne, chacun reçoit un PDF personnalisé dans SON style d'écriture.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className="antialiased min-h-screen">
        <Header />
        <main className="max-w-5xl mx-auto px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
