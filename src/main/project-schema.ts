import path from "node:path";
import { z } from "zod";
import {
  normalizeNodeVersion,
  type ProjectConfig,
} from "../shared/contracts";

const projectConfigSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  path: z.string().trim().min(1),
  nodeVersion: z.string().trim().min(1),
  startCommand: z.string().trim().min(1),
});

export function parseProjectConfig(project: ProjectConfig): ProjectConfig {
  const parsedProject = projectConfigSchema.parse(project);

  return {
    ...parsedProject,
    path: path.resolve(parsedProject.path),
    nodeVersion: normalizeNodeVersion(parsedProject.nodeVersion),
  };
}
