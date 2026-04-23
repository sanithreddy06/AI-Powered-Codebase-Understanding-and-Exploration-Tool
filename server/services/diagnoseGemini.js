const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

async function diagnose() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("❌ No GEMINI_API_KEY found in .env");
    return;
  }

  console.log("🔍 Diagnosing Gemini API Key...");
  const genAI = new GoogleGenerativeAI(apiKey);

  try {
    // We use the underlying fetch to see what models are available
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.error) {
      console.error("❌ API Error:", data.error.message);
      return;
    }

    console.log("\n✅ API Key is valid!");
    console.log("-----------------------------------------");
    console.log("Available Models for your key:");
    
    const available = data.models
      .filter(m => m.supportedGenerationMethods.includes("generateContent"))
      .map(m => m.name.replace("models/", ""));
    
    available.forEach(m => console.log(`- ${m}`));
    
    if (available.length === 0) {
      console.warn("⚠️  No models found with 'generateContent' support.");
    }

    console.log("-----------------------------------------");
    console.log("\n💡 ACTION: Update llmService.js to use one of the models above.");
  } catch (err) {
    console.error("❌ Diagnosis failed:", err.message);
  }
}

diagnose();
