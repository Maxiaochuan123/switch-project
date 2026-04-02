import Store from "electron-store";
import type { ProjectConfig } from "../shared/contracts";
import { parseProjectConfig } from "./project-schema";

type StoreShape = {
  projects: ProjectConfig[];
};

export class ProjectStore {
  private readonly store = new Store<StoreShape>({
    name: "switch-project-panel",
    defaults: {
      projects: [],
    },
  });

  listProjects() {
    return [...this.store.get("projects")].sort((left, right) =>
      left.name.localeCompare(right.name, "zh-CN")
    );
  }

  getProject(projectId: string) {
    return this.listProjects().find((project) => project.id === projectId);
  }

  saveProject(project: ProjectConfig) {
    const nextProject = parseProjectConfig(project);
    const projects = this.listProjects();
    const projectIndex = projects.findIndex(
      (currentProject) => currentProject.id === nextProject.id
    );

    if (projectIndex >= 0) {
      projects[projectIndex] = nextProject;
    } else {
      projects.push(nextProject);
    }

    this.store.set("projects", projects);
  }

  deleteProject(projectId: string) {
    const projects = this.listProjects().filter((project) => project.id !== projectId);
    this.store.set("projects", projects);
  }
}
