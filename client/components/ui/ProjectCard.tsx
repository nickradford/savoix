import React from "react";
import { Button } from "@/components/ui/button";
import { Calendar, FileText, Play } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProjectCardProps {
  project: { id: string; name: string; createdAt: string };
  onSelectProject: (id: string) => void;
}

export function ProjectCard({ project, onSelectProject }: ProjectCardProps) {
  return (
    <div className="group animate-fade-in">
      <div
        className="bg-card border border-border rounded-xl p-5 hover:border-primary/30 hover:shadow-sm transition-all duration-200 cursor-pointer"
        onClick={() => onSelectProject(project.id)}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center size-9 rounded-lg bg-secondary">
              <FileText className="size-4 text-muted-foreground" />
            </div>
            <div>
              <h3 className="font-medium text-foreground truncate max-w-[160px]">
                {project.name}
              </h3>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="size-3" />
                {new Date(project.createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
          </div>
          {/* Action Menu/Button Placeholder */}
        </div>

        <div className="mt-4">
          <Button
            variant="secondary"
            className="w-full gap-2 text-sm"
            onClick={(e) => {
              e.stopPropagation(); // Prevent triggering card selection when clicking the button
              onSelectProject(project.id);
            }}
          >
            <Play className="size-3.5" />
            Open Project
          </Button>
        </div>
      </div>
    </div>
  );
}
