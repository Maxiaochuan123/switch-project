import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import toIco from "to-ico";

const rootDir = process.cwd();
// 切换为使用 AI 生成的高精度 PNG 母版
const sourcePath = path.join(rootDir, "src-tauri", "icons", "current-axolotl.png");
const outputDir = path.join(rootDir, "src-tauri", "icons");

const pngTargets = [
  { name: "32x32.png", size: 32 },
  { name: "64x64.png", size: 64 },
  { name: "128x128.png", size: 128 },
  { name: "128x128@2x.png", size: 256 },
  { name: "icon.png", size: 512 },
  { name: "Square30x30Logo.png", size: 30 },
  { name: "Square44x44Logo.png", size: 44 },
  { name: "Square71x71Logo.png", size: 71 },
  { name: "Square89x89Logo.png", size: 89 },
  { name: "Square107x107Logo.png", size: 107 },
  { name: "Square142x142Logo.png", size: 142 },
  { name: "Square150x150Logo.png", size: 150 },
  { name: "Square284x284Logo.png", size: 284 },
  { name: "Square310x310Logo.png", size: 310 },
  { name: "StoreLogo.png", size: 50 },
];

const icoSizes = [16, 32, 48, 64, 128, 256];

async function main() {
  await mkdir(outputDir, { recursive: true });

  console.log("Processing master PNG to generate app icons...");
  for (const target of pngTargets) {
    await sharp(sourcePath)
      .resize(target.size, target.size)
      .png()
      .toFile(path.join(outputDir, target.name));
    console.log(`  ✓ Created ${target.name}`);
  }

  console.log("Generating multi-resolution icon.ico...");
  const frames = await Promise.all(
    icoSizes.map((size) =>
      sharp(sourcePath)
        .resize(size, size)
        .png()
        .toBuffer()
    )
  );
  const icoBuffer = await toIco(frames);
  await writeFile(path.join(outputDir, "icon.ico"), icoBuffer);
  console.log("  ✓ Created icon.ico");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
