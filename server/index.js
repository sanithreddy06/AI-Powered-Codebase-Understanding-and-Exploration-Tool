require("dotenv").config();
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const multer = require("multer");
const { runFullAnalysis, runFullAnalysisFromFiles, chatWithCodebase } = require("./services/aiService");
const { extractZipToFiles } = require("./services/zipService");

const app = express();
const PORT = process.env.PORT || 5000;
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

app.use(cors());
app.use(express.json({ limit: "50mb" }));

// Store analysis results in memory (per session)
const analysisCache = new Map();
const sessions = new Map();

function getCredentialMap() {
  // Format: LOGIN_USERS=email1@example.com:password1,email2@example.com:password2
  const raw = process.env.LOGIN_USERS || "";
  const map = new Map();

  raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .forEach((entry) => {
      const idx = entry.indexOf(":");
      if (idx <= 0) return;
      const email = entry.slice(0, idx).trim().toLowerCase();
      const password = entry.slice(idx + 1).trim();
      if (!email || !password) return;
      map.set(email, password);
    });

  return map;
}

function getMemberEmails() {
  // Format: MEMBER_EMAILS=email1@example.com,email2@example.com
  return String(process.env.MEMBER_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function createSession(user) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, {
    user,
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  return token;
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  const token = match ? match[1] : null;

  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const session = sessions.get(token);
  if (!session) {
    return res.status(401).json({ error: "Invalid session. Please sign in again." });
  }
  if (session.expiresAt < Date.now()) {
    sessions.delete(token);
    return res.status(401).json({ error: "Session expired. Please sign in again." });
  }

  req.user = session.user;
  req.sessionToken = token;
  next();
}

// ─── Auth (Email + password + membership check) ───
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body || {};
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedPassword = String(password || "");

  if (!normalizedEmail || !normalizedPassword) {
    return res.status(400).json({ error: "email and password are required" });
  }

  const credentials = getCredentialMap();
  if (!credentials.size) {
    return res.status(500).json({
      error: "Server login credentials are not configured. Set LOGIN_USERS in server .env",
    });
  }

  const expectedPassword = credentials.get(normalizedEmail);
  if (!expectedPassword || expectedPassword !== normalizedPassword) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const memberEmails = getMemberEmails();
  if (memberEmails.length > 0 && !memberEmails.includes(normalizedEmail)) {
    return res.status(403).json({
      error: "This account does not have an active membership.",
    });
  }

  const user = { email: normalizedEmail, name: normalizedEmail.split("@")[0] || "User", membership: "active" };
  const token = createSession(user);
  res.json({ success: true, token, user });
});

app.get("/api/auth/me", authMiddleware, (req, res) => {
  res.json({ success: true, user: req.user });
});

app.post("/api/auth/logout", authMiddleware, (req, res) => {
  sessions.delete(req.sessionToken);
  res.json({ success: true });
});

// ─── Health Check ───
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/api/auth/config", (req, res) => {
  res.json({
    authMode: "password",
  });
});

// ─── Analyze Repository ───
app.post("/api/analyze", authMiddleware, async (req, res) => {
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

// ─── Analyze ZIP Upload ───
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: parseInt(process.env.ZIP_MAX_UPLOAD_BYTES || String(50 * 1024 * 1024), 10), // 50MB
  },
});

app.post("/api/analyze-zip", authMiddleware, upload.single("zip"), async (req, res) => {
  if (!req.file?.buffer) {
    return res.status(400).json({ error: "zip file is required" });
  }

  try {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`Starting ZIP analysis for user: ${req.user?.email || "unknown"}`);
    console.log(`${"=".repeat(60)}`);

    const { projectName, files } = await extractZipToFiles(req.file.buffer, (msg) => {
      console.log(`[ZIP] ${msg}`);
    });

    const result = await runFullAnalysisFromFiles(projectName, files, (progress) => {
      console.log(`[Step ${progress.step}/${progress.total}] ${progress.message}`);
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error("ZIP analysis error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// ─── Chat with Codebase ───
app.post("/api/chat", authMiddleware, async (req, res) => {
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
  console.log(`   Password Auth: ${process.env.LOGIN_USERS ? "✅ Configured" : "❌ LOGIN_USERS missing"}`);
});
