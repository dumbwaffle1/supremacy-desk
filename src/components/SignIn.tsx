"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { ArrowRight, Check, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BrandMark } from "@/components/BrandMark";

const fade = {
  hidden: { opacity: 0, y: 12 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.06 * i, duration: 0.45, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

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
      // Send the magic link back to the exact page we're on (e.g. /join/<code>),
      // so deep links survive sign-in — see auth.ts redirect callback.
      await signIn("resend", {
        email: email.trim(),
        redirectTo: window.location.origin + window.location.pathname,
      });
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <motion.div initial="hidden" animate="show" className="space-y-7">
        <motion.div custom={0} variants={fade} className="space-y-4">
          <BrandMark className="size-11 rounded-xl" />
          <div>
            <h1 className="text-[28px] font-semibold leading-tight tracking-tight">
              Supremacy Desk
            </h1>
            <p className="mt-1.5 text-[15px] text-muted-foreground">
              Trade home supremacy across the World Cup knockouts.
            </p>
          </div>
        </motion.div>

        <motion.div custom={1} variants={fade} className="panel rounded-2xl p-5">
          {status === "sent" ? (
            <div className="space-y-3 py-1 text-center">
              <div className="mx-auto grid size-11 place-items-center rounded-full bg-primary/15">
                <Check className="size-5 text-primary" />
              </div>
              <div>
                <p className="font-medium">Check your email</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Sign-in link sent to{" "}
                  <span className="text-foreground">{email}</span>.
                </p>
              </div>
              {process.env.NODE_ENV !== "production" && (
                <p className="text-xs text-muted-foreground/80">
                  Dev: the link is also in your{" "}
                  <span className="tnum">npx convex dev</span> logs.
                </p>
              )}
              <button
                type="button"
                className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                onClick={() => setStatus("idle")}
              >
                Use a different email
              </button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-3">
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@email.com"
                  className="h-12 pl-9 text-[15px]"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <Button
                type="submit"
                className="group h-12 w-full text-[15px] font-semibold"
                disabled={status === "sending"}
              >
                {status === "sending" ? (
                  "Sending…"
                ) : (
                  <>
                    Continue with email
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                  </>
                )}
              </Button>
              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button
                variant="outline"
                className="h-12 w-full border-border bg-transparent text-[15px] text-muted-foreground"
                disabled
              >
                 Continue with Apple
                <span className="ml-1 text-[11px]">soon</span>
              </Button>
            </form>
          )}
        </motion.div>

        <motion.p
          custom={2}
          variants={fade}
          className="px-2 text-center text-xs leading-relaxed text-muted-foreground/70"
        >
          A private scorekeeping ledger for 8 friends. No in-app payments — cash
          settles offline.
        </motion.p>
      </motion.div>
    </div>
  );
}
