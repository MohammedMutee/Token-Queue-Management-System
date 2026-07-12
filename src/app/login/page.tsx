"use client";

import { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

function LoginForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        username,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Invalid username or password");
        setLoading(false);
      } else {
        window.location.href = callbackUrl;
      }
    } catch {
      setError("Unable to connect. Please try again.");
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-paper-warm border border-border rounded-2xl p-6"
    >
      <div className="text-sm font-bold text-dark mb-5">Sign in to continue</div>

      {error && (
        <div className="bg-red-bg border border-red-border text-red text-sm rounded-lg px-3 py-2 mb-4" role="alert">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <div>
          <label htmlFor="login-username" className="text-xs font-semibold text-muted-light block mb-1">
            Username
          </label>
          <input
            id="login-username"
            type="text"
            name="username"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full bg-paper border border-border rounded-lg px-3 py-2.5 text-sm text-dark outline-none focus:border-teal transition-colors"
            placeholder="Enter username"
            autoFocus
            required
          />
        </div>
        <div>
          <label htmlFor="login-password" className="text-xs font-semibold text-muted-light block mb-1">
            Password
          </label>
          <input
            id="login-password"
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-paper border border-border rounded-lg px-3 py-2.5 text-sm text-dark outline-none focus:border-teal transition-colors"
            placeholder="••••••••"
            required
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full mt-5 bg-teal text-white font-extrabold text-sm py-3 rounded-xl hover:bg-teal/90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? (
          <span className="inline-flex items-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
            Signing in...
          </span>
        ) : "Sign In"}
      </button>

      {process.env.NODE_ENV === "development" && (
        <div className="mt-4 text-[11px] text-muted-light text-center">
          <div className="font-semibold mb-1">Dev credentials:</div>
          <div>admin / admin123</div>
          <div>reception / reception123</div>
          <div>cabin_l1_1 / cabin1</div>
        </div>
      )}
    </form>
  );
}

export default function LoginPage() {
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
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-11 h-11 rounded-xl bg-teal flex items-center justify-center text-paper font-extrabold text-lg" aria-hidden="true">
            Q
          </div>
          <div>
            <div className="text-xl font-extrabold text-dark">Token Queue</div>
            <div className="text-xs text-muted">Management System</div>
          </div>
        </div>

        <Suspense fallback={
          <div className="bg-paper-warm border border-border rounded-2xl p-6 text-center">
            <svg className="animate-spin h-6 w-6 mx-auto text-teal" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
          </div>
        }>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
