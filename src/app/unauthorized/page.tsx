import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm text-muted hover:text-dark transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.5 15l-5-5 5-5"/></svg>
            Back
          </Link>
        </div>
        <div className="text-center">
          <div className="text-6xl mb-4 text-muted-light">403</div>
          <div className="text-xl font-bold text-dark mb-2">Access Denied</div>
          <div className="text-sm text-muted mb-6">You don&apos;t have permission to access this page.</div>
          <Link href="/" className="text-sm font-bold text-teal hover:underline">
            Go to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
