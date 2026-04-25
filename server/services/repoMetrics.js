const path = require("path");

function getExt(p) {
  const base = String(p || "").toLowerCase();
  const idx = base.lastIndexOf(".");
  return idx >= 0 ? base.slice(idx) : "";
}

function countRegex(content, regex) {
  if (!content) return 0;
  const m = String(content).match(regex);
  return m ? m.length : 0;
}

function parseJsonSafe(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

function parseExternalDeps(files) {
  const deps = new Set();

  const pkgs = files.filter((f) => f.path === "package.json" || f.path.endsWith("/package.json"));
  for (const pkg of pkgs) {
    const json = parseJsonSafe(pkg.content);
    const add = (obj) => {
      if (!obj || typeof obj !== "object") return;
      for (const k of Object.keys(obj)) deps.add(k);
    };
    add(json?.dependencies);
    add(json?.devDependencies);
    add(json?.peerDependencies);
    add(json?.optionalDependencies);
  }

  const req = files.find((f) => f.path === "requirements.txt" || f.path.endsWith("/requirements.txt"));
  if (req) {
    String(req.content || "")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#") && !l.startsWith("-"))
      .forEach((line) => {
        const name = line.split(/[=<> \t]/)[0]?.trim();
        if (name) deps.add(name);
      });
  }

  return Array.from(deps).sort((a, b) => a.localeCompare(b));
}

function normalizePackageName(spec) {
  const s = String(spec || "").trim();
  if (!s) return null;
  if (s.startsWith("@")) {
    // @scope/name/extra -> @scope/name
    const parts = s.split("/");
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : s;
  }
  // name/extra -> name
  return s.split("/")[0];
}

function buildFileIndex(files) {
  const index = [];

  for (const f of files) {
    const ext = getExt(f.path);
    const size = typeof f.content === "string" ? Buffer.byteLength(f.content, "utf8") : 0;

    // Heuristic counts (fast and good enough for UI stats)
    let functionCount = 0;
    let classCount = 0;

    if (ext === ".js" || ext === ".jsx" || ext === ".ts" || ext === ".tsx") {
      functionCount += countRegex(f.content, /\bfunction\s+[A-Za-z0-9_$]+\s*\(/g);
      functionCount += countRegex(f.content, /\b[A-Za-z0-9_$]+\s*=\s*\([^)]*\)\s*=>/g);
      functionCount += countRegex(f.content, /\b[A-Za-z0-9_$]+\s*=\s*async\s*\([^)]*\)\s*=>/g);
      classCount += countRegex(f.content, /\bclass\s+[A-Za-z0-9_$]+\b/g);
    } else if (ext === ".py") {
      functionCount += countRegex(f.content, /^\s*def\s+[A-Za-z0-9_]+\s*\(/gm);
      classCount += countRegex(f.content, /^\s*class\s+[A-Za-z0-9_]+\s*(\(|:)/gm);
    }

    index.push({
      path: f.path,
      ext,
      size,
      functionCount,
      classCount,
    });
  }

  return index;
}

function resolveImportToFile(importPath, fromFile, fileSet) {
  const fromDir = path.posix.dirname(fromFile);
  let p = importPath.replace(/\\/g, "/").trim();

  // Strip quotes if any
  p = p.replace(/^['"]|['"]$/g, "");

  // Relative only
  if (!p.startsWith("./") && !p.startsWith("../")) return null;

  const candidates = [];
  const base = path.posix.normalize(path.posix.join(fromDir, p));

  candidates.push(base);
  candidates.push(`${base}.js`);
  candidates.push(`${base}.jsx`);
  candidates.push(`${base}.ts`);
  candidates.push(`${base}.tsx`);
  candidates.push(`${base}.py`);
  candidates.push(path.posix.join(base, "index.js"));
  candidates.push(path.posix.join(base, "index.ts"));

  for (const c of candidates) {
    if (fileSet.has(c)) return c;
  }
  return null;
}

function buildImportEdges(files) {
  const fileSet = new Set(files.map((f) => f.path));
  const edges = [];
  const externalEdges = [];
  const externalPkgs = new Set();

  for (const f of files) {
    const ext = getExt(f.path);
    const content = String(f.content || "");

    const imports = [];

    if (ext === ".js" || ext === ".jsx" || ext === ".ts" || ext === ".tsx") {
      const re = /\bimport\s+[^;]*?\s+from\s+['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)/g;
      let m;
      while ((m = re.exec(content)) !== null) {
        const p = m[1] || m[2];
        if (p) imports.push(p);
      }
    } else if (ext === ".py") {
      const re = /^\s*(?:from\s+([A-Za-z0-9_.]+)\s+import|import\s+([A-Za-z0-9_.]+))/gm;
      let m;
      while ((m = re.exec(content)) !== null) {
        const mod = m[1] || m[2];
        if (mod) imports.push(mod);
      }
    }

    for (const imp of imports) {
      // JS relative imports
      const resolved = resolveImportToFile(imp, f.path, fileSet);
      if (resolved) {
        edges.push({ from: f.path, to: resolved, type: "import" });
        continue;
      }

      // External packages (JS/TS only). Keep python external out for now (module mapping is ambiguous).
      if ((ext === ".js" || ext === ".jsx" || ext === ".ts" || ext === ".tsx") && !String(imp).startsWith(".")) {
        const pkg = normalizePackageName(imp);
        if (pkg) {
          externalPkgs.add(pkg);
          externalEdges.push({ from: f.path, to: pkg, type: "external" });
        }
      }
    }
  }

  return { internalEdges: edges, externalEdges, externalPkgs: Array.from(externalPkgs) };
}

function computeRepoMetrics(files) {
  const filesIndex = buildFileIndex(files);
  const externalDeps = parseExternalDeps(files);
  const { internalEdges, externalEdges, externalPkgs } = buildImportEdges(files);

  // Only show external nodes that are (a) imported somewhere, or (b) declared deps.
  const externalNodeIds = Array.from(new Set([...externalDeps, ...externalPkgs]));

  const metrics = {
    files: filesIndex.length,
    functions: filesIndex.reduce((a, f) => a + (f.functionCount || 0), 0),
    classes: filesIndex.reduce((a, f) => a + (f.classCount || 0), 0),
    edges: internalEdges.length + externalEdges.length,
    extDeps: externalNodeIds.length,
  };

  const graph = {
    nodes: [
      ...filesIndex.map((f) => ({ id: f.path, type: "file", label: f.path })),
      ...externalNodeIds.map((name) => ({ id: name, type: "external", label: name })),
    ],
    edges: [
      ...internalEdges.map((e) => ({ source: e.from, target: e.to, type: e.type })),
      ...externalEdges.map((e) => ({ source: e.from, target: e.to, type: e.type })),
    ],
  };

  return { filesIndex, externalDeps, metrics, graph };
}

module.exports = { computeRepoMetrics };

