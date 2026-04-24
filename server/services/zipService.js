const unzipper = require("unzipper");
const path = require("path");
const { shouldIncludeFile, MAX_FILE_SIZE } = require("./githubService");

const MAX_ZIP_FILE_COUNT = parseInt(process.env.ZIP_MAX_FILE_COUNT || "2000", 10);
const MAX_TOTAL_UNZIPPED_BYTES = parseInt(process.env.ZIP_MAX_TOTAL_BYTES || String(50 * 1024 * 1024), 10); // 50MB

function toPosixPath(p) {
  return String(p || "").replace(/\\/g, "/");
}

function isSafeZipPath(p) {
  const posix = toPosixPath(p);
  if (!posix || posix.endsWith("/")) return false;
  if (posix.startsWith("/") || posix.startsWith("~")) return false;
  if (posix.includes("\0")) return false;

  const normalized = path.posix.normalize(posix);
  if (normalized.startsWith("../") || normalized === "..") return false;
  if (normalized.includes("/../")) return false;
  return true;
}

async function extractZipToFiles(zipBuffer, onProgress) {
  const directory = await unzipper.Open.buffer(zipBuffer);

  let totalBytes = 0;
  let includedCount = 0;
  const files = [];

  for (const entry of directory.files) {
    const rawPath = entry.path;
    const filePath = toPosixPath(rawPath);

    if (entry.type !== "File") continue;
    if (!isSafeZipPath(filePath)) continue;
    if (!shouldIncludeFile(filePath)) continue;

    const size = entry.uncompressedSize || 0;
    if (size > MAX_FILE_SIZE) continue;

    includedCount += 1;
    if (includedCount > MAX_ZIP_FILE_COUNT) {
      throw new Error(`ZIP contains too many files (limit ${MAX_ZIP_FILE_COUNT})`);
    }

    totalBytes += size;
    if (totalBytes > MAX_TOTAL_UNZIPPED_BYTES) {
      throw new Error(`ZIP extracted content too large (limit ${Math.round(MAX_TOTAL_UNZIPPED_BYTES / 1024 / 1024)}MB)`);
    }

    const buf = await entry.buffer();
    const content = buf.toString("utf8");
    files.push({ path: filePath, content });

    if (onProgress && includedCount % 100 === 0) {
      onProgress(`Extracted ${includedCount} files...`);
    }
  }

  if (files.length === 0) {
    throw new Error("No matching files found in ZIP");
  }

  return { projectName: "zip-upload", files };
}

module.exports = { extractZipToFiles };

