import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";

export interface ProjectListItem {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  segmentCount?: number;
  takeCount?: number;
}

export function useProjectsList() {
  const { toast } = useToast();
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProjects = useCallback(async () => {
    try {
      const response = await fetch("/api/projects");
      if (response.ok) {
        const data = await response.json();
        setProjects(data);
      } else {
        toast({
          title: "Error",
          description: "Failed to load projects",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error fetching projects:", error);
      toast({
        title: "Error",
        description: "Failed to load projects",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const createProject = useCallback(
    async (name: string, script: string): Promise<ProjectListItem | null> => {
      try {
        const response = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, description: "", script }),
        });

        if (response.ok) {
          const project = await response.json();
          setProjects((prev) => [project, ...prev]);
          return project;
        } else {
          toast({
            title: "Error",
            description: "Failed to create project",
            variant: "destructive",
          });
          return null;
        }
      } catch (error) {
        console.error("Error creating project:", error);
        toast({
          title: "Error",
          description: "Failed to create project",
          variant: "destructive",
        });
        return null;
      }
    },
    [toast],
  );

  const deleteProject = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        const response = await fetch(`/api/projects/${id}`, {
          method: "DELETE",
        });

        if (response.ok) {
          setProjects((prev) => prev.filter((p) => p.id !== id));
          toast({ title: "Success", description: "Project deleted" });
          return true;
        } else {
          toast({
            title: "Error",
            description: "Failed to delete project",
            variant: "destructive",
          });
          return false;
        }
      } catch (error) {
        console.error("Error deleting project:", error);
        toast({
          title: "Error",
          description: "Failed to delete project",
          variant: "destructive",
        });
        return false;
      }
    },
    [toast],
  );

  return {
    projects,
    isLoading,
    fetchProjects,
    createProject,
    deleteProject,
  };
}
