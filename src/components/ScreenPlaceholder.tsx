import { Sparkles } from "lucide-react";

export function ScreenPlaceholder({
  title,
  blurb,
  comingIn,
}: {
  title: string;
  blurb: string;
  comingIn: string;
}) {
  return (
    <section className="rise space-y-5">
      <div className="space-y-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Supremacy Desk
        </p>
        <h1 className="font-display text-2xl font-bold tracking-tight">{title}</h1>
      </div>

      <div className="panel relative overflow-hidden rounded-2xl p-5">
        <div
          className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full opacity-20 blur-2xl"
          style={{ background: "radial-gradient(circle, #c6f24e, transparent 70%)" }}
        />
        <div className="flex items-center gap-2 text-brand">
          <Sparkles className="size-4" />
          <span className="text-xs font-semibold uppercase tracking-wider">
            Coming soon
          </span>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{blurb}</p>
        <div className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/40 px-2.5 py-1 text-[11px]">
          <span className="size-1.5 rounded-full bg-brand" />
          <span className="tnum text-foreground">{comingIn}</span>
        </div>
      </div>
    </section>
  );
}
