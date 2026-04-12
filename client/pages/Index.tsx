import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Plus, Play, Trash2, Mic, FileText, Calendar } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  segmentCount?: number;
  takeCount?: number;
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
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="flex justify-between items-center">
            <div className="flex items-baseline gap-3">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                ScriptFlow
              </h1>
              <span className="text-muted-foreground text-sm hidden sm:inline">
                Record, transcribe, refine
              </span>
            </div>
            <Button
              onClick={() => setIsCreating(!isCreating)}
              size="sm"
              className="gap-2"
            >
              <Plus className="size-4" />
              New Project
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-6 py-10">
        {isCreating && (
          <div className="mb-10 animate-slide-up">
            <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-base font-medium">Create New Project</h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setIsCreating(false);
                    setNewProjectName("");
                    setNewProjectScript("");
                  }}
                >
                  Cancel
                </Button>
              </div>

              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    Project Name
                  </label>
                  <Input
                    type="text"
                    placeholder="My Script Project"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
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
                    value={newProjectScript}
                    onChange={(e) => setNewProjectScript(e.target.value)}
                    rows={6}
                    className="font-mono text-sm resize-none"
                  />
                  {newProjectScript.trim() && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Will create {segmentCount} segment
                      {segmentCount !== 1 ? "s" : ""}
                    </p>
                  )}
                </div>

                <div className="flex gap-2 pt-1">
                  <Button onClick={handleCreateProject} size="sm">
                    Create Project
                  </Button>
                  <Button
                    onClick={() => {
                      setIsCreating(false);
                      setNewProjectName("");
                      setNewProjectScript("");
                    }}
                    variant="outline"
                    size="sm"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-20">
            <div className="inline-flex items-center gap-2 text-muted-foreground">
              <div className="size-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">Loading projects...</span>
            </div>
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-20 animate-fade-in">
            <div className="inline-flex items-center justify-center size-12 rounded-full bg-secondary mb-5">
              <Mic className="size-5 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-medium text-foreground mb-2">
              No projects yet
            </h2>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-6">
              Create your first project to start recording and transcribing
              scripts.
            </p>
            <Button onClick={() => setIsCreating(true)} size="sm">
              <Plus className="size-4 mr-1.5" />
              Create Project
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project, index) => (
              <div
                key={project.id}
                className="group animate-fade-in"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="bg-card border border-border rounded-xl p-5 hover:border-primary/30 hover:shadow-sm transition-all duration-200">
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
                          {new Date(project.createdAt).toLocaleDateString(
                            undefined,
                            {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            },
                          )}
                        </p>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <span className="sr-only">Actions</span>
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 12 12"
                            fill="currentColor"
                            className="text-muted-foreground"
                          >
                            <circle cx="6" cy="2" r="1" />
                            <circle cx="6" cy="6" r="1" />
                            <circle cx="6" cy="10" r="1" />
                          </svg>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => handleDeleteProject(project.id)}
                          className="text-destructive"
                        >
                          <Trash2 className="size-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <Link to={`/project/${project.id}`}>
                    <Button
                      variant="secondary"
                      className="w-full gap-2 text-sm"
                      size="sm"
                    >
                      <Play className="size-3.5" />
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
