const { GoogleGenerativeAI } = require("@google/generative-ai");
const https = require("https");

// ─── Gemini Provider ───
async function callGemini(prompt, apiKey) {
  const genAI = new GoogleGenerativeAI(apiKey);
  
  const models = [
    "gemini-2.0-flash",
    "gemini-3-flash-preview",
    "gemini-2.5-flash",
    "gemini-flash-latest"
  ];
  
  for (const modelName of models) {
    try {
      console.log(`  [LLM] Trying Gemini model: ${modelName}...`);
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
      });
      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    } catch (error) {
      console.error(`  [LLM] ${modelName} error: ${error.message}`);
      console.warn(`  [LLM] Trying next model...`);
      continue;
    }
  }
  throw new Error("All Gemini models exhausted. Try a different provider.");
}

// ─── OpenAI-Compatible Provider (Groq, OpenRouter, OpenAI, etc.) ───
function httpsPost(url, headers, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 300)}`));
        } else {
          resolve(JSON.parse(data));
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(120000, () => { req.destroy(); reject(new Error("Request timeout")); });
    req.write(JSON.stringify(body));
    req.end();
  });
}

async function callOpenAICompatible(prompt, baseUrl, apiKey, model) {
  const url = `${baseUrl.replace(/\/$/, "")}/v1/chat/completions`;
  const headers = {};
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  console.log(`  [LLM] Using ${model} via ${baseUrl} (max_tokens: 4096)...`);
  const result = await httpsPost(url, headers, {
    model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
    max_tokens: 4096,
  });

  return result.choices[0].message.content;
}

// ─── Main Entry Point ───
async function callLLM(prompt, retries = 4) {
  const provider = (process.env.LLM_PROVIDER || "GEMINI").toUpperCase();

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      switch (provider) {
        case "GEMINI": {
          const apiKey = process.env.GEMINI_API_KEY;
          if (!apiKey || apiKey === "your_gemini_api_key_here") {
            throw new Error("GEMINI_API_KEY is not set in .env file");
          }
          return await callGemini(prompt, apiKey);
        }

        case "GROQ": {
          const apiKey = process.env.GROQ_API_KEY;
          if (!apiKey) throw new Error("GROQ_API_KEY is not set in .env file");
          const model = process.env.GROQ_MODEL || "llama-3.1-8b-instant";
          return await callOpenAICompatible(prompt, "https://api.groq.com/openai", apiKey, model);
        }

        case "OPENAI": {
          const apiKey = process.env.OPENAI_API_KEY;
          if (!apiKey) throw new Error("OPENAI_API_KEY is not set in .env file");
          const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
          return await callOpenAICompatible(prompt, "https://api.openai.com", apiKey, model);
        }

        case "OPENROUTER": {
          const apiKey = process.env.OPENROUTER_API_KEY;
          if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set in .env file");
          const model = process.env.OPENROUTER_MODEL || "meta-llama/llama-3.1-8b-instruct:free";
          return await callOpenAICompatible(prompt, "https://openrouter.ai/api", apiKey, model);
        }

        default:
          throw new Error(`Unknown LLM_PROVIDER: ${provider}. Use GEMINI, GROQ, OPENAI, or OPENROUTER`);
      }
    } catch (error) {
      const msg = error.message || "";
      const isRateLimit = msg.includes("429") || msg.includes("quota") || msg.includes("rate");
      const delay = isRateLimit ? 15000 * attempt : 3000 * attempt;

      console.error(`  [LLM] Attempt ${attempt}/${retries} failed: ${msg.substring(0, 150)}`);
      if (attempt === retries) throw error;

      console.log(`  [LLM] Retrying in ${delay / 1000}s...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

module.exports = { callGemini: callLLM };
