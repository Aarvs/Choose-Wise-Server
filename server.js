import { GoogleGenAI } from "@google/genai";
import express from "express"
import cors from "cors"
import axios from "axios"
import 'dotenv/config'

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: [
    'http://localhost:3001',
    'http://localhost:3000',
    'https://choose-wise.vercel.app',
    'https://choose-wise-ozlsma7j5-aarvs-projects.vercel.app',
    'https://choose-wise-*.vercel.app'
  ],
  credentials: true
}));
app.use(express.json());

// Configuration
const CONFIG = {
  RETRY_ATTEMPTS: 2,
  TIMEOUT: 30000,
};

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "Server is running!",
    timestamp: new Date().toISOString(),
    services: {
      claude: !!process.env.ANTHROPIC_API_KEY,
      gemini: !!process.env.GEMINI_API_KEY,
      openai: !!process.env.OPENAI_API_KEY,
    },
  });
});

// Claude API call (using correct Claude 4 model names)
const callClaudeAPI = async (prompt, systemPrompt) => {
  console.log("🔵 Calling Claude API...");

  return await axios.post(
    "https://api.anthropic.com/v1/messages",
    {
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: "user", content: prompt }],
    },
    {
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      timeout: CONFIG.TIMEOUT,
    }
  );
};

let ai;

// Function to initialize and validate the Gemini client
function initializeGeminiClient() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY environment variable is not set.");
  }
  // Re-initialize the client. Consider caching it in production.
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

// Optimized Gemini API call
const callGeminiAPI = async (prompt, systemPrompt) => {
  console.log("🟡 Calling Gemini API...");

  // Initialize the client on each call, or check its validity
  try {
    ai = initializeGeminiClient();
  } catch (initializationError) {
    console.error("❌ Gemini client initialization failed:", initializationError.message);
    throw new Error("Gemini service is unavailable due to configuration error.");
  }

  try {
    const fullPrompt = `${systemPrompt}\n\nUser Request: ${prompt}`;
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash', // Using a verified model name
      contents: fullPrompt,
      // Optional: Add generationConfig for more control
      // generationConfig: {
      //   temperature: 0.7,
      //   maxOutputTokens: 1000,
      // },
    });

    // Check if the response and its text property are valid
    if (!response || !response.text) {
      throw new Error("Invalid response structure from Gemini API");
    }

    return response;
  } catch (error) {
    console.error("Gemini API error:", error);
    // Re-throw the error with a clear message for the router to handle
    throw new Error(`Gemini API call failed: ${error.message}`);
  }
};

// OpenAI API call (backup)
const callOpenAIAPI = async (prompt, systemPrompt) => {
  console.log("🟢 Calling OpenAI API...");

  return await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-3.5-turbo", // Cheaper model
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      max_tokens: 1000,
      temperature: 0.7,
    },
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      timeout: CONFIG.TIMEOUT,
    }
  );
};

// Main API endpoint
app.post("/api/claude", async (req, res) => {
  const requestId = Math.random().toString(36).substring(7);
  console.log(`🎯 [${requestId}] New request received`);

  try {
    const { prompt, systemPrompt } = req.body;

    if (!prompt || !systemPrompt) {
      return res.status(400).json({
        error: "Missing prompt or systemPrompt"
      });
    }

    // Try Claude first (primary service)
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        console.log(`[${requestId}] Trying Claude...`);
        const response = await callClaudeAPI(prompt, systemPrompt);

        console.log(`✅ [${requestId}] Claude SUCCESS`);
        return res.json({
          response: response.data.content[0].text,
          timestamp: new Date().toISOString(),
        });
      } catch (claudeError) {
        const status = claudeError.response?.status;
        const errorData = claudeError.response?.data;
        console.log(`❌ [${requestId}] Claude failed (${status}):`, errorData?.error?.message || claudeError.message);
      }
    }

    // Try Gemini fallback
    if (process.env.GEMINI_API_KEY) {
      try {
        console.log(`[${requestId}] Trying Gemini...`);
        const response = await callGeminiAPI(prompt, systemPrompt);

        console.log(`✅ [${requestId}] Gemini SUCCESS`);
        return res.json({
          response: response.text,
          timestamp: new Date().toISOString(),
        });
      } catch (geminiError) {
        const status = geminiError.response?.status;
        const errorData = geminiError.response?.data;
        console.log(`❌ [${requestId}] Gemini failed (${status}):`, errorData?.error?.message || geminiError.message);
      }
    }

    // Try OpenAI fallback (if you have credits)
    if (process.env.OPENAI_API_KEY) {
      try {
        console.log(`[${requestId}] Trying OpenAI...`);
        const response = await callOpenAIAPI(prompt, systemPrompt);

        console.log(`✅ [${requestId}] OpenAI SUCCESS`);
        return res.json({
          response: response.data.choices[0].message.content,
          timestamp: new Date().toISOString(),
        });
      } catch (openaiError) {
        const status = openaiError.response?.status;
        const errorData = openaiError.response?.data;
        console.log(`❌ [${requestId}] OpenAI failed (${status}):`, errorData?.error?.message || openaiError.message);
      }
    }

    // All services failed
    console.log(`🚨 [${requestId}] ALL SERVICES FAILED`);
    return res.status(503).json({
      error: "All AI services are currently unavailable. Please check your API keys and try again.",
    });

  } catch (error) {
    console.error(`🚨 [${requestId}] Server error:`, error);
    return res.status(500).json({
      error: "Internal server error",
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Choose-Wise Server running on http://localhost:${PORT}`);
  console.log(`\n🔧 API Status:`);
  console.log(`   Claude 4: ${process.env.ANTHROPIC_API_KEY ? "✅ Ready" : "❌ No API Key"}`);
  console.log(`   Gemini:   ${process.env.GEMINI_API_KEY ? "✅ Ready" : "❌ No API Key"}`);
  console.log(`   OpenAI:   ${process.env.OPENAI_API_KEY ? "✅ Ready" : "❌ No API Key"}`);
  console.log(`\n📝 Using CORRECT model names:`);
  console.log(`   Claude: claude-sonnet-4-20250514`);
  console.log(`   Gemini: gemini-2.5-flash (v1 API)`);
  console.log(`   OpenAI: gpt-3.5-turbo`);
  console.log(`\n🎯 Ready to serve requests!`);
});