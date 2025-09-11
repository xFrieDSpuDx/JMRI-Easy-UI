// scripts/deploy-dist-to-web.js
// Copies web/dist/* back into web/ so JMRI can serve the built files
// without changing Java mapping.
// Safe: it skips node_modules, scripts, and config files.

import * as nodeFs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

/** Absolute path of this file's directory (ESM-friendly). */
const currentDir = path.dirname(fileURLToPath(import.meta.url));

/** Project's web root and dist directory. */
const webRootDir = path.resolve(currentDir, "..");
const distDir = path.join(webRootDir, "dist");

/** Entries that should never be overwritten in web/. */
const BLOCKED_ENTRY_NAMES = Object.freeze([
  "node_modules",
  "dist",
  "scripts",
  ".eslintrc.cjs",
  ".prettierrc.json",
  ".eslintignore",
  ".prettierignore",
  ".editorconfig",
  "package.json",
  "vite.config.js",
  ".nvmrc",
]);

if (!nodeFs.existsSync(distDir)) {
  console.error("dist/ not found. Did you run `npm run build`?");
  process.exit(1);
}

/**
 * Recursively copy files/directories from src → dst, skipping blocked names.
 *
 * @param {string} sourceDir - Directory to copy from.
 * @param {string} destinationDir - Directory to copy into.
 * @returns {void}
 */
function copyDirectoryRecursively(sourceDir, destinationDir) {
  if (!nodeFs.existsSync(destinationDir)) {
    nodeFs.mkdirSync(destinationDir, { recursive: true });
  }

  const directoryEntries = nodeFs.readdirSync(sourceDir, { withFileTypes: true });

  for (const entry of directoryEntries) {
    if (BLOCKED_ENTRY_NAMES.includes(entry.name)) continue;

    const sourcePath = path.join(sourceDir, entry.name);
    const destinationPath = path.join(destinationDir, entry.name);

    if (entry.isDirectory()) {
      copyDirectoryRecursively(sourcePath, destinationPath);
    } else {
      nodeFs.copyFileSync(sourcePath, destinationPath);
    }
  }
}

// Execute deployment copy
copyDirectoryRecursively(distDir, webRootDir);
console.log("Deployed dist/ → web/ (static files copied).");
