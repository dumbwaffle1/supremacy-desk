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
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>

      <div className="panel rounded-2xl p-5">
        <div className="flex items-center gap-2 text-primary">
          <Sparkles className="size-4" />
          <span className="text-xs font-semibold uppercase tracking-wider">
            Coming soon
          </span>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{blurb}</p>
        <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-[11px]">
          <span className="size-1.5 rounded-full bg-primary" />
          <span className="tnum text-foreground">{comingIn}</span>
        </div>
      </div>
    </section>
  );
}
