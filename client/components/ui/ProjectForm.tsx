import React from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface ProjectFormProps {
  onSubmit: (name: string, script: string) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  initialName?: string;
  initialScript?: string;
}

export function ProjectForm({
  onSubmit,
  onCancel,
  isSubmitting = false,
  initialName = "",
  initialScript = "",
}: ProjectFormProps) {
  const [name, setName] = React.useState(initialName);
  const [script, setScript] = React.useState(initialScript);

  const segmentCount = script
    .split("\n")
    .filter((line) => line.trim().length > 0).length;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onSubmit(name.trim(), script);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">
          Project Name
        </label>
        <Input
          type="text"
          placeholder="My Script Project"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          className="max-w-md"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">
          Script
        </label>
        <p className="text-xs text-muted-foreground mb-2">
          Paste your script. Each line becomes a recording segment.
        </p>
        <Textarea
          placeholder="Welcome to our video...&#10;In this tutorial we'll learn...&#10;Let's get started..."
          value={script}
          onChange={(e) => setScript(e.target.value)}
          rows={6}
          className="font-mono text-sm resize-none"
        />
        {script.trim() && (
          <p className="text-xs text-muted-foreground mt-2">
            Will create {segmentCount} segment{segmentCount !== 1 ? "s" : ""}
          </p>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <Button type="submit" size="sm" disabled={isSubmitting || !name.trim()}>
          {isSubmitting ? "Creating..." : "Create Project"}
        </Button>
        <Button type="button" onClick={onCancel} variant="outline" size="sm">
          Cancel
        </Button>
      </div>
    </form>
  );
}
