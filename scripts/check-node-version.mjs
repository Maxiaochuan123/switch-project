import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import semver from "semver";

const rootDir = path.resolve(import.meta.dirname, "..");
const packageJsonPath = path.join(rootDir, "package.json");
const nodeVersionPath = path.join(rootDir, ".node-version");
const nvmrcPath = path.join(rootDir, ".nvmrc");

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const requiredNodeRange = packageJson.engines?.node;
const currentNodeVersion = process.versions.node;
const recommendedVersionFilePath = fs.existsSync(nodeVersionPath)
  ? nodeVersionPath
  : fs.existsSync(nvmrcPath)
    ? nvmrcPath
    : null;
const recommendedVersion = recommendedVersionFilePath
  ? fs.readFileSync(recommendedVersionFilePath, "utf8").trim()
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
  lines.push(`  fnm use ${recommendedVersion}`);
}

lines.push("");
lines.push("如果你刚安装过 fnm 或切换过版本，建议重新打开终端后再试。");
lines.push("");

console.error(lines.join("\n"));
process.exit(1);
