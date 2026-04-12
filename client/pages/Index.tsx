import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Plus, Play, Trash2, MoreVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: string;
}

export default function Index() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectScript, setNewProjectScript] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  // Fetch projects from API
  useEffect(() => {
    const fetchProjects = async () => {
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
    };

    fetchProjects();
  }, [toast]);

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) {
      toast({
        title: "Error",
        description: "Project name is required",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newProjectName,
          description: "",
          script: newProjectScript,
        }),
      });

      if (response.ok) {
        const project = await response.json();
        setProjects([project, ...projects]);
        setNewProjectName("");
        setNewProjectScript("");
        setIsCreating(false);
        navigate(`/project/${project.id}`);
      } else {
        toast({
          title: "Error",
          description: "Failed to create project",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error creating project:", error);
      toast({
        title: "Error",
        description: "Failed to create project",
        variant: "destructive",
      });
    }
  };

  const handleDeleteProject = async (id: string) => {
    try {
      const response = await fetch(`/api/projects/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setProjects(projects.filter((p) => p.id !== id));
        toast({
          title: "Success",
          description: "Project deleted",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to delete project",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error deleting project:", error);
      toast({
        title: "Error",
        description: "Failed to delete project",
        variant: "destructive",
      });
    }
  };

  // Calculate number of segments from script
  const segmentCount = newProjectScript
    .split("\n")
    .filter((line) => line.trim().length > 0).length;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-foreground">ScriptFlow</h1>
              <p className="text-muted-foreground mt-2">
                Record, transcribe, and label your scripts
              </p>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <Button
                onClick={() => setIsCreating(!isCreating)}
                className="gap-2"
              >
                <Plus className="w-4 h-4" />
                New Project
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-12">
        {isCreating && (
          <div className="mb-8 p-6 bg-card border border-border rounded-lg">
            <h2 className="text-lg font-semibold mb-4">Create New Project</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Project Name *
                </label>
                <Input
                  type="text"
                  placeholder="My Script Project"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Script
                </label>
                <p className="text-xs text-muted-foreground mb-2">
                  Paste your script here. Each line will become a separate
                  recording segment.
                </p>
                <Textarea
                  placeholder="Welcome to our video...&#10;In this tutorial we'll learn...&#10;Let's get started..."
                  value={newProjectScript}
                  onChange={(e) => setNewProjectScript(e.target.value)}
                  rows={8}
                  className="font-mono resize-none"
                />
                {newProjectScript.trim() && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Will create {segmentCount} segment
                    {segmentCount !== 1 ? "s" : ""}
                  </p>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <Button onClick={handleCreateProject} className="gap-2">
                  <Plus className="w-4 h-4" />
                  Create Project
                </Button>
                <Button
                  onClick={() => {
                    setIsCreating(false);
                    setNewProjectName("");
                    setNewProjectScript("");
                  }}
                  variant="outline"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-16">
            <p className="text-muted-foreground">Loading projects...</p>
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-16">
            <div className="mb-6">
              <svg
                className="w-16 h-16 mx-auto text-muted-foreground opacity-50"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-semibold text-foreground mb-2">
              No projects yet
            </h2>
            <p className="text-muted-foreground mb-8">
              Create your first project to get started recording and
              transcribing scripts.
            </p>
            <Button
              onClick={() => setIsCreating(true)}
              className="gap-2"
              size="lg"
            >
              <Plus className="w-4 h-4" />
              Create Your First Project
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project) => (
              <div
                key={project.id}
                className="bg-card border border-border rounded-lg hover:shadow-md transition-shadow"
              >
                <div className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-lg font-semibold text-foreground truncate">
                      {project.name}
                    </h3>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => handleDeleteProject(project.id)}
                          className="text-destructive"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <p className="text-sm text-muted-foreground mb-6">
                    {new Date(project.createdAt).toLocaleDateString()}
                  </p>

                  <Link to={`/project/${project.id}`}>
                    <Button className="w-full gap-2">
                      <Play className="w-4 h-4" />
                      Open Project
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
