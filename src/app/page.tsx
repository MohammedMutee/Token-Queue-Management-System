"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";

export default function Home() {
  const { data: session, status } = useSession();
  const [signingOut, setSigningOut] = useState(false);

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <svg className="animate-spin h-8 w-8 text-teal" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          <div className="text-sm text-muted">Loading...</div>
        </div>
      </div>
    );
  }

  const role = session?.user?.role;
  const userName = session?.user?.name;

  const links = [
    { href: "/display", label: "TV DISPLAY", title: "Queue Display Screen", desc: "Full-screen view for waiting hall TV", roles: null },
    { href: "/reception", label: "RECEPTION", title: "Token Issuance Desk", desc: "Issue and reactivate tokens", roles: ["RECEPTION", "ADMIN"] },
    { href: "/cabin", label: "CABIN OPERATOR", title: "Cabin Processing", desc: "Call, approve, and manage tokens", roles: ["CABIN_OPERATOR", "ADMIN"] },
    { href: "/admin", label: "ADMIN", title: "Administration", desc: "Manage levels, cabins, users, sessions", roles: ["ADMIN"] },
  ];

  const visibleLinks = links.filter((l) => !l.roles || (role && l.roles.includes(role)));

  function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    signOut({ callbackUrl: "/login" });
  }

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center">
      <div className="max-w-md w-full mx-4">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-teal flex items-center justify-center text-paper font-extrabold text-xl" aria-hidden="true">
              Q
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-dark">Token Queue</h1>
              <p className="text-sm text-muted">Management System</p>
            </div>
          </div>
          {session && (
            <div className="text-right">
              <div className="text-sm font-semibold text-dark">{userName}</div>
              <button
                onClick={handleSignOut}
                disabled={signingOut}
                className="text-xs text-red hover:underline transition-colors disabled:opacity-50"
              >
                {signingOut ? "Signing out..." : "Sign out"}
              </button>
            </div>
          )}
        </div>

        {!session && (
          <Link
            href="/login"
            className="block bg-teal text-white font-extrabold text-sm text-center py-3 rounded-xl mb-4 hover:bg-teal/90"
          >
            Sign In
          </Link>
        )}

        <div className="flex flex-col gap-3">
          {visibleLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="block bg-paper-warm border border-border rounded-xl p-5 hover:border-teal transition-colors"
            >
              <div className="text-xs font-bold tracking-widest text-muted-light mb-1">{link.label}</div>
              <div className="text-base font-bold text-dark">{link.title}</div>
              <div className="text-sm text-muted mt-1">{link.desc}</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
