import { RequestHandler } from "express";
import { db } from "../db";
import { projects, scriptSegments } from "../schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { hashContent, syncSegmentsWithScript } from "../services/segmentSync";

export const getProjects: RequestHandler = async (_req, res) => {
  try {
    const allProjects = await db.query.projects.findMany({
      orderBy: (projects, { desc }) => [desc(projects.createdAt)],
    });
    res.json(allProjects);
  } catch (error) {
    console.error("Error fetching projects:", error);
    res.status(500).json({ error: "Failed to fetch projects" });
  }
};

export const createProject: RequestHandler = async (req, res) => {
  try {
    const { name, description, script = "" } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Project name is required" });
    }

    const projectId = randomUUID();

    // Create project
    await db.insert(projects).values({
      id: projectId,
      name,
      description: description || "",
      script,
    });

    // Create script segments from the script (split by newlines)
    const lines = script
      .split("\n")
      .map((line: string) => line.trim())
      .filter((line: string) => line.length > 0);

    if (lines.length > 0) {
      const segmentsToInsert = lines.map((line: string, index: number) => ({
        id: randomUUID(),
        projectId,
        index,
        text: line,
        contentHash: hashContent(line),
      }));

      await db.insert(scriptSegments).values(segmentsToInsert);
    }

    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId),
    });

    res.status(201).json(project);
  } catch (error) {
    console.error("Error creating project:", error);
    res.status(500).json({ error: "Failed to create project" });
  }
};

export const getProject: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;

    const project = await db.query.projects.findFirst({
      where: eq(projects.id, id),
      with: {
        segments: {
          orderBy: (scriptSegments, { asc }) => [asc(scriptSegments.index)],
          with: {
            takes: {
              orderBy: (segmentTakes, { desc }) => [
                desc(segmentTakes.createdAt),
              ],
            },
          },
        },
      },
    });

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    res.json(project);
  } catch (error) {
    console.error("Error fetching project:", error);
    res.status(500).json({ error: "Failed to fetch project" });
  }
};

export const updateProject: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, script } = req.body;

    // Check if project exists
    const existingProject = await db.query.projects.findFirst({
      where: eq(projects.id, id),
    });

    if (!existingProject) {
      return res.status(404).json({ error: "Project not found" });
    }

    // Update project
    await db
      .update(projects)
      .set({
        name: name ?? existingProject.name,
        description: description ?? existingProject.description,
        script: script ?? existingProject.script,
      })
      .where(eq(projects.id, id));

    // If script was updated, sync segments while preserving IDs based on content hash
    if (script !== undefined && script !== existingProject.script) {
      await syncSegmentsWithScript(id, script);
    }

    const updatedProject = await db.query.projects.findFirst({
      where: eq(projects.id, id),
      with: {
        segments: {
          orderBy: (scriptSegments, { asc }) => [asc(scriptSegments.index)],
          with: {
            takes: {
              orderBy: (segmentTakes, { desc }) => [
                desc(segmentTakes.createdAt),
              ],
            },
          },
        },
      },
    });

    res.json(updatedProject);
  } catch (error) {
    console.error("Error updating project:", error);
    res.status(500).json({ error: "Failed to update project" });
  }
};

export const deleteProject: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if project exists
    const existingProject = await db.query.projects.findFirst({
      where: eq(projects.id, id),
    });

    if (!existingProject) {
      return res.status(404).json({ error: "Project not found" });
    }

    // Delete project (cascade will handle related records)
    await db.delete(projects).where(eq(projects.id, id));

    res.status(204).send();
  } catch (error) {
    console.error("Error deleting project:", error);
    res.status(500).json({ error: "Failed to delete project" });
  }
};
