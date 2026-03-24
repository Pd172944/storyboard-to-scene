import type { Metadata } from "next";
import { Cormorant_Garamond, Space_Grotesk } from "next/font/google";
import { TRPCProvider } from "@/lib/trpc/provider";
import "./globals.css";

const sans = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
});

const display = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Storyboard Studio | Cinematic AI Previsualization",
  description:
    "Sketch scenes, lock character identity, and generate cinematic AI previews with a production-grade workflow.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`dark ${sans.variable} ${display.variable}`}>
      <body className="min-h-screen bg-[var(--bg)] font-sans text-[var(--text-primary)] antialiased">
        <TRPCProvider>{children}</TRPCProvider>
      </body>
    </html>
  );
}
