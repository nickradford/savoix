import React, { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Save } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

interface ScriptEditorAreaProps {
  initialContent: string;
  onUpdateScript: (script: string) => void;
  isSaving: boolean;
  onSave: () => Promise<void>;
  onCancel: () => void;
  originalContent: string;
}

export function ScriptEditorArea({
  initialContent,
  onUpdateScript,
  isSaving,
  onSave,
  onCancel,
  originalContent,
}: ScriptEditorAreaProps) {
  const hasChanges = initialContent !== originalContent;

  const handleCancel = () => {
    if (hasChanges) {
      const confirmed = window.confirm(
        "You have unsaved changes. Are you sure you want to discard them?",
      );
      if (!confirmed) return;
    }
    onUpdateScript(originalContent);
    onCancel();
  };

  return (
    <div className="flex-1 flex flex-col p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-medium text-foreground">Edit Script</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Each line becomes a recording segment.
            {initialContent && (
              <span>
                Will create{" "}
                {Math.max(
                  1,
                  initialContent
                    .split("\\n")
                    .filter((line) => line.trim().length > 0).length,
                )}{" "}
                segments.
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={onSave} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save"}
          </Button>
          <Button onClick={handleCancel} variant="outline">
            Cancel
          </Button>
        </div>
      </div>

      {/* Textarea */}
      <Textarea
        value={initialContent}
        onChange={(e) => onUpdateScript(e.target.value)}
        placeholder="Paste your script here... Each line will become a separate recording segment."
        className="flex-1 font-mono text-sm leading-relaxed resize-none"
      />
    </div>
  );
}
