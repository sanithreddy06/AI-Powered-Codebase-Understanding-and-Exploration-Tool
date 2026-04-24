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
    const timeoutMs = parseInt(process.env.LLM_REQUEST_TIMEOUT_MS || "300000", 10);
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error("Request timeout")); });
    req.write(JSON.stringify(body));
    req.end();
  });
}

function compactPrompt(prompt, maxChars = 12000) {
  const text = String(prompt || "");
  if (text.length <= maxChars) return text;

  // Keep beginning and ending context, trim the middle.
  const half = Math.floor((maxChars - 64) / 2);
  return `${text.slice(0, half)}\n\n[...prompt truncated for token budget...]\n\n${text.slice(-half)}`;
}

async function callOpenAICompatible(prompt, baseUrl, apiKey, model, options = {}) {
  const url = `${baseUrl.replace(/\/$/, "")}/v1/chat/completions`;
  const headers = {};
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const maxTokens = options.maxTokens ?? parseInt(process.env.LLM_MAX_OUTPUT_TOKENS || "1200", 10);
  const maxPromptChars = options.maxPromptChars ?? parseInt(process.env.LLM_MAX_PROMPT_CHARS || "12000", 10);
  const boundedPrompt = compactPrompt(prompt, maxPromptChars);
  console.log(`  [LLM] Using ${model} via ${baseUrl} (max_tokens: ${maxTokens})...`);
  const result = await httpsPost(url, headers, {
    model,
    messages: [{ role: "user", content: boundedPrompt }],
    temperature: 0.7,
    max_tokens: Number.isNaN(maxTokens) ? 1200 : maxTokens,
  });

  return result.choices[0].message.content;
}

// ─── Main Entry Point ───
async function callLLM(prompt, retries = 4) {
  const provider = (process.env.LLM_PROVIDER || "GEMINI").toUpperCase();
  const isPayloadError = (msg) =>
    msg.includes("413") || msg.includes("Request too large") || msg.includes("tokens per minute");

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

          try {
            return await callOpenAICompatible(prompt, "https://api.groq.com/openai", apiKey, model);
          } catch (groqError) {
            const msg = groqError.message || "";
            if (!isPayloadError(msg)) throw groqError;

            // Aggressive fallback attempt on Groq with a much smaller budget.
            console.warn("  [LLM] Groq token budget exceeded, retrying with compact budget...");
            try {
              return await callOpenAICompatible(prompt, "https://api.groq.com/openai", apiKey, model, {
                maxPromptChars: 4500,
                maxTokens: 700,
              });
            } catch (compactError) {
              const compactMsg = compactError.message || "";
              if (!isPayloadError(compactMsg)) throw compactError;

              // Final automatic fallback to Gemini when configured.
              const geminiKey = process.env.GEMINI_API_KEY;
              if (geminiKey && geminiKey !== "your_gemini_api_key_here") {
                console.warn("  [LLM] Falling back to Gemini due to Groq token budget limits...");
                return await callGemini(compactPrompt(prompt, 9000), geminiKey);
              }
              throw compactError;
            }
          }
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
      const isPayloadTooLarge = isPayloadError(msg);
      const delay = isRateLimit ? 15000 * attempt : 3000 * attempt;

      console.error(`  [LLM] Attempt ${attempt}/${retries} failed: ${msg.substring(0, 150)}`);
      if (isPayloadTooLarge) {
        throw new Error(
          "Prompt exceeded provider token budget (HTTP 413). " +
          "Try reducing repository size, switching to GEMINI, or lowering prompt/file limits."
        );
      }
      if (attempt === retries) throw error;

      console.log(`  [LLM] Retrying in ${delay / 1000}s...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

module.exports = { callGemini: callLLM };
