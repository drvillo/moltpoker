"use client"

interface AsciiLogoProps {
  size?: "sm" | "md" | "lg"
  className?: string
  animated?: boolean
}

export function AsciiLogo({ size = "md", className = "", animated = false }: AsciiLogoProps) {
  const animClass = animated ? "animate-fade-in" : ""

  if (size === "sm") {
    return (
      <span className={`font-mono text-slate-100 font-bold tracking-wider ${animClass} ${className}`}>
        {"MOLT"}
        <span className="text-emerald-400">{"POKER"}</span>
      </span>
    )
  }

  if (size === "lg") {
    return (
      <pre className={`font-mono text-emerald-400 select-none leading-tight ${animClass} ${className}`}>
{`
 ███╗   ███╗ ██████╗ ██╗  ████████╗
 ████╗ ████║██╔═══██╗██║  ╚══██╔══╝
 ██╔████╔██║██║   ██║██║     ██║   
 ██║╚██╔╝██║██║   ██║██║     ██║   
 ██║ ╚═╝ ██║╚██████╔╝███████╗██║   
 ╚═╝     ╚═╝ ╚═════╝ ╚══════╝╚═╝   
 ██████╗  ██████╗ ██╗  ██╗███████╗██████╗ 
 ██╔══██╗██╔═══██╗██║ ██╔╝██╔════╝██╔══██╗
 ██████╔╝██║   ██║█████╔╝ █████╗  ██████╔╝
 ██╔═══╝ ██║   ██║██╔═██╗ ██╔══╝  ██╔══██╗
 ██║     ╚██████╔╝██║  ██╗███████╗██║  ██║
 ╚═╝      ╚═════╝ ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝`}
      </pre>
    )
  }

  return (
    <pre className={`font-mono text-emerald-400 select-none text-xs sm:text-sm leading-tight ${animClass} ${className}`}>
{` __  __  ___  _  _____
|  \\/  |/ _ \\| ||_   _|
| |\\/| | | | | |  | |  
| |  | | |_| | |__| |  
|_|  |_|\\___/|____|_|  
 ___  ___  _  _____  ___
| _ \\/ _ \\| |/ / _ \\| _ \\
|  _/ (_) |   <  __/|   /
|_|  \\___/|_|\\_\\___||_|_\\`}
    </pre>
  )
}

export function AsciiDivider({ className = "" }: { className?: string }) {
  return (
    <div className={`font-mono text-slate-700 text-xs select-none overflow-hidden ${className}`}>
      {"─".repeat(80)}
    </div>
  )
}

export function AsciiSectionHeader({
  title,
  className = "",
}: {
  title: string
  className?: string
}) {
  const padded = ` ${title} `
  const totalWidth = 50
  const sideLen = Math.max(0, Math.floor((totalWidth - padded.length) / 2))
  const left = "─".repeat(sideLen)
  const right = "─".repeat(totalWidth - sideLen - padded.length)

  return (
    <div className={`font-mono text-sm select-none text-center ${className}`}>
      <span className="text-slate-600">{`┤${left}`}</span>
      <span className="text-slate-300">{padded}</span>
      <span className="text-slate-600">{`${right}├`}</span>
    </div>
  )
}
