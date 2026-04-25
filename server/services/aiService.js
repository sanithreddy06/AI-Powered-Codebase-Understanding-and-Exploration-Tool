const { callGemini } = require("./llmService");

// ─── Helper ───
function parseJsonSafe(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

function pickProjectFactFiles(files) {
  const byPath = new Map(files.map((f, i) => [f.path, i]));

  const picks = new Set();
  const addIfPresent = (p) => {
    const idx = byPath.get(p);
    if (typeof idx === "number") picks.add(idx);
  };

  // Common high-signal docs/config/entrypoints
  addIfPresent("README.md");
  addIfPresent("readme.md");
  addIfPresent("package.json");
  addIfPresent("pnpm-lock.yaml");
  addIfPresent("yarn.lock");
  addIfPresent("package-lock.json");
  addIfPresent("Dockerfile");
  addIfPresent("docker-compose.yml");
  addIfPresent("docker-compose.yaml");
  addIfPresent("Makefile");

  // Entry-ish files (root and src/)
  for (const p of [
    "index.js",
    "index.ts",
    "main.js",
    "main.ts",
    "app.js",
    "app.ts",
    "src/index.js",
    "src/index.ts",
    "src/main.ts",
    "src/main.js",
    "src/app.ts",
    "src/app.js",
    "server.js",
    "server.ts",
  ]) {
    addIfPresent(p);
  }

  // If monorepo, include package.jsons near root
  files
    .map((f, i) => ({ i, p: String(f.path || "") }))
    .filter(({ p }) => /(^|\/)package\.json$/i.test(p) && p.split("/").length <= 3)
    .slice(0, 6)
    .forEach(({ i }) => picks.add(i));

  return Array.from(picks);
}

function buildProjectFacts(files, projectName) {
  const importantIdxs = pickProjectFactFiles(files);
  const importantFiles = importantIdxs.map((i) => files[i]).filter(Boolean);

  const readme = importantFiles.find((f) => /^readme\.md$/i.test(f.path));
  const rootPkg = importantFiles.find((f) => f.path === "package.json");
  const pkgJson = rootPkg ? parseJsonSafe(rootPkg.content) : null;

  const scripts = pkgJson?.scripts && typeof pkgJson.scripts === "object" ? pkgJson.scripts : null;
  const deps = {
    dependencies: pkgJson?.dependencies || null,
    devDependencies: pkgJson?.devDependencies || null,
  };

  const fileList = importantFiles
    .map((f) => `- ${f.path}`)
    .slice(0, 20)
    .join("\n");

  const readmeExcerpt = readme?.content
    ? String(readme.content).trim().slice(0, 1800)
    : "";

  const scriptsExcerpt = scripts
    ? Object.entries(scripts)
        .slice(0, 25)
        .map(([k, v]) => `- ${k}: ${v}`)
        .join("\n")
    : "";

  const depsExcerpt = (obj) =>
    obj && typeof obj === "object"
      ? Object.keys(obj)
          .slice(0, 30)
          .map((k) => `- ${k}`)
          .join("\n")
      : "";

  return `
Project: ${projectName}

High-signal files:
${fileList || "- (none found)"}

README excerpt:
${readmeExcerpt || "(no README.md excerpt available)"}

package.json scripts:
${scriptsExcerpt || "(no package.json scripts found)"}

Top dependencies:
${depsExcerpt(deps.dependencies) || "(none detected)"} 

Top devDependencies:
${depsExcerpt(deps.devDependencies) || "(none detected)"}
  `.trim();
}

function parseYamlFromResponse(response) {
  const text = String(response || "").trim();

  const fencedYamlMatch = text.match(/```yaml\s*([\s\S]*?)```/i);
  if (fencedYamlMatch) return fencedYamlMatch[1].trim();

  const fencedAnyMatch = text.match(/```(?:yml|yaml)?\s*([\s\S]*?)```/i);
  if (fencedAnyMatch) return fencedAnyMatch[1].trim();

  // Fallback: Gemini sometimes returns plain YAML without a fenced block.
  // Accept likely YAML starting points instead of failing immediately.
  const likelyYamlStart = text.match(/(?:^|\n)\s*(?:summary:|relationships:|- name:|-\s*\d+)/i);
  if (likelyYamlStart) {
    const startIndex = likelyYamlStart.index || 0;
    return text.slice(startIndex).trim();
  }

  throw new Error("Could not parse YAML from LLM response");
}

function parseSimpleYamlList(yamlStr) {
  // Simple YAML list parser for our specific format
  const items = [];
  let current = null;

  for (const line of yamlStr.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("- name:")) {
      if (current) items.push(current);
      current = { name: trimmed.replace("- name:", "").trim().replace(/^\|$/, ""), description: "", files: [] };
    } else if (current && trimmed.startsWith("name:")) {
      current.name = trimmed.replace("name:", "").trim().replace(/^\|$/, "");
    } else if (current && trimmed.startsWith("description:")) {
      current.description = trimmed.replace("description:", "").trim().replace(/^\|$/, "");
    } else if (current && trimmed.startsWith("- ") && /^\d/.test(trimmed.substring(2).trim())) {
      const idx = parseInt(trimmed.substring(2).trim().split("#")[0].trim());
      if (!isNaN(idx)) current.files.push(idx);
    } else if (current && trimmed.startsWith("file_indices:")) {
      // Supports inline formats like: file_indices: [0, 2, 5]
      const inline = trimmed.match(/\[(.*?)\]/);
      if (inline && inline[1]) {
        inline[1]
          .split(",")
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !isNaN(n))
          .forEach((n) => current.files.push(n));
      }
    } else if (current && !trimmed.startsWith("-") && !trimmed.startsWith("file_indices:")) {
      // Continuation of name or description
      if (current.description === "" || current.description === "|") {
        if (current.name === "" || current.name === "|") {
          current.name = trimmed;
        } else {
          current.description += (current.description ? " " : "") + trimmed;
        }
      } else {
        current.description += " " + trimmed;
      }
    }
  }
  if (current) items.push(current);

  // Clean up
  items.forEach((item) => {
    item.name = item.name.replace(/^\|?\s*/, "").replace(/\s*\|?\s*$/, "").trim();
    item.description = item.description.replace(/^\|?\s*/, "").replace(/\s*\|?\s*$/, "").trim();
  });

  return items;
}

function parseMarkdownAbstractionList(response, files) {
  const lines = String(response || "").split("\n");
  const items = [];
  let current = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const itemMatch = line.match(/^(?:[-*]|\d+\.)\s+(.*)$/);

    if (itemMatch) {
      if (current) items.push(current);
      let name = itemMatch[1].replace(/\*\*/g, "").replace(/`/g, "").trim();
      name = name.replace(/:$/, "").trim();
      current = { name, description: "", files: [] };
      continue;
    }

    if (!current) continue;
    if (!line) continue;
    if (line.startsWith("-") || line.startsWith("*")) continue;

    current.description += (current.description ? " " : "") + line.replace(/\*\*/g, "").replace(/`/g, "").trim();
  }

  if (current) items.push(current);

  const unique = [];
  const seen = new Set();
  for (const item of items) {
    if (!item.name) continue;
    const key = item.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({
      name: item.name,
      description: item.description || "Core concept identified from model output.",
      files: Array.from({ length: Math.min(files.length, 3) }, (_, i) => i),
    });
    if (unique.length >= 5) break;
  }

  return unique;
}

// Helper: delay between API calls to avoid rate limits
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Step 1: Identify Abstractions ───
async function identifyAbstractions(files, projectName, projectFacts, onProgress) {
  if (onProgress) onProgress("Identifying core abstractions...");

  // Limit files and truncate content aggressively for small token budgets,
  // but prioritize README/package.json/entrypoints instead of the first N files.
  const preferred = pickProjectFactFiles(files);
  const fallback = Array.from({ length: Math.min(files.length, 30) }, (_, i) => i);
  const chosen = Array.from(new Set([...preferred, ...fallback])).slice(0, Math.min(files.length, 14));

  let context = "";
  const fileInfo = [];
  for (const idx of chosen) {
    const f = files[idx];
    if (!f) continue;
    context += `--- ${idx}: ${f.path} ---\n${String(f.content || "").substring(0, 700)}\n\n`;
    fileInfo.push(`- ${idx} # ${f.path}`);
  }

  const prompt = `For project \`${projectName}\`, analyze this codebase and identify the top 5 core abstractions.

Use ONLY the facts from the provided README/scripts/code snippets. If something is not present, say "not found".

Project facts (README/scripts/deps):
${projectFacts || "(no project facts available)"}

Files:
${context}

File list:
${fileInfo.join("\n")}

For each abstraction provide: name, description (50 words max), and file_indices.

\`\`\`yaml
- name: "Example"
  description: "Brief description."
  file_indices:
    - 0 # path/to/file.py
\`\`\``;

  const response = await callGemini(prompt);
  let abstractions = [];
  try {
    const yamlStr = parseYamlFromResponse(response);
    abstractions = parseSimpleYamlList(yamlStr);
  } catch (_) {
    // ignore and try markdown fallback below
  }

  if (abstractions.length === 0) {
    abstractions = parseMarkdownAbstractionList(response, files);
  }

  if (abstractions.length === 0) throw new Error("No abstractions identified");

  // Validate file indices
  abstractions.forEach((a) => {
    a.files = a.files.filter((idx) => idx >= 0 && idx < files.length);
    a.files = [...new Set(a.files)].sort((a, b) => a - b);
  });

  if (onProgress) onProgress(`Identified ${abstractions.length} abstractions`);
  return abstractions;
}

// ─── Step 2: Analyze Relationships ───
async function analyzeRelationships(abstractions, files, projectName, onProgress) {
  if (onProgress) onProgress("Analyzing relationships between abstractions...");

  let context = "Identified Abstractions:\n";
  const abstractionListing = [];

  abstractions.forEach((a, i) => {
    const fileStr = a.files.join(", ");
    context += `- Index ${i}: ${a.name} (Files: [${fileStr}])\n  Description: ${a.description}\n`;
    abstractionListing.push(`${i} # ${a.name}`);
  });

  // Add relevant file snippets
  const allIndices = new Set();
  abstractions.forEach((a) => a.files.forEach((f) => allIndices.add(f)));

  context += "\nFile Snippets:\n";
  const sortedIndices = [...allIndices].sort((a, b) => a - b).slice(0, 8);
  for (const idx of sortedIndices) {
    if (idx < files.length) {
      context += `--- ${idx}: ${files[idx].path} ---\n${files[idx].content.substring(0, 320)}\n\n`;
    }
  }

  const prompt = `
Based on the following abstractions and relevant code snippets from the project \`${projectName}\`:

List of Abstraction Indices and Names:
${abstractionListing.join("\n")}

Context (Abstractions, Descriptions, Code):
${context}

Please provide:
1. A high-level \`summary\` of the project's main purpose and functionality in a few beginner-friendly sentences. Use markdown formatting with **bold** and *italic* text to highlight important concepts.
2. A list (\`relationships\`) describing the key interactions between these abstractions. For each relationship, specify:
    - \`from_abstraction\`: Index of the source abstraction (e.g., \`0 # AbstractionName1\`)
    - \`to_abstraction\`: Index of the target abstraction (e.g., \`1 # AbstractionName2\`)
    - \`label\`: A brief label for the interaction in just a few words (e.g., "Manages", "Inherits", "Uses").

IMPORTANT: Make sure EVERY abstraction is involved in at least ONE relationship.

Format the output as YAML:

\`\`\`yaml
summary: |
  A brief, simple explanation of the project.
  Can span multiple lines with **bold** and *italic* for emphasis.
relationships:
  - from_abstraction: 0 # AbstractionName1
    to_abstraction: 1 # AbstractionName2
    label: "Manages"
  - from_abstraction: 2 # AbstractionName3
    to_abstraction: 0 # AbstractionName1
    label: "Provides config"
\`\`\`

Now, provide the YAML output:`;

  const response = await callGemini(prompt);
  const yamlStr = parseYamlFromResponse(response);

  // Parse summary
  const summaryMatch = yamlStr.match(/summary:\s*\|?\s*\n([\s\S]*?)(?=relationships:)/);
  const summary = summaryMatch ? summaryMatch[1].split("\n").map((l) => l.trim()).filter(Boolean).join(" ") : "Project summary unavailable.";

  // Parse relationships
  const relationships = [];
  const relRegex = /from_abstraction:\s*(\d+).*?\n\s*to_abstraction:\s*(\d+).*?\n\s*label:\s*"?([^"\n]+)"?/g;
  let match;
  while ((match = relRegex.exec(yamlStr)) !== null) {
    const from = parseInt(match[1]);
    const to = parseInt(match[2]);
    const label = match[3].trim();
    if (from >= 0 && from < abstractions.length && to >= 0 && to < abstractions.length) {
      relationships.push({ from, to, label });
    }
  }

  if (onProgress) onProgress(`Found ${relationships.length} relationships`);
  return { summary, details: relationships };
}

// ─── Step 3: Order Chapters ───
async function orderChapters(abstractions, relationships, projectName, onProgress) {
  if (onProgress) onProgress("Determining optimal chapter order...");

  const listing = abstractions.map((a, i) => `- ${i} # ${a.name}`).join("\n");

  let context = `Project Summary:\n${relationships.summary}\n\nRelationships:\n`;
  for (const rel of relationships.details) {
    context += `- From ${rel.from} (${abstractions[rel.from].name}) to ${rel.to} (${abstractions[rel.to].name}): ${rel.label}\n`;
  }

  const prompt = `
Given the following project abstractions and their relationships for the project \`${projectName}\`:

Abstractions (Index # Name):
${listing}

Context about relationships and project summary:
${context}

What is the best order to explain these abstractions from first to last?
Ideally, first explain those that are the most important or foundational, perhaps user-facing concepts or entry points. Then move to more detailed, lower-level implementation details.

Output the ordered list of abstraction indices. Use the format \`idx # AbstractionName\`.

\`\`\`yaml
- 2 # FoundationalConcept
- 0 # CoreClassA
- 1 # CoreClassB
\`\`\`

Now, provide the YAML output:`;

  const response = await callGemini(prompt);
  const yamlStr = parseYamlFromResponse(response);

  const ordered = [];
  const seen = new Set();
  for (const line of yamlStr.split("\n")) {
    const match = line.match(/^\s*-\s*(\d+)/);
    if (match) {
      const idx = parseInt(match[1]);
      if (idx >= 0 && idx < abstractions.length && !seen.has(idx)) {
        ordered.push(idx);
        seen.add(idx);
      }
    }
  }

  // Ensure all abstractions are included
  for (let i = 0; i < abstractions.length; i++) {
    if (!seen.has(i)) ordered.push(i);
  }

  if (onProgress) onProgress(`Chapter order: ${ordered.join(", ")}`);
  return ordered;
}

// ─── Step 4: Write Chapters ───
async function writeChapter(chapterNum, abstraction, files, projectName, allChapters, prevSummaries, projectFacts, onProgress) {
  if (onProgress) onProgress(`Writing chapter ${chapterNum}: ${abstraction.name}...`);

  // Build file context (truncated for token limits)
  let fileContext = "";
  for (const idx of abstraction.files.slice(0, 3)) {
    if (idx < files.length) {
      fileContext += `--- ${files[idx].path} ---\n${files[idx].content.substring(0, 700)}\n\n`;
    }
  }

  // Build chapter listing
  const chapterListing = allChapters.map((c, i) => `${i + 1}. ${c.name}`).join("\n");

  // Previous chapters context
  const recentSummaries = prevSummaries.slice(-2);
  const prevContext = recentSummaries.length > 0 ? recentSummaries.join("\n---\n") : "This is the first chapter.";

  // Navigation info
  const prevChapter = chapterNum > 1 ? allChapters[chapterNum - 2] : null;
  const nextChapter = chapterNum < allChapters.length ? allChapters[chapterNum] : null;

  const prompt = `
Write a very beginner-friendly tutorial chapter (in Markdown format) for the project \`${projectName}\` about the concept: "${abstraction.name}". This is Chapter ${chapterNum}.

Grounding rules (must follow):
- Use ONLY the provided "Project facts" and "Relevant Code Snippets". Do NOT invent APIs, files, scripts, or behavior.
- When you make a claim about code, mention the file path in backticks (example: \`src/server.ts\`).
- If you cannot confirm something from the provided context, explicitly say "I couldn't find this in the analyzed files" and give the closest pointers (which files to check).
- Avoid vague explanations. Prefer concrete steps, and tie each step to the repo (files/scripts) when possible.

Project facts (README/scripts/deps):
${projectFacts || "(no project facts available)"}

Concept Details:
- Name: ${abstraction.name}
- Description: ${abstraction.description}

Complete Tutorial Structure:
${chapterListing}

Context from previous chapters:
${prevContext}

Relevant Code Snippets:
${fileContext || "No specific code snippets provided for this abstraction."}

Instructions for the chapter:
- Start with heading: \`# Chapter ${chapterNum}: ${abstraction.name}\`
${prevChapter ? `- Begin with a brief transition from the previous chapter "${prevChapter.name}".` : ""}
- Early in the chapter, include a short section "## What this project does (in plain English)" grounded in README/scripts.
- Include "## Where to look in the code" with 3-6 bullet points of the most relevant files (use backticks).
- Begin with a high-level motivation explaining what problem this abstraction solves. Start with a concrete use case.
- If complex, break it down into key concepts. Explain each one-by-one in a very beginner-friendly way.
- Give example inputs and outputs for code snippets.
- Each code block should be BELOW 10 lines! Break longer code into smaller pieces.
- Describe the internal implementation to help understand what's under the hood.
- Use a simple mermaid sequenceDiagram with at most 5 participants. If participant name has spaces, use: \`participant QP as Query Processing\`.
- Use mermaid diagrams (\`\`\`mermaid format) to illustrate complex concepts.
- Heavily use analogies and examples to help beginners understand.
- End with a brief conclusion and ${nextChapter ? `transition to the next chapter "${nextChapter.name}"` : "a final summary"}.
- Ensure the tone is welcoming and easy for a newcomer to understand.
- Output *only* the Markdown content for this chapter.

Now, directly provide a super beginner-friendly Markdown output:`;

  const content = await callGemini(prompt);

  // Ensure proper heading
  let chapter = content.trim();
  if (!chapter.startsWith(`# Chapter ${chapterNum}`)) {
    const lines = chapter.split("\n");
    if (lines[0].startsWith("#")) {
      lines[0] = `# Chapter ${chapterNum}: ${abstraction.name}`;
      chapter = lines.join("\n");
    } else {
      chapter = `# Chapter ${chapterNum}: ${abstraction.name}\n\n${chapter}`;
    }
  }

  return chapter;
}

// ─── Step 5: Generate Mermaid Diagram ───
function generateMermaidDiagram(abstractions, relationships) {
  const lines = ["flowchart TD"];

  abstractions.forEach((a, i) => {
    const name = a.name.replace(/"/g, "").substring(0, 40);
    lines.push(`    A${i}["${name}"]`);
  });

  for (const rel of relationships.details) {
    let label = rel.label.replace(/"/g, "").replace(/\n/g, " ");
    if (label.length > 30) label = label.substring(0, 27) + "...";
    lines.push(`    A${rel.from} -- "${label}" --> A${rel.to}`);
  }

  return lines.join("\n");
}

// ─── Step 6: Chat with Codebase ───
async function chatWithCodebase(message, codebaseContext) {
  const prompt = `
You are an expert AI assistant and tutor. You can answer both:
1) questions about the analyzed codebase, and
2) general knowledge/programming questions like a normal assistant.

When the question is related to the codebase, prioritize the context below and explain clearly with practical examples.
When the question is general and not related to the codebase, still answer fully and helpfully (do NOT refuse or redirect).

${codebaseContext}

The user asks: "${message}"

Please provide a clear, beginner-friendly answer. Use code examples if helpful. Use markdown formatting.

Answer:`;

  return await callGemini(prompt);
}

// ─── Full Pipeline ───
async function runFullAnalysisFromFiles(projectName, files, onProgress) {
  if (!projectName) projectName = "project";
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error("No files provided for analysis");
  }

  if (onProgress) onProgress({ step: 1, total: 5, message: `Loaded ${files.length} files from ${projectName}` });

  // Repo metrics for Explorer UI (always compute; even if tutorial steps fail)
  const { computeRepoMetrics } = require("./repoMetrics");
  const repoMetrics = computeRepoMetrics(files);

  // Tutorial pipeline (best-effort). If it fails, return Explorer data anyway.
  try {
    const projectFacts = buildProjectFacts(files, projectName);

    // Step 2: Identify Abstractions
    if (onProgress) onProgress({ step: 2, total: 5, message: "Identifying core abstractions..." });
    const abstractions = await identifyAbstractions(files, projectName, projectFacts, (msg) => {
      if (onProgress) onProgress({ step: 2, total: 5, message: msg });
    });

    // Step 3: Analyze Relationships
    if (onProgress) onProgress({ step: 3, total: 5, message: "Analyzing relationships..." });
    const relationships = await analyzeRelationships(abstractions, files, projectName, (msg) => {
      if (onProgress) onProgress({ step: 3, total: 5, message: msg });
    });

    // Step 4: Order Chapters
    if (onProgress) onProgress({ step: 4, total: 5, message: "Ordering chapters..." });
    const chapterOrder = await orderChapters(abstractions, relationships, projectName, (msg) => {
      if (onProgress) onProgress({ step: 4, total: 5, message: msg });
    });

    // Step 5: Write Chapters
    if (onProgress) onProgress({ step: 5, total: 5, message: "Writing tutorial chapters..." });

    const orderedAbstractions = chapterOrder.map((idx) => ({
      ...abstractions[idx],
      originalIndex: idx,
    }));

    const chapters = [];
    const prevSummaries = [];

    for (let i = 0; i < orderedAbstractions.length; i++) {
      if (onProgress) {
        onProgress({ step: 5, total: 5, message: `Writing chapter ${i + 1}/${orderedAbstractions.length}: ${orderedAbstractions[i].name}...` });
      }

      // Delay between chapters to avoid rate limits
      if (i > 0) await delay(5000);

      const content = await writeChapter(
        i + 1,
        orderedAbstractions[i],
        files,
        projectName,
        orderedAbstractions,
        prevSummaries,
        projectFacts
      );

      chapters.push({
        number: i + 1,
        name: orderedAbstractions[i].name,
        description: orderedAbstractions[i].description,
        content,
        files: orderedAbstractions[i].files.map((idx) => files[idx]?.path || `file_${idx}`),
      });

      prevSummaries.push(content.substring(0, 300));
    }

    // Generate diagram
    const mermaidDiagram = generateMermaidDiagram(abstractions, relationships);

    // Build codebase context for chat
    const codebaseContext = `
Project: ${projectName}
Summary: ${relationships.summary}

Abstractions:
${abstractions.map((a, i) => `${i + 1}. ${a.name}: ${a.description}`).join("\n")}

Chapter Summaries:
${chapters.map((c) => `Chapter ${c.number} - ${c.name}: ${c.content.substring(0, 300)}...`).join("\n")}
  `.trim();

    // Build a file content lookup for UI hover previews.
    const referencedFileIndices = new Set();
    orderedAbstractions.forEach((abstraction) => {
      abstraction.files.forEach((idx) => referencedFileIndices.add(idx));
    });

    const fileContents = {};
    for (const idx of referencedFileIndices) {
      const file = files[idx];
      if (!file || !file.path || typeof file.content !== "string") continue;

      fileContents[file.path] = file.content;
      const basename = file.path.split("/").pop();
      if (basename && !fileContents[basename]) {
        fileContents[basename] = file.content;
      }
    }

    return {
      projectName,
      summary: relationships.summary,
      abstractions: abstractions.map((a) => ({ name: a.name, description: a.description })),
      relationships: relationships.details,
      mermaidDiagram,
      chapters,
      fileContents,
      filesIndex: repoMetrics.filesIndex,
      externalDeps: repoMetrics.externalDeps,
      metrics: repoMetrics.metrics,
      graph: repoMetrics.graph,
      codebaseContext,
      fileCount: files.length,
    };
  } catch (error) {
    const warning = `Tutorial generation skipped: ${error.message || "Unknown error"}`;
    console.warn(`[AI] ${warning}`);

    const codebaseContext = `
Project: ${projectName}
Summary: Tutorials could not be generated for this repository, but explorer metrics are available.

Files (sample):
${repoMetrics.filesIndex.slice(0, 50).map((f) => `- ${f.path}`).join("\n")}
    `.trim();

    return {
      projectName,
      summary: "Tutorials could not be generated for this repository, but you can still explore files and the graph.",
      abstractions: [],
      relationships: [],
      mermaidDiagram: "",
      chapters: [],
      fileContents: {},
      filesIndex: repoMetrics.filesIndex,
      externalDeps: repoMetrics.externalDeps,
      metrics: repoMetrics.metrics,
      graph: repoMetrics.graph,
      codebaseContext,
      fileCount: files.length,
      analysisWarning: warning,
    };
  }
}

async function runFullAnalysis(repoUrl, token, onProgress) {
  const { fetchRepoFiles } = require("./githubService");

  // Step 1: Fetch
  if (onProgress) onProgress({ step: 1, total: 5, message: "Fetching repository files..." });
  const { projectName, files } = await fetchRepoFiles(repoUrl, token, (msg) => {
    if (onProgress) onProgress({ step: 1, total: 5, message: msg });
  });

  if (onProgress) onProgress({ step: 1, total: 5, message: `Fetched ${files.length} files from ${projectName}` });
  return await runFullAnalysisFromFiles(projectName, files, onProgress);
}

module.exports = {
  runFullAnalysis,
  runFullAnalysisFromFiles,
  chatWithCodebase,
  identifyAbstractions,
  analyzeRelationships,
  orderChapters,
  writeChapter,
  generateMermaidDiagram,
};
