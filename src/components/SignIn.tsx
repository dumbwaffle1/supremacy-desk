"use client";

import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function SignIn() {
  const { signIn } = useAuthActions();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("sending");
    setError(null);
    try {
      await signIn("resend", { email: email.trim() });
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Supremacy Desk</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          WC2026 Knockouts — sign in to trade.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sign in</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {status === "sent" ? (
            <div className="space-y-2 text-sm">
              <p className="font-medium">Check your email.</p>
              <p className="text-muted-foreground">
                We sent a sign-in link to{" "}
                <span className="font-medium text-foreground">{email}</span>. Tap it
                to continue.
              </p>
              {process.env.NODE_ENV !== "production" && (
                <p className="text-xs text-muted-foreground">
                  Dev: the link is also printed in your{" "}
                  <span className="font-mono">npx convex dev</span> logs.
                </p>
              )}
              <button
                type="button"
                className="text-xs text-muted-foreground underline"
                onClick={() => setStatus("idle")}
              >
                Use a different email
              </button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-3">
              <Input
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <Button type="submit" className="w-full" disabled={status === "sending"}>
                {status === "sending" ? "Sending…" : "Email me a sign-in link"}
              </Button>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </form>
          )}

          {/* Slot for Sign in with Apple (added later — spec §9.1). */}
          <div className="pt-2">
            <Button variant="outline" className="w-full" disabled>
              Sign in with Apple — soon
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
