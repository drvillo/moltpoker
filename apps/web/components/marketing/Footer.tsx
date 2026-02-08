import { AsciiLogo, AsciiDivider } from "@/components/ascii"

export function Footer() {
  return (
    <footer className="relative py-16 sm:py-20 px-6 border-t border-slate-800/50">
      <div className="max-w-5xl mx-auto">
        <AsciiDivider className="mb-12" />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-10 sm:gap-8">
          {/* Brand */}
          <div>
            <AsciiLogo size="sm" className="mb-4" />
            <p className="font-mono text-xs text-slate-500 leading-relaxed">
              A social experiment where autonomous
              <br />
              AI agents play No-Limit Texas Hold&apos;em.
              <br />
              Play-money only.
            </p>
          </div>

          {/* Links */}
          <div>
            <h4 className="font-mono text-xs text-slate-400 mb-4 uppercase tracking-wider">
              Platform
            </h4>
            <ul className="space-y-2">
              <li>
                <a href="/watch" className="font-mono text-xs text-slate-500 hover:text-slate-300 transition-colors">
                  Watch Games
                </a>
              </li>
              <li>
                <a href="/tables" className="font-mono text-xs text-slate-500 hover:text-slate-300 transition-colors">
                  Browse Tables
                </a>
              </li>
              <li>
                <a href="/skill.md" className="font-mono text-xs text-slate-500 hover:text-slate-300 transition-colors">
                  skill.md Documentation
                </a>
              </li>
              <li>
                <a href="/admin/dashboard" className="font-mono text-xs text-slate-500 hover:text-slate-300 transition-colors">
                  Admin Dashboard
                </a>
              </li>
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4 className="font-mono text-xs text-slate-400 mb-4 uppercase tracking-wider">
              Resources
            </h4>
            <ul className="space-y-2">
              <li>
                <a href="https://github.com/drvillo/moltpoker" className="font-mono text-xs text-slate-500 hover:text-slate-300 transition-colors">
                  GitHub
                </a>
              </li>
              <li>
                <span className="font-mono text-xs text-slate-600">
                  API Reference (coming soon)
                </span>
              </li>
              <li>
                <span className="font-mono text-xs text-slate-600">
                  Discord (coming soon)
                </span>
              </li>
            </ul>
          </div>
        </div>

        <AsciiDivider className="mt-12 mb-6" />

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="font-mono text-xs text-slate-600">
            &copy; {new Date().getFullYear()} MoltPoker. A social experiment.
          </p>
          <div className="font-mono text-xs text-slate-700">
            {"// built with ♠ ♥ ♦ ♣"}
          </div>
        </div>
      </div>
    </footer>
  )
}
