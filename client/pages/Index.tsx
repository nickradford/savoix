import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Plus, Mic, Sparkles } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Trash2,
  Play,
  FileText,
  Calendar,
  MoreVertical,
  AlertTriangle,
} from "lucide-react";
import { useProjectsList } from "@/hooks/useProjectsList";
import { ProjectForm } from "@/components/ui/ProjectForm";

export default function Index() {
  const navigate = useNavigate();
  const { projects, isLoading, createProject, deleteProject } =
    useProjectsList();
  const [isCreating, setIsCreating] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Savoix";
  }, []);

  const handleConfirmDelete = async () => {
    if (projectToDelete) {
      await deleteProject(projectToDelete);
      setProjectToDelete(null);
    }
  };

  const handleCreateProject = async (name: string, script: string) => {
    const project = await createProject(name, script);
    if (project) {
      setIsCreating(false);
      navigate(`/project/${project.id}`);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="relative">
        <div className="relative max-w-6xl mx-auto px-8 py-8">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center size-10 rounded-xl bg-gradient-to-br from-rose-500 to-rose-600 shadow-lg shadow-rose-500/20">
              <Mic className="size-5 text-white" />
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              Savoix
            </h1>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-8 py-8">
        {/* Create Project Form */}
        {isCreating && (
          <div className="mb-12 animate-in slide-in-from-top-2 duration-300">
            <div className="relative bg-card border border-border/60 rounded-2xl p-8 shadow-xl shadow-rose-500/5">
              {/* Decorative accent */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-400 via-rose-500 to-rose-400 rounded-t-2xl" />

              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center size-10 rounded-full bg-rose-100 dark:bg-rose-900/30">
                    <Sparkles className="size-5 text-rose-600 dark:text-rose-400" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold">
                      Create New Project
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Start a new voiceover recording session
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  onClick={() => setIsCreating(false)}
                  className="h-10 px-4"
                >
                  Cancel
                </Button>
              </div>
              <ProjectForm
                onSubmit={handleCreateProject}
                onCancel={() => setIsCreating(false)}
              />
            </div>
          </div>
        )}

        {/* Loading State */}
        {isLoading ? (
          <div className="text-center py-24">
            <div className="inline-flex items-center gap-3 text-muted-foreground">
              <div className="size-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
              <span className="text-base">Loading projects...</span>
            </div>
          </div>
        ) : projects.length === 0 ? (
          /* Empty State */
          <div className="text-center py-24 animate-in fade-in duration-500">
            <div className="relative inline-flex items-center justify-center mb-8">
              <div className="absolute inset-0 bg-gradient-to-br from-rose-200 to-rose-300 dark:from-rose-800/30 dark:to-rose-700/20 rounded-full blur-2xl opacity-60" />
              <div className="relative flex items-center justify-center size-20 rounded-2xl bg-gradient-to-br from-rose-100 to-rose-50 dark:from-rose-900/40 dark:to-rose-800/20 border border-rose-200/50 dark:border-rose-700/30">
                <Mic className="size-8 text-rose-500 dark:text-rose-400" />
              </div>
            </div>
            <h2 className="text-2xl font-semibold text-foreground mb-3">
              No projects yet
            </h2>
            <p className="text-base text-muted-foreground max-w-md mx-auto mb-8 leading-relaxed">
              Create your first project to start recording professional
              voiceovers with automatic transcription and script alignment.
            </p>
            <Button
              onClick={() => setIsCreating(true)}
              size="lg"
              className="gap-2 text-sm font-medium shadow-lg shadow-rose-500/15"
            >
              <Plus className="size-4" />
              Create Your First Project
            </Button>
          </div>
        ) : (
          /* Projects Grid */
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">
                Your Projects
              </h2>
              <Button
                onClick={() => setIsCreating(!isCreating)}
                size="lg"
                className="gap-2 shadow-lg shadow-rose-500/15 hover:shadow-rose-500/25 transition-all duration-300"
              >
                <Plus className="size-4" />
                New Project
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {projects.map((project, index) => (
                <div
                  key={project.id}
                  className="group animate-in fade-in slide-in-from-bottom-2 duration-300 fill-mode-backwards"
                  style={{ animationDelay: `${index * 75}ms` }}
                >
                  <div className="relative bg-card border border-border/60 rounded-xl p-6 hover:shadow-lg hover:shadow-rose-500/5 transition-all duration-300">
                    <div className="flex items-start justify-between mb-5">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center justify-center size-12 rounded-xl bg-gradient-to-br from-secondary to-secondary/80 border border-border/50 transition-all duration-300">
                          <FileText className="size-5 text-muted-foreground" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-semibold text-foreground truncate max-w-[180px]">
                            {project.name}
                          </h3>
                          <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
                            <Calendar className="size-3.5" />
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
                            className="h-9 w-9 p-0 opacity-60 hover:opacity-100 transition-all duration-200"
                          >
                            <span className="sr-only">Actions</span>
                            <MoreVertical className="size-4 text-muted-foreground" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem
                            onClick={() => setProjectToDelete(project.id)}
                            variant="destructive"
                          >
                            <Trash2 className="size-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <Button
                      variant="secondary"
                      size="lg"
                      className="w-full gap-2 group/btn hover:bg-rose-500 hover:text-white transition-all duration-200"
                      onClick={() => navigate(`/project/${project.id}`)}
                    >
                      <Play className="size-4 group-hover/btn:scale-110 transition-transform" />
                      Open Project
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!projectToDelete}
        onOpenChange={() => setProjectToDelete(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="gap-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center size-10 rounded-full bg-destructive/10">
                <AlertTriangle className="size-5 text-destructive" />
              </div>
              <DialogTitle>Delete Project</DialogTitle>
            </div>
            <DialogDescription className="text-base">
              Are you sure you want to delete this project? This action cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 mt-4">
            <Button variant="outline" onClick={() => setProjectToDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete}>
              <Trash2 className="size-4 mr-2" />
              Delete Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
