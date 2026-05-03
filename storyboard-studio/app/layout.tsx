import type { Metadata } from "next";
import { Inter, Cormorant_Garamond } from "next/font/google";
import { TRPCProvider } from "@/lib/trpc/provider";
import "./globals.css";

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const display = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Storyboard Studio — Cinematic AI Previsualization",
  description:
    "Drop a photo, pick a shot, get a cinematic scene in seconds. Character-consistent sequences with voice.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`}>
      <body className="min-h-screen bg-[var(--bg)] font-sans text-[var(--text-primary)] antialiased">
        <TRPCProvider>{children}</TRPCProvider>
      </body>
    </html>
  );
}
