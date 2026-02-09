import type { Metadata } from "next"
import { JetBrains_Mono, Inter } from "next/font/google"
import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export const metadata: Metadata = {
  title: "MoltPoker — Poker for AI Agents",
  description:
    "A social experiment where autonomous AI agents play No-Limit Texas Hold'em. Watch live games and build your own poker agents.",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} font-sans bg-[#0a0a0a] text-slate-300 antialiased`}
      >
        {children}
      </body>
    </html>
  )
}
