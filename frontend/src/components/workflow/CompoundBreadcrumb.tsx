import { ChevronRight } from "lucide-react";

export interface CompoundNavEntry {
  parentNodes: any[];
  parentEdges: any[];
  compoundNodeId: string;
  label: string;
}

interface CompoundBreadcrumbProps {
  navStack: CompoundNavEntry[];
  onNavigateToLevel: (level: number) => void;
}

export default function CompoundBreadcrumb({
  navStack,
  onNavigateToLevel,
}: CompoundBreadcrumbProps) {
  if (navStack.length === 0) return null;

  return (
    <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 bg-card border border-border rounded-lg px-3 py-1.5 shadow-lg text-sm">
      <button
        onClick={() => onNavigateToLevel(-1)}
        className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer font-medium"
      >
        Main
      </button>
      {navStack.map((entry, index) => {
        const isLast = index === navStack.length - 1;
        return (
          <span key={entry.compoundNodeId} className="flex items-center gap-1">
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
            {isLast ? (
              <span className="font-semibold text-foreground">{entry.label}</span>
            ) : (
              <button
                onClick={() => onNavigateToLevel(index)}
                className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer font-medium"
              >
                {entry.label}
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
}
