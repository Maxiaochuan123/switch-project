import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import toIco from "to-ico";

const rootDir = process.cwd();
const sourcePath = path.join(rootDir, "src-tauri", "icons", "concepts", "option-d-launch.svg");
const outputDir = path.join(rootDir, "src-tauri", "icons");
const pngPath = path.join(outputDir, "icon.png");
const icoPath = path.join(outputDir, "icon.ico");
const sizes = [16, 32, 48, 64, 128, 256];

async function main() {
  await mkdir(outputDir, { recursive: true });

  const pngBuffer = await sharp(sourcePath)
    .resize(512, 512, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  await writeFile(pngPath, pngBuffer);

  const frames = await Promise.all(
    sizes.map((size) =>
      sharp(sourcePath)
        .resize(size, size, {
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer()
    )
  );

  const icoBuffer = await toIco(frames);
  await writeFile(icoPath, icoBuffer);

  console.log(`Generated ${pngPath}`);
  console.log(`Generated ${icoPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
