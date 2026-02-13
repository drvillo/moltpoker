import type { Metadata } from "next"

// Marketing routes inherit comprehensive metadata from root layout
// Add route-specific overrides here only if needed
export const metadata: Metadata = {}

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
