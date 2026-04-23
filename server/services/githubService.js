const https = require("https");
const http = require("http");

const DEFAULT_INCLUDE = new Set([
  ".py", ".js", ".jsx", ".ts", ".tsx", ".go", ".java", ".c", ".cpp", ".h",
  ".rs", ".rb", ".php", ".swift", ".kt", ".md", ".yml", ".yaml",
]);

const DEFAULT_EXCLUDE = [
  "node_modules/", "dist/", "build/", ".git/", ".github/", ".vscode/",
  "__pycache__/", "venv/", ".env", "test", "tests/", "docs/", "assets/",
  "images/", "public/", "static/", "vendor/", "obj/", "bin/", ".next/",
  "deprecated/", "legacy/", "examples/", "experimental/",
];

const MAX_FILE_SIZE = 100000; // 100KB

function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.get(url, { headers: { "User-Agent": "AI-Codebase-Knowledge", ...headers } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpGet(res.headers.location, headers).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => reject(new Error(`HTTP ${res.statusCode}: ${body.substring(0, 200)}`)));
        return;
      }
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(data));
    });
    req.on("error", reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error("Request timeout")); });
  });
}

function parseRepoUrl(url) {
  // Handle URLs like https://github.com/owner/repo or https://github.com/owner/repo.git
  const match = url.match(/github\.com\/([^\/]+)\/([^\/\.]+)/);
  if (!match) throw new Error("Invalid GitHub URL. Expected format: https://github.com/owner/repo");
  return { owner: match[1], repo: match[2] };
}

function shouldIncludeFile(path) {
  // Check excludes
  for (const excl of DEFAULT_EXCLUDE) {
    if (path.includes(excl)) return false;
  }
  // Check file extension
  const ext = "." + path.split(".").pop();
  return DEFAULT_INCLUDE.has(ext);
}

async function fetchRepoFiles(repoUrl, token = null, onProgress = null) {
  const { owner, repo } = parseRepoUrl(repoUrl);
  const projectName = repo;

  const headers = { Accept: "application/vnd.github.v3+json" };
  if (token) headers.Authorization = `token ${token}`;

  if (onProgress) onProgress("Fetching repository tree...");

  // Get the default branch
  const repoInfoUrl = `https://api.github.com/repos/${owner}/${repo}`;
  const repoInfo = JSON.parse(await httpGet(repoInfoUrl, headers));
  const defaultBranch = repoInfo.default_branch || "main";

  // Get the full tree recursively
  const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`;
  const treeData = JSON.parse(await httpGet(treeUrl, headers));

  if (!treeData.tree) throw new Error("Failed to fetch repository tree");

  // Filter files
  const filesToFetch = treeData.tree.filter(
    (item) => item.type === "blob" && item.size <= MAX_FILE_SIZE && shouldIncludeFile(item.path)
  );

  if (filesToFetch.length === 0) throw new Error("No matching files found in repository");

  if (onProgress) onProgress(`Found ${filesToFetch.length} files. Fetching content...`);

  // Fetch file contents (in batches to avoid rate limits)
  const files = [];
  const batchSize = 10;

  for (let i = 0; i < filesToFetch.length; i += batchSize) {
    const batch = filesToFetch.slice(i, i + batchSize);
    const promises = batch.map(async (file) => {
      try {
        const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${defaultBranch}/${file.path}`;
        const content = await httpGet(rawUrl, token ? { Authorization: `token ${token}` } : {});
        return { path: file.path, content };
      } catch (err) {
        console.warn(`Failed to fetch ${file.path}: ${err.message}`);
        return null;
      }
    });

    const results = await Promise.all(promises);
    results.filter(Boolean).forEach((f) => files.push(f));

    if (onProgress) {
      onProgress(`Fetched ${Math.min(i + batchSize, filesToFetch.length)}/${filesToFetch.length} files...`);
    }
  }

  if (files.length === 0) throw new Error("Failed to fetch any file content");

  return { projectName, files };
}

module.exports = { fetchRepoFiles, parseRepoUrl };
