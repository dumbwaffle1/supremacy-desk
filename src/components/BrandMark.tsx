import { cn } from "@/lib/utils";

// Supremacy mark: an ascending price line breaking upward through a tile —
// trading + "supremacy". Lime on dark.
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative grid size-8 place-items-center overflow-hidden rounded-[9px]",
        className,
      )}
      style={{
        background:
          "linear-gradient(160deg, #0e1a05 0%, #0a0f04 60%), radial-gradient(120% 120% at 0% 0%, rgba(198,242,78,0.35), transparent 50%)",
        boxShadow:
          "inset 0 0 0 1px rgba(198,242,78,0.35), 0 6px 18px -8px rgba(198,242,78,0.5)",
      }}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" fill="none" className="size-5">
        <path
          d="M3 16.5L8.5 11L12 14L21 5"
          stroke="#c6f24e"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M21 5L21 10.5M21 5L15.5 5"
          stroke="#c6f24e"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
