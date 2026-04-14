import React from "react";
import { Badge } from "@/components/ui/badge";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";

interface Segment {
  id: string;
  projectId: string;
  index: number;
  text: string;
  takes: any[];
}

interface SegmentListProps {
  segments: Segment[];
  currentIndex: number;
  onSelectSegment: (index: number) => void;
}

export function SegmentList({
  segments,
  currentIndex,
  onSelectSegment,
}: SegmentListProps) {
  return (
    <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between">
      <h2 className="text-sm font-medium">Segments</h2>
      <Badge variant="secondary" className="text-xs font-normal tabular-nums">
        {segments.length}
      </Badge>
    </div>
  );
}

interface SegmentItemProps {
  segment: Segment;
  index: number;
  isActive: boolean;
  onClick: () => void;
  className?: string;
}

export const SegmentItem = React.forwardRef<
  HTMLButtonElement,
  SegmentItemProps
>(function SegmentItem(
  { segment, index, isActive, onClick, className }: SegmentItemProps,
  ref,
) {
  const activeTakes = segment.takes.filter((t: any) => !t.deletedAt);
  const activeTakeCount = activeTakes.length;
  const hasSelectedTake = activeTakes.some((t: any) => t.isSelected);

  return (
    <button
      ref={ref}
      onClick={onClick}
      className={cn(
        "w-full text-left px-3 py-2.5 rounded-md text-sm transition-colors",
        isActive
          ? "bg-secondary text-foreground"
          : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        <span className="font-mono text-xs opacity-50 mt-0.5 tabular-nums">
          {String(index + 1).padStart(2, "0")}
        </span>
        <span className="truncate flex-1">{segment.text}</span>
      </div>
      {activeTakeCount > 0 && (
        <div className="mt-1 ml-6 text-xs opacity-50 tabular-nums flex items-center gap-1">
          {hasSelectedTake ? (
            <Heart className="w-3 h-3 fill-rose-500 text-rose-500" />
          ) : (
            <>
              {activeTakeCount} take{activeTakeCount !== 1 ? "s" : ""}
            </>
          )}
        </div>
      )}
    </button>
  );
});
