import { useState, useRef, useCallback } from "react";
import { Type, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  DEFAULT_FONT_SETTINGS,
  type FontFamily,
} from "@/hooks/useFontSettings";

interface FontControlsProps {
  scriptFontFamily: FontFamily;
  setScriptFontFamily: (family: FontFamily) => void;
  scriptFontSize: number;
  setScriptFontSize: (size: number) => void;
}

export function FontControls({
  scriptFontFamily,
  setScriptFontFamily,
  scriptFontSize,
  setScriptFontSize,
}: FontControlsProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const collapseTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const clearCollapseTimeout = useCallback(() => {
    if (collapseTimeoutRef.current) {
      clearTimeout(collapseTimeoutRef.current);
      collapseTimeoutRef.current = null;
    }
  }, []);

  const startCollapseTimer = useCallback(() => {
    clearCollapseTimeout();
    collapseTimeoutRef.current = setTimeout(() => {
      setIsExpanded(false);
    }, 2500);
  }, [clearCollapseTimeout]);

  const handleMouseEnter = useCallback(() => {
    clearCollapseTimeout();
    setIsExpanded(true);
  }, [clearCollapseTimeout]);

  const handleMouseLeave = useCallback(() => {
    startCollapseTimer();
  }, [startCollapseTimer]);

  const handleClick = useCallback(() => {
    clearCollapseTimeout();
    setIsExpanded(true);
  }, [clearCollapseTimeout]);

  return (
    <div
      className="absolute top-4 right-4 z-10"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Collapsed State - Just the Icon */}
      <div
        className={cn(
          "absolute right-0 top-0 transition-all duration-300 ease-out",
          isExpanded
            ? "opacity-0 scale-90 pointer-events-none"
            : "opacity-100 scale-100",
        )}
      >
        <button
          onClick={handleClick}
          className={cn(
            "flex items-center justify-center size-8 rounded-md",
            "bg-card/90 backdrop-blur-sm border border-border/50",
            "shadow-sm hover:shadow-md hover:border-border",
            "text-muted-foreground hover:text-foreground",
            "transition-all duration-200",
          )}
          aria-label="Open font controls"
        >
          <Type className="size-4" />
        </button>
      </div>

      {/* Expanded State - Full Controls */}
      <div
        className={cn(
          "flex items-center gap-3 rounded-lg border border-border/50 shadow-sm",
          "bg-card/90 backdrop-blur-sm px-3 py-2",
          "transition-all duration-300 ease-out origin-right",
          isExpanded
            ? "opacity-100 scale-100 translate-x-0"
            : "opacity-0 scale-95 translate-x-4 pointer-events-none",
        )}
      >
        {/* Font Family Buttons */}
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={scriptFontFamily === "sans" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setScriptFontFamily("sans")}
                className="h-7 px-2 text-xs font-sans"
              >
                Aa
              </Button>
            </TooltipTrigger>
            <TooltipContent>Sans-serif</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={scriptFontFamily === "serif" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setScriptFontFamily("serif")}
                className="h-7 px-2 text-xs font-serif"
              >
                Aa
              </Button>
            </TooltipTrigger>
            <TooltipContent>Serif</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={scriptFontFamily === "mono" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setScriptFontFamily("mono")}
                className="h-7 px-2 text-xs font-mono"
              >
                Aa
              </Button>
            </TooltipTrigger>
            <TooltipContent>Monospace</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={
                  scriptFontFamily === "dyslexic" ? "secondary" : "ghost"
                }
                size="sm"
                onClick={() => setScriptFontFamily("dyslexic")}
                className="h-7 px-2 text-[10px] font-dyslexic"
              >
                Aa
              </Button>
            </TooltipTrigger>
            <TooltipContent>OpenDyslexic - easier reading</TooltipContent>
          </Tooltip>
        </div>

        {/* Divider */}
        <div className="w-px h-5 bg-border" />

        {/* Font Size Slider */}
        <div className="flex items-center gap-2 w-24">
          <span className="text-xs text-muted-foreground tabular-nums w-8">
            {scriptFontSize}px
          </span>
          <Slider
            value={[scriptFontSize]}
            onValueChange={([value]) => setScriptFontSize(value)}
            min={16}
            max={72}
            step={2}
            className="flex-1"
          />
        </div>

        {/* Divider */}
        <div className="w-px h-5 bg-border" />

        {/* Reset Button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setScriptFontFamily(DEFAULT_FONT_SETTINGS.fontFamily);
                setScriptFontSize(DEFAULT_FONT_SETTINGS.fontSize);
              }}
              className="h-6 w-6 p-0"
            >
              <RotateCcw className="size-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Reset to defaults</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
