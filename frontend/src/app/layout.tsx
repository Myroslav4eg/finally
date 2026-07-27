import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans_Condensed } from "next/font/google";
import "./globals.css";

// Plex Mono carries every figure on screen; Plex Sans Condensed carries the
// labels, so the data column stays fixed-width and the chrome stays compact.
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
});

const plexCondensed = IBM_Plex_Sans_Condensed({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-plex-cond",
});

export const metadata: Metadata = {
  title: "FinAlly - AI Trading Workstation",
  description: "Live market data, a simulated portfolio, and an AI trading copilot.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${plexMono.variable} ${plexCondensed.variable} h-full`}>
      <body className="h-full">{children}</body>
    </html>
  );
}
