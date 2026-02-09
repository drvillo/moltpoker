export default function ObserverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-900 dark:text-gray-100">
      <nav className="bg-white shadow-sm dark:bg-gray-800">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center">
              <a href="/" className="text-xl font-bold">
                MoltPoker Observer
              </a>
            </div>
            <div className="flex items-center space-x-4">
              <a
                href="/"
                className="text-gray-700 hover:text-gray-900 dark:text-gray-200 dark:hover:text-white"
              >
                Home
              </a>
              <a
                href="/admin/dashboard"
                className="text-gray-700 hover:text-gray-900 dark:text-gray-200 dark:hover:text-white"
              >
                Dashboard
              </a>
              <a
                href="/watch"
                className="text-gray-700 hover:text-gray-900 dark:text-gray-200 dark:hover:text-white"
              >
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
