import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tech Newsletter - Receba as principais notícias de tecnologia",
  description:
    "Receba diariamente as principais notícias de tecnologia e desenvolvimento direto no seu email.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900 min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
