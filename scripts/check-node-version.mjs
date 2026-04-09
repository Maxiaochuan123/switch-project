import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import semver from "semver";

const rootDir = path.resolve(import.meta.dirname, "..");
const packageJsonPath = path.join(rootDir, "package.json");
const nvmrcPath = path.join(rootDir, ".nvmrc");

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const requiredNodeRange = packageJson.engines?.node;
const currentNodeVersion = process.versions.node;
const recommendedVersion = fs.existsSync(nvmrcPath)
  ? fs.readFileSync(nvmrcPath, "utf8").trim()
  : null;

if (!requiredNodeRange) {
  process.exit(0);
}

if (semver.satisfies(currentNodeVersion, requiredNodeRange, { includePrerelease: true })) {
  process.exit(0);
}

const lines = [
  "",
  `当前 Node 版本不符合项目要求: v${currentNodeVersion}`,
  `本项目要求的版本范围: ${requiredNodeRange}`,
];

if (recommendedVersion) {
  lines.push(`建议先切换到: ${recommendedVersion}`);
  lines.push("");
  lines.push("可执行命令:");
  lines.push(`  nvm use ${recommendedVersion}`);
}

lines.push("");
lines.push("如果你刚执行过 nvm use，但版本仍然不对，请关闭当前终端并重新打开后再试。");
lines.push("");

console.error(lines.join("\n"));
process.exit(1);
