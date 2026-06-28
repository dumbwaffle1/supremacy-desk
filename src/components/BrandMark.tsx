import { cn } from "@/lib/utils";

// Supremacy mark: an ascending price line breaking upward — trading + "supremacy".
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative grid size-8 place-items-center overflow-hidden rounded-[9px]",
        className,
      )}
      style={{
        background: "linear-gradient(160deg, #0f2418 0%, #0a1410 100%)",
        boxShadow:
          "inset 0 0 0 1px rgba(25,224,124,0.3), 0 4px 14px -6px rgba(25,224,124,0.4)",
      }}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" fill="none" className="size-5">
        <path
          d="M3 16.5L8.5 11L12 14L21 5"
          stroke="#19e07c"
          strokeWidth="2.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M21 5L21 10.5M21 5L15.5 5"
          stroke="#19e07c"
          strokeWidth="2.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
