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
    transition: { delay: 0.06 * i, duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
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
      await signIn("resend", { email: email.trim() });
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  };

  return (
    <div className="relative mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <motion.div initial="hidden" animate="show" className="space-y-8">
        {/* Wordmark */}
        <motion.div custom={0} variants={fade} className="space-y-5 text-center">
          <div className="flex justify-center">
            <BrandMark className="size-12 rounded-xl" />
          </div>
          <div>
            <h1 className="font-display text-glow text-4xl font-extrabold tracking-tight">
              Supremacy Desk
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Trade home supremacy across the World Cup knockouts.
            </p>
          </div>
        </motion.div>

        {/* Stat chips */}
        <motion.div
          custom={1}
          variants={fade}
          className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground"
        >
          {["8 players", "zero-sum", "120′ settle"].map((t) => (
            <span
              key={t}
              className="rounded-full border border-border bg-secondary/40 px-2.5 py-1 uppercase tracking-wider"
            >
              {t}
            </span>
          ))}
        </motion.div>

        {/* Card */}
        <motion.div custom={2} variants={fade} className="panel rounded-2xl p-5">
          {status === "sent" ? (
            <div className="space-y-3 py-2 text-center">
              <div className="mx-auto grid size-11 place-items-center rounded-full border border-border bg-secondary/60">
                <Check className="size-5 text-brand" />
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
              <label className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Email
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@email.com"
                  className="h-11 pl-9"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <Button
                type="submit"
                className="group h-11 w-full bg-primary font-semibold text-primary-foreground hover:bg-primary/90"
                disabled={status === "sending"}
              >
                {status === "sending" ? (
                  "Sending…"
                ) : (
                  <>
                    Email me a sign-in link
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                  </>
                )}
              </Button>
              {error && <p className="text-sm text-destructive">{error}</p>}

              <div className="relative py-1 text-center">
                <span className="relative bg-transparent px-2 text-[10px] uppercase tracking-widest text-muted-foreground/70">
                  or
                </span>
              </div>

              <Button
                variant="outline"
                className="h-11 w-full border-border bg-secondary/40"
                disabled
              >
                 Sign in with Apple
                <span className="ml-1 text-[10px] text-muted-foreground">soon</span>
              </Button>
            </form>
          )}
        </motion.div>

        <motion.p
          custom={3}
          variants={fade}
          className="text-center text-[11px] leading-relaxed text-muted-foreground/70"
        >
          A private scorekeeping ledger for 8 friends. No in-app payments — cash
          settles offline.
        </motion.p>
      </motion.div>
    </div>
  );
}
