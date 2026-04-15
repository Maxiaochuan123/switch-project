import { useCallback, useEffect, useRef, useState } from "react";
import { desktopApi } from "@/lib/desktop";
import type {
  DesktopEnvironment,
  ProjectConfig,
  ProjectDirectoryInspection,
  ProjectGroup,
  ProjectPackageManager,
} from "@/shared/contracts";
import {
  createEmptyProjectDraft,
  createSuggestionSnapshot,
  EMPTY_DRAFT_SUGGESTIONS,
  getSuggestedPackageManager,
  getSuggestedStartCommand,
  mergeNodeVersionLists,
  selectBestAvailableNodeVersion,
  shouldApplySuggestedValue,
  type DraftSuggestionSnapshot,
  type ProjectDraft,
} from "./project-draft";
import { getErrorMessage } from "./helpers";

type UseProjectFormStateOptions = {
  environment: DesktopEnvironment;
  projectGroups: ProjectGroup[];
  onFormError: (message: string | null) => void;
};

export function useProjectFormState({
  environment,
  projectGroups,
  onFormError,
}: UseProjectFormStateOptions) {
  const [isProjectDialogOpen, setIsProjectDialogOpen] = useState(false);
  const [projectDraft, setProjectDraft] = useState<ProjectDraft>(createEmptyProjectDraft());
  const [pathInspection, setPathInspection] = useState<ProjectDirectoryInspection | null>(null);
  const [isInspectingProject, setIsInspectingProject] = useState(false);
  const [inspectionNotice, setInspectionNotice] = useState<"idle" | "success" | "error">("idle");
  const [dropzoneError, setDropzoneError] = useState("");
  const [shouldInspectPath, setShouldInspectPath] = useState(false);

  const draftSuggestionRef = useRef<DraftSuggestionSnapshot>(EMPTY_DRAFT_SUGGESTIONS);
  const currentDraftRef = useRef<ProjectDraft>(createEmptyProjectDraft());
  const allowEditInspectionAutofillRef = useRef(false);

  useEffect(() => {
    currentDraftRef.current = projectDraft;
  }, [projectDraft]);

  const resetFormState = useCallback(() => {
    onFormError(null);
    setPathInspection(null);
    setIsInspectingProject(false);
    setInspectionNotice("idle");
    setDropzoneError("");
    setShouldInspectPath(false);
    draftSuggestionRef.current = EMPTY_DRAFT_SUGGESTIONS;
    allowEditInspectionAutofillRef.current = false;
  }, [onFormError]);

  const applyInspectionSuggestions = useCallback(
    (inspection: ProjectDirectoryInspection | null) => {
      if (!inspection) {
        return;
      }

      const nextSuggestions = createSuggestionSnapshot(inspection);
      const suggestedPackageManager = getSuggestedPackageManager(
        inspection,
        environment.availablePackageManagers
      );
      const suggestedStartCommand = getSuggestedStartCommand(inspection, suggestedPackageManager);
      const availableNodeVersions = mergeNodeVersionLists(
        environment.installedNodeVersions,
        environment.nvmInstalledNodeVersions
      );
      const suggestedNodeVersion = selectBestAvailableNodeVersion(
        inspection.nodeVersionHint ?? inspection.recommendedNodeVersion,
        availableNodeVersions,
        environment.activeNodeVersion
      );
      const currentDraft = currentDraftRef.current;
      const allowEditInspectionAutofill = allowEditInspectionAutofillRef.current;

      nextSuggestions.packageManager = suggestedPackageManager;
      nextSuggestions.startCommand = suggestedStartCommand;
      nextSuggestions.nodeVersion = suggestedNodeVersion;

      if (currentDraft.id && !allowEditInspectionAutofill) {
        draftSuggestionRef.current = nextSuggestions;
        return;
      }

      const nextDraft = { ...currentDraft };
      let changed = false;

      if (currentDraft.id && allowEditInspectionAutofill) {
        if (nextSuggestions.name && currentDraft.name !== nextSuggestions.name) {
          nextDraft.name = nextSuggestions.name;
          changed = true;
        }

        if (nextSuggestions.nodeVersion && currentDraft.nodeVersion !== nextSuggestions.nodeVersion) {
          nextDraft.nodeVersion = nextSuggestions.nodeVersion;
          changed = true;
        }

        if (
          nextSuggestions.packageManager &&
          currentDraft.packageManager !== nextSuggestions.packageManager
        ) {
          nextDraft.packageManager = nextSuggestions.packageManager;
          changed = true;
        }

        if (
          nextSuggestions.startCommand &&
          currentDraft.startCommand !== nextSuggestions.startCommand
        ) {
          nextDraft.startCommand = nextSuggestions.startCommand;
          changed = true;
        }
      } else {
        if (
          shouldApplySuggestedValue(currentDraft.name, draftSuggestionRef.current.name) &&
          currentDraft.name !== nextSuggestions.name
        ) {
          nextDraft.name = nextSuggestions.name;
          changed = true;
        }

        if (
          shouldApplySuggestedValue(
            currentDraft.nodeVersion,
            draftSuggestionRef.current.nodeVersion
          ) &&
          currentDraft.nodeVersion !== nextSuggestions.nodeVersion
        ) {
          nextDraft.nodeVersion = nextSuggestions.nodeVersion;
          changed = true;
        }

        if (
          shouldApplySuggestedValue(
            currentDraft.packageManager,
            draftSuggestionRef.current.packageManager
          ) &&
          currentDraft.packageManager !== nextSuggestions.packageManager
        ) {
          nextDraft.packageManager = nextSuggestions.packageManager;
          changed = true;
        }

        if (
          shouldApplySuggestedValue(
            currentDraft.startCommand,
            draftSuggestionRef.current.startCommand
          ) &&
          currentDraft.startCommand !== nextSuggestions.startCommand
        ) {
          nextDraft.startCommand = nextSuggestions.startCommand;
          changed = true;
        }
      }

      if (changed) {
        setProjectDraft(nextDraft);
      }

      allowEditInspectionAutofillRef.current = false;
      draftSuggestionRef.current = nextSuggestions;
    },
    [
      environment.activeNodeVersion,
      environment.availablePackageManagers,
      environment.installedNodeVersions,
      environment.nvmInstalledNodeVersions,
    ]
  );

  const inspectPath = useCallback(
    async (selectedPath: string) => {
      if (!selectedPath.trim()) {
        setPathInspection(null);
        setIsInspectingProject(false);
        return;
      }

      setIsInspectingProject(true);

      try {
        const inspection = await desktopApi.inspectProjectDirectory(selectedPath);

        if (!inspection.exists || !inspection.isDirectory) {
          setPathInspection(null);
          setDropzoneError("请拖入项目文件夹");
          setInspectionNotice("error");
          return;
        }

        setPathInspection(inspection);
        setDropzoneError("");
        setInspectionNotice("success");
        applyInspectionSuggestions(inspection);
      } catch (error) {
        setPathInspection(null);
        setInspectionNotice("error");
        onFormError(getErrorMessage(error));
      } finally {
        setIsInspectingProject(false);
      }
    },
    [applyInspectionSuggestions, isProjectDialogOpen, onFormError]
  );

  useEffect(() => {
    const trimmedPath = projectDraft.path.trim();
    if (!trimmedPath) {
      setPathInspection(null);
      setIsInspectingProject(false);
      return;
    }

    if (!shouldInspectPath) {
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!cancelled) {
        void inspectPath(trimmedPath);
      }
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [inspectPath, projectDraft.path, shouldInspectPath]);

  const handleDropzonePath = useCallback(
    async (selectedPath: string) => {
      const currentDraft = currentDraftRef.current;
      if (currentDraft.id && currentDraft.path !== selectedPath) {
        allowEditInspectionAutofillRef.current = true;
      }

      // 立即打开窗口，让识别逻辑在窗口内展示
      setIsProjectDialogOpen(true);
      setShouldInspectPath(true);
      setProjectDraft((current) =>
        current.path === selectedPath ? current : { ...current, path: selectedPath }
      );
      setDropzoneError("");
      setInspectionNotice("idle");
      onFormError(null);
      setIsInspectingProject(true);
    },
    [onFormError]
  );

  const handleBrowseProjectPath = useCallback(async () => {
    try {
      const selectedPath = await desktopApi.browseProjectDirectory(projectDraft.path);

      if (selectedPath) {
        await handleDropzonePath(selectedPath);
      }
    } catch (error) {
      onFormError(getErrorMessage(error));
    }
  }, [handleDropzonePath, onFormError, projectDraft.path]);

  const handlePackageManagerChange = useCallback(
    (packageManager: ProjectPackageManager) => {
      setProjectDraft((current) => {
        const nextDraft = { ...current, packageManager };
        if (
          shouldApplySuggestedValue(current.startCommand, draftSuggestionRef.current.startCommand)
        ) {
          nextDraft.startCommand = getSuggestedStartCommand(pathInspection, packageManager);
        }
        return nextDraft;
      });

      draftSuggestionRef.current = {
        ...draftSuggestionRef.current,
        packageManager,
        startCommand: getSuggestedStartCommand(pathInspection, packageManager),
      };
    },
    [pathInspection]
  );

  const handleProjectDialogOpenChange = useCallback(
    (nextOpen: boolean) => {
      setIsProjectDialogOpen(nextOpen);
      if (!nextOpen) {
        setProjectDraft(createEmptyProjectDraft());
        resetFormState();
      }
    },
    [resetFormState]
  );

  const openCreateDialog = useCallback((groupId: string | null = null) => {
    resetFormState();
    setProjectDraft({
      ...createEmptyProjectDraft(),
      groupId,
    });
    setShouldInspectPath(true);
    setIsProjectDialogOpen(true);
  }, [resetFormState]);

  const openEditDialog = useCallback(
    (project: ProjectConfig) => {
      resetFormState();
      setProjectDraft({
        id: project.id,
        name: project.name,
        path: project.path,
        groupId: project.groupId ?? null,
        nodeVersion: project.nodeVersion,
        packageManager: project.packageManager,
        startCommand: project.startCommand,
        autoStartOnAppLaunch: project.autoStartOnAppLaunch,
        autoOpenLocalUrlOnStart: project.autoOpenLocalUrlOnStart,
      });
      setShouldInspectPath(false);
      setIsProjectDialogOpen(true);
    },
    [resetFormState]
  );

  return {
    dropzoneError,
    handleBrowseProjectPath,
    handleDropzonePath,
    handlePackageManagerChange,
    handleProjectDialogOpenChange,
    inspectionNotice,
    isInspectingProject,
    isProjectDialogOpen,
    openCreateDialog,
    openEditDialog,
    pathInspection,
    projectDraft,
    projectGroups,
    setProjectDraft,
  };
}
