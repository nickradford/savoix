import { useState, useEffect, useCallback } from "react";

export interface Project {
  id: string;
  name: string;
  description: string;
  script: string; // The full script text
  createdAt: string;
}

/**
 * Custom hook to fetch and manage project data from the API.
 * @param projectId ID of the project to load.
 */
export const useProjectDataFetcher = (projectId: string | null) => {
  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch project data whenever projectId changes
  useEffect(() => {
    if (!projectId) {
      setProject(null);
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    const fetchProject = async () => {
      try {
        const response = await fetch(`/api/projects/${projectId}`);
        if (response.ok) {
          const data: Project & { segments?: any[] } = await response.json(); // Assuming type casting for now
          setProject(data);
        } else {
          setError("Failed to load project");
        }
      } catch (e) {
        console.error(e);
        setError("Network error while fetching project");
      } finally {
        isMounted && setIsLoading(false);
      }
    };

    fetchProject();

    return () => {
      isMounted = false;
    };
  }, [projectId]);

  // Helper to calculate segment count (moved from component body)
  const getSegmentCount = useCallback((script: string): number => {
    return script.split("\\n").filter((line) => line.trim().length > 0).length;
  }, []);

  return { project, isLoading, error, getSegmentCount };
};
