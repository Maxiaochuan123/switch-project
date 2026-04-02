import {
  execFile,
  execFileSync,
  spawn,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import {
  normalizeNodeVersion,
  type ProjectConfig,
  type ProjectLogEntry,
  type ProjectLogLevel,
  type ProjectRuntime,
} from "../shared/contracts";
import { resolveNvmHome } from "./node-versions";

const execFileAsync = promisify(execFile);
const ansiEscapePattern = new RegExp(String.raw`\u001B\[[0-9;]*m`, "g");
const maxLogEntries = 200;
const runtimeUpdateDelayMs = 150;

type RuntimeEntry = {
  child: ChildProcessWithoutNullStreams;
  expectedStop: boolean;
  lastOutput: string;
  logSequence: number;
  logs: ProjectLogEntry[];
  updateTimer: ReturnType<typeof setTimeout> | null;
  runtime: ProjectRuntime;
};

export class ProjectRuntimeManager {
  private readonly runtimes = new Map<string, RuntimeEntry>();

  constructor(private readonly onRuntimeUpdate: (runtime: ProjectRuntime) => void) {}

  async startProject(project: ProjectConfig) {
    if (this.runtimes.has(project.id)) {
      return;
    }

    const projectPath = path.resolve(project.path);
    const startedAt = new Date().toISOString();

    if (!existsSync(projectPath) || !statSync(projectPath).isDirectory()) {
      const message = `项目路径不存在：${projectPath}`;
      const runtime = {
        projectId: project.id,
        status: "error" as const,
        startedAt,
        lastMessage: message,
        recentLogs: [this.createLogEntry(project.id, 0, "system", message)],
      };

      this.onRuntimeUpdate(runtime);
      throw new Error(runtime.lastMessage);
    }

    const nodeDirectory = this.resolveNodeDirectory(project.nodeVersion);

    if (!existsSync(path.join(nodeDirectory, "node.exe"))) {
      const message = `本机未通过 nvm-windows 安装 Node ${normalizeNodeVersion(project.nodeVersion)}。`;
      const runtime = {
        projectId: project.id,
        status: "error" as const,
        startedAt,
        lastMessage: message,
        recentLogs: [this.createLogEntry(project.id, 0, "system", message)],
      };

      this.onRuntimeUpdate(runtime);
      throw new Error(runtime.lastMessage);
    }

    const child = spawn("cmd.exe", ["/d", "/s", "/c", project.startCommand], {
      cwd: projectPath,
      env: {
        ...process.env,
        PATH: this.buildRuntimePath(nodeDirectory),
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    const entry: RuntimeEntry = {
      child,
      expectedStop: false,
      lastOutput: "",
      logSequence: 0,
      logs: [],
      updateTimer: null,
      runtime: {
        projectId: project.id,
        status: "starting",
        pid: child.pid,
        startedAt,
      },
    };

    this.runtimes.set(project.id, entry);
    this.pushLogs(entry, "system", [
      `正在使用 Node v${normalizeNodeVersion(project.nodeVersion)} 启动「${project.name}」。`,
      `启动命令：${project.startCommand}`,
    ]);
    this.emitRuntimeUpdate(entry);

    child.once("spawn", () => {
      if (this.runtimes.get(project.id) !== entry) {
        return;
      }

      entry.runtime = {
        ...entry.runtime,
        status: "running",
        pid: child.pid,
      };

      this.emitRuntimeUpdate(entry);
    });

    child.stdout.on("data", (chunk) => {
      const hasOutput = this.captureOutput(entry, chunk, "stdout");

      if (!hasOutput || this.runtimes.get(project.id) !== entry) {
        return;
      }

      this.scheduleRuntimeUpdate(entry);
    });

    child.stderr.on("data", (chunk) => {
      const hasOutput = this.captureOutput(entry, chunk, "stderr");

      if (!hasOutput || this.runtimes.get(project.id) !== entry) {
        return;
      }

      this.scheduleRuntimeUpdate(entry);
    });

    child.on("error", (error) => {
      if (this.runtimes.get(project.id) !== entry) {
        return;
      }

      this.runtimes.delete(project.id);
      this.clearScheduledUpdate(entry);
      this.pushLogs(entry, "system", [`进程异常：${error.message}`]);
      this.onRuntimeUpdate({
        ...entry.runtime,
        status: "error",
        lastMessage: error.message,
      });
    });

    child.on("exit", (code) => {
      if (this.runtimes.get(project.id) !== entry) {
        return;
      }

      this.runtimes.delete(project.id);
      this.clearScheduledUpdate(entry);

      if (entry.expectedStop) {
        this.pushLogs(entry, "system", ["已从面板停止。"]);
        this.onRuntimeUpdate({
          projectId: project.id,
          status: "stopped",
          exitCode: code ?? undefined,
          lastMessage: "已从面板停止。",
          recentLogs: [...entry.logs],
        });
        return;
      }

      if (code === 0 || code === null) {
        this.pushLogs(entry, "system", ["进程已结束。"]);
        this.onRuntimeUpdate({
          projectId: project.id,
          status: "stopped",
          exitCode: code ?? undefined,
          lastMessage: "进程已结束。",
          recentLogs: [...entry.logs],
        });
        return;
      }

      this.pushLogs(entry, "system", [
        entry.lastOutput || `进程异常退出，退出码 ${code}。`,
      ]);
      this.onRuntimeUpdate({
        projectId: project.id,
        status: "error",
        exitCode: code ?? undefined,
        lastMessage:
          entry.lastOutput || `进程异常退出，退出码 ${code}。`,
        recentLogs: [...entry.logs],
      });
    });
  }

  async stopProject(projectId: string) {
    const entry = this.runtimes.get(projectId);

    if (!entry || !entry.child.pid) {
      return;
    }

    entry.expectedStop = true;

    try {
      await execFileAsync("taskkill", ["/PID", String(entry.child.pid), "/T", "/F"]);
      this.disposeEntry(projectId, entry, "已从面板停止。");
    } catch (error) {
      entry.expectedStop = false;

      const errorMessage = this.extractProcessError(error);
      if (errorMessage.includes("not found") || errorMessage.includes("There is no running instance")) {
        this.disposeEntry(projectId, entry, "进程已经结束。");
        return;
      }

      entry.runtime = {
        ...entry.runtime,
        lastMessage: errorMessage,
      };
      this.onRuntimeUpdate(entry.runtime);
      throw new Error(errorMessage);
    }
  }

  stopAllSync() {
    for (const [projectId, entry] of this.runtimes.entries()) {
      if (!entry.child.pid) {
        continue;
      }

      try {
        execFileSync("taskkill", ["/PID", String(entry.child.pid), "/T", "/F"], {
          stdio: "ignore",
        });
      } catch {
        // Ignore teardown failures when the app is closing.
      }

      this.disposeEntry(projectId, entry, "应用关闭时已停止。");
    }
  }

  private buildRuntimePath(nodeDirectory: string) {
    const currentPath = process.env.PATH ?? "";
    const nvmHome = this.getNvmHome().toLowerCase();
    const nvmSymlink = (process.env.NVM_SYMLINK ?? "").toLowerCase();

    const filteredPath = currentPath
      .split(path.delimiter)
      .filter(Boolean)
      .filter((segment) => {
        const normalizedSegment = segment.toLowerCase();

        if (normalizedSegment === nodeDirectory.toLowerCase()) {
          return false;
        }

        if (nvmSymlink && normalizedSegment === nvmSymlink) {
          return false;
        }

        return !normalizedSegment.startsWith(`${nvmHome}\\v`);
      });

    return [nodeDirectory, ...filteredPath].join(path.delimiter);
  }

  private captureOutput(
    entry: RuntimeEntry,
    chunk: Buffer,
    level: ProjectLogLevel
  ) {
    const messages = chunk
      .toString()
      .replace(ansiEscapePattern, "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (messages.length === 0) {
      return false;
    }

    this.pushLogs(entry, level, messages);

    const previewMessage = this.pickPreviewMessage(messages);

    if (previewMessage && previewMessage !== entry.runtime.lastMessage) {
      entry.lastOutput = previewMessage.slice(-320);
      entry.runtime = {
        ...entry.runtime,
        lastMessage: entry.lastOutput,
      };
    }

    return true;
  }

  private resolveNodeDirectory(nodeVersion: string) {
    return path.join(this.getNvmHome(), `v${normalizeNodeVersion(nodeVersion)}`);
  }

  private getNvmHome() {
    return resolveNvmHome() ?? "";
  }

  private disposeEntry(projectId: string, entry: RuntimeEntry, message: string) {
    this.runtimes.delete(projectId);
    this.clearScheduledUpdate(entry);
    entry.child.removeAllListeners();
    entry.child.stdout.removeAllListeners();
    entry.child.stderr.removeAllListeners();
    this.pushLogs(entry, "system", [message]);

    this.onRuntimeUpdate({
      projectId,
      status: "stopped",
      lastMessage: message,
      recentLogs: [...entry.logs],
    });
  }

  private extractProcessError(error: unknown) {
    if (error instanceof Error) {
      return error.message;
    }

    return "进程控制失败。";
  }

  private pickPreviewMessage(messages: string[]) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const previewMessage = this.normalizePreviewMessage(messages[index]);

      if (previewMessage) {
        return previewMessage;
      }
    }

    return "";
  }

  private normalizePreviewMessage(message: string) {
    const trimmedMessage = message.trim();

    if (!trimmedMessage) {
      return "";
    }

    if (
      /^[-*]\s*network:\s*unavailable$/i.test(trimmedMessage) ||
      /^app running at:?$/i.test(trimmedMessage) ||
      /webpack-dev-server\/client/i.test(trimmedMessage) ||
      /^@+\s+/.test(trimmedMessage) ||
      /^\(webpack\)\//i.test(trimmedMessage) ||
      /^\[webpack\./i.test(trimmedMessage) ||
      /^<s>\s*\[webpack/i.test(trimmedMessage)
    ) {
      return "";
    }

    if (/^[-*]?\s*local:\s*/i.test(trimmedMessage)) {
      return trimmedMessage.replace(/^[-*]?\s*local:\s*/i, "本地地址：");
    }

    if (/^[-*]?\s*network:\s*/i.test(trimmedMessage)) {
      return trimmedMessage.replace(/^[-*]?\s*network:\s*/i, "局域网地址：");
    }

    return trimmedMessage;
  }

  private scheduleRuntimeUpdate(entry: RuntimeEntry) {
    if (entry.updateTimer) {
      return;
    }

    entry.updateTimer = setTimeout(() => {
      entry.updateTimer = null;

      if (this.runtimes.get(entry.runtime.projectId) !== entry) {
        return;
      }

      this.emitRuntimeUpdate(entry);
    }, runtimeUpdateDelayMs);
  }

  private clearScheduledUpdate(entry: RuntimeEntry) {
    if (!entry.updateTimer) {
      return;
    }

    clearTimeout(entry.updateTimer);
    entry.updateTimer = null;
  }

  private emitRuntimeUpdate(entry: RuntimeEntry) {
    this.clearScheduledUpdate(entry);
    this.onRuntimeUpdate({
      ...entry.runtime,
      recentLogs: [...entry.logs],
    });
  }

  private pushLogs(
    entry: RuntimeEntry,
    level: ProjectLogLevel,
    messages: string[]
  ) {
    const logEntries = [
      this.createLogEntry(
        entry.runtime.projectId,
        ++entry.logSequence,
        level,
        messages.join("\n")
      ),
    ];

    entry.logs = [...entry.logs, ...logEntries].slice(-maxLogEntries);
    entry.runtime = {
      ...entry.runtime,
      recentLogs: [...entry.logs],
    };
  }

  private createLogEntry(
    projectId: string,
    sequence: number,
    level: ProjectLogLevel,
    message: string
  ): ProjectLogEntry {
    return {
      id: `${projectId}-${sequence}`,
      at: new Date().toISOString(),
      level,
      message: message.slice(-1400),
    };
  }
}
