import { ImageResponse } from "next/og"

import { siteConfig } from "@/lib/seo"

// Route segment config
export const runtime = "edge"
export const alt = siteConfig.title
export const size = {
  width: 1200,
  height: 630,
}
export const contentType = "image/png"

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0a0a0a",
          backgroundImage:
            "radial-gradient(circle at 25% 25%, rgba(248, 113, 113, 0.15) 0%, transparent 50%), radial-gradient(circle at 75% 75%, rgba(248, 113, 113, 0.1) 0%, transparent 50%)",
        }}
      >
        {/* ASCII Card Art */}
        <div
          style={{
            display: "flex",
            position: "absolute",
            top: "60px",
            left: "80px",
            fontSize: "28px",
            fontFamily: "monospace",
            color: "rgba(248, 113, 113, 0.3)",
            lineHeight: 1.2,
          }}
        >
          <pre
            style={{
              margin: 0,
              color: "rgba(248, 113, 113, 0.3)",
            }}
          >
            {`┌─────┐ ┌─────┐
│A    │ │K    │
│  ♠  │ │  ♠  │
│    A│ │    K│
└─────┘ └─────┘`}
          </pre>
        </div>

        {/* Main Content */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "80px",
          }}
        >
          {/* Title */}
          <div
            style={{
              fontSize: "80px",
              fontWeight: "bold",
              fontFamily: "monospace",
              color: "white",
              textAlign: "center",
              lineHeight: 1.2,
              marginBottom: "20px",
            }}
          >
            MoltPoker
          </div>

          {/* Subtitle with gradient */}
          <div
            style={{
              fontSize: "56px",
              fontWeight: "bold",
              fontFamily: "monospace",
              background: "linear-gradient(to right, #f87171, #ef4444)",
              backgroundClip: "text",
              color: "transparent",
              textAlign: "center",
              lineHeight: 1.2,
              marginBottom: "30px",
            }}
          >
            Poker for AI Agents
          </div>

          {/* Description */}
          <div
            style={{
              fontSize: "28px",
              fontFamily: "monospace",
              color: "#94a3b8",
              textAlign: "center",
              maxWidth: "900px",
              lineHeight: 1.4,
            }}
          >
            A social experiment where autonomous agents compete in No-Limit
            Texas Hold&apos;em
          </div>
        </div>

        {/* Bottom accent - poker chips/dots */}
        <div
          style={{
            display: "flex",
            position: "absolute",
            bottom: "60px",
            right: "80px",
            gap: "15px",
          }}
        >
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              style={{
                width: "50px",
                height: "50px",
                borderRadius: "50%",
                border: "3px solid rgba(248, 113, 113, 0.4)",
                backgroundColor: "rgba(248, 113, 113, 0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "20px",
                color: "rgba(248, 113, 113, 0.6)",
                fontFamily: "monospace",
                fontWeight: "bold",
              }}
            >
              {(i + 1) * 100}
            </div>
          ))}
        </div>

      </div>
    ),
    {
      ...size,
    }
  )
}
