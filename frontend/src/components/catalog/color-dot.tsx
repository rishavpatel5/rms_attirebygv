import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Swatch = {
  hex: string;
  ring?: string;
};

const RAW_COLOR_SWATCHES = [
  ["Airforce", "#5d8aa8"],
  ["Beige", "#d8c3a5"],
  ["Black", "#111827"],
  ["Blue", "#2563eb"],
  ["Brown", "#8b5a2b"],
  ["Camo Grey", "#6f7774"],
  ["Cloudy Grey", "#b7bdc3"],
  ["Cocoa", "#6f4e37"],
  ["Cream", "#fff4d6"],
  ["Dark Grey", "#4b5563"],
  ["Dusk Blue", "#4f6f91"],
  ["Dusty Beige", "#c8b7a6"],
  ["Dusty Green", "#7d8b6d"],
  ["Green", "#16a34a"],
  ["Grey", "#9ca3af"],
  ["Gun Metal", "#2f3437"],
  ["L.Grey", "#d1d5db"],
  ["Light Blue", "#93c5fd"],
  ["Light Grey", "#e5e7eb"],
  ["Light Pink", "#f9a8d4"],
  ["Maroon", "#7f1d1d"],
  ["Matte Black", "#18181b"],
  ["Mouse", "#6b625f"],
  ["Mustard Yellow", "#d4a017"],
  ["Navy", "#1e3a8a"],
  ["Off-White", "#f8f4e8"],
  ["Peach", "#ffc4a3"],
  ["Pink", "#ec4899"],
  ["Pool Blue", "#38bdf8"],
  ["Red", "#dc2626"],
  ["Sage Green", "#9caf88"],
  ["Salmon", "#fa8072"],
  ["Sea Green", "#2e8b57"],
  ["Skin", "#f1c6a8"],
  ["Stone Blue", "#6b7f99"],
  ["Stone Grey", "#7f817a"],
  ["Teal", "#0f766e"],
  ["White", "#ffffff"],
  ["Yellow", "#facc15"],
] as const;

function normalizeColorName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/[\s_-]+/g, " ");
}

const SWATCHES = new Map<string, Swatch>(
  RAW_COLOR_SWATCHES.map(([name, hex]) => [
    normalizeColorName(name),
    {
      hex,
      ring: ["Cream", "L.Grey", "Light Grey", "Off-White", "White", "Yellow"].includes(name)
        ? "#9ca3af"
        : "rgba(0,0,0,0.2)",
    },
  ]),
);

const KNOWN_COLOR_NAMES = [...RAW_COLOR_SWATCHES.map(([name]) => name)].sort(
  (a, b) => b.length - a.length,
);

export const COLOR_SWATCH_COUNT = RAW_COLOR_SWATCHES.length;

export function resolveColorName(input?: string | null): string | null {
  if (!input?.trim()) return null;
  const normalized = normalizeColorName(input);
  if (SWATCHES.has(normalized)) {
    return KNOWN_COLOR_NAMES.find((name) => normalizeColorName(name) === normalized) ?? input.trim();
  }
  return (
    KNOWN_COLOR_NAMES.find((name) => {
      const key = normalizeColorName(name);
      return normalized === key || normalized.startsWith(`${key} /`) || normalized.includes(` ${key} /`);
    }) ?? null
  );
}

export function ColorDot({
  colorName,
  className,
}: {
  colorName?: string | null;
  className?: string;
}) {
  const resolvedName = resolveColorName(colorName);
  if (!resolvedName) return null;
  const swatch = SWATCHES.get(normalizeColorName(resolvedName));
  if (!swatch) return null;

  const style: CSSProperties = {
    backgroundColor: swatch.hex,
    borderColor: swatch.ring,
  };

  return (
    <span
      aria-label={resolvedName}
      title={resolvedName}
      className={cn("inline-block size-2.5 shrink-0 rounded-full border", className)}
      style={style}
    />
  );
}

export function ColorLabel({
  colorName,
  children,
  className,
  dotClassName,
}: {
  colorName?: string | null;
  children: ReactNode;
  className?: string;
  dotClassName?: string;
}) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      <ColorDot colorName={colorName} className={dotClassName} />
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}
