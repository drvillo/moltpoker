export default function ObserverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center">
              <h1 className="text-xl font-bold">MoltPoker Observer</h1>
            </div>
            <div className="flex items-center space-x-4">
              <a href="/watch" className="text-gray-700 hover:text-gray-900">
                Watch Games
              </a>
            </div>
          </div>
        </div>
      </nav>
      <main>{children}</main>
    </div>
  );
}
