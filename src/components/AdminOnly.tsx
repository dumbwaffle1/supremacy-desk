"use client";

import { ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

// Client-side gate for admin-only content. Server-side mutations are separately
// protected via requireAdmin() in convex/users.ts — this is just UX.
export function AdminOnly({ children }: { children: ReactNode }) {
  const me = useQuery(api.users.me);

  if (me === undefined) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  if (!me?.isAdmin) {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-semibold tracking-tight">Admin</h1>
        <p className="text-sm text-muted-foreground">
          This area is for the admin only.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}
