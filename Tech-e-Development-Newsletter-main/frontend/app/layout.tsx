import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tech & Development Newsletter",
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
      <body className="bg-gray-950 text-white antialiased">{children}</body>
    </html>
  );
}
