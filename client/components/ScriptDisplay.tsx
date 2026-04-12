import { useCallback } from "react";

interface ScriptDisplayProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  isEditable?: boolean;
  highlightedWord?: string;
  currentTime?: number;
}

export function ScriptDisplay({
  value,
  onChange,
  onBlur,
  isEditable = true,
  highlightedWord,
  currentTime,
}: ScriptDisplayProps) {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
    },
    [onChange]
  );

  return (
    <div className="flex flex-col bg-white border border-border rounded-lg overflow-hidden h-full">
      <div className="px-6 py-4 border-b border-border bg-gray-50">
        <h2 className="font-semibold text-foreground">Script</h2>
        {currentTime !== undefined && (
          <p className="text-xs text-muted-foreground mt-1">
            Time: {(currentTime / 1000).toFixed(1)}s
          </p>
        )}
      </div>
      <div className="flex-1 overflow-auto p-6">
        {isEditable ? (
          <textarea
            value={value}
            onChange={handleChange}
            onBlur={onBlur}
            placeholder="Paste your script here..."
            className="w-full h-full resize-none border-0 focus:outline-none focus:ring-0 text-sm leading-relaxed font-mono"
          />
        ) : (
          <div className="whitespace-pre-wrap text-sm leading-relaxed font-mono text-foreground">
            {value}
          </div>
        )}
      </div>
    </div>
  );
}
