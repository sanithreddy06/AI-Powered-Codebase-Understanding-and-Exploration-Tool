require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { runFullAnalysis, chatWithCodebase } = require("./services/aiService");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: "50mb" }));

// Store analysis results in memory (per session)
const analysisCache = new Map();

// ─── Health Check ───
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── Analyze Repository ───
app.post("/api/analyze", async (req, res) => {
  const { repoUrl } = req.body;

  if (!repoUrl) {
    return res.status(400).json({ error: "repoUrl is required" });
  }

  if (!repoUrl.includes("github.com")) {
    return res.status(400).json({ error: "Only GitHub URLs are supported" });
  }

  try {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`Starting analysis for: ${repoUrl}`);
    console.log(`${"=".repeat(60)}`);

    const token = process.env.GITHUB_TOKEN || null;
    const result = await runFullAnalysis(repoUrl, token, (progress) => {
      console.log(`[Step ${progress.step}/${progress.total}] ${progress.message}`);
    });

    // Cache the result for chat
    const cacheKey = repoUrl.toLowerCase().trim();
    analysisCache.set(cacheKey, result.codebaseContext);

    // Keep cache manageable
    if (analysisCache.size > 20) {
      const firstKey = analysisCache.keys().next().value;
      analysisCache.delete(firstKey);
    }

    console.log(`\n✅ Analysis complete for ${result.projectName}`);
    console.log(`   - ${result.fileCount} files analyzed`);
    console.log(`   - ${result.abstractions.length} abstractions identified`);
    console.log(`   - ${result.chapters.length} chapters written`);

    res.json({ success: true, data: result });
  } catch (error) {
    console.error("Analysis error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// ─── Chat with Codebase ───
app.post("/api/chat", async (req, res) => {
  const { message, repoUrl, codebaseContext } = req.body;

  if (!message) {
    return res.status(400).json({ error: "message is required" });
  }

  try {
    // Use provided context or try to find cached context
    let context = codebaseContext;
    if (!context && repoUrl) {
      context = analysisCache.get(repoUrl.toLowerCase().trim());
    }

    if (!context) {
      context = "No codebase has been analyzed yet. Please analyze a repository first.";
    }

    const response = await chatWithCodebase(message, context);
    res.json({ success: true, response });
  } catch (error) {
    console.error("Chat error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// ─── Start Server ───
app.listen(PORT, () => {
  console.log(`\n🚀 AI Codebase Knowledge Server v2.0 running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/api/health`);
  console.log(`   Gemini API: ${process.env.GEMINI_API_KEY ? "✅ Configured" : "❌ Not configured"}`);
  console.log(`   GitHub Token: ${process.env.GITHUB_TOKEN ? "✅ Configured" : "⚠️  Not set (rate limits may apply)"}\n`);
});
