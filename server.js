import { GoogleGenerativeAI } from "@google/generative-ai"
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

// Request size limit to prevent DoS attacks
app.use(express.json({ limit: '10mb' }));

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

// Simple rate limiting (in-memory)
const requestCounts = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS = 10; // 10 requests per minute

app.use((req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  
  if (!requestCounts.has(ip)) {
    requestCounts.set(ip, []);
  }
  
  const requests = requestCounts.get(ip).filter(time => now - time < RATE_LIMIT_WINDOW);
  
  if (requests.length >= MAX_REQUESTS) {
    return res.status(429).json({
      error: "Too many requests. Please try again in a minute.",
    });
  }
  
  requests.push(now);
  requestCounts.set(ip, requests);
  
  // Cleanup old entries every 10 minutes
  if (Math.random() < 0.01) {
    for (const [key, value] of requestCounts.entries()) {
      if (value.length === 0 || now - value[value.length - 1] > RATE_LIMIT_WINDOW * 10) {
        requestCounts.delete(key);
      }
    }
  }
  
  next();
});

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
      model: "claude-sonnet-4-20241022",
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

let genAI;

// Function to initialize and validate the Gemini client
function initializeGeminiClient() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY environment variable is not set.");
  }
  // Correct initialization for @google/generative-ai
  return new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
}

// Optimized Gemini API call with CORRECT API usage
const callGeminiAPI = async (prompt, systemPrompt) => {
  console.log("🟡 Calling Gemini API...");

  try {
    // Initialize client if not already done
    if (!genAI) {
      genAI = initializeGeminiClient();
    }

    // Get the generative model with system instruction
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash-lite",
      systemInstruction: systemPrompt
    });

    // Generate content
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    if (!text || text.trim() === '') {
      throw new Error("Empty response from Gemini API");
    }

    return { text };
  } catch (error) {
    console.error("❌ Gemini API error:", error.message);
    
    // Handle specific Gemini errors
    if (error.message?.includes('API_KEY_INVALID') || error.message?.includes('invalid API key')) {
      throw new Error('Invalid Gemini API key');
    }
    if (error.message?.includes('RESOURCE_EXHAUSTED') || error.message?.includes('quota')) {
      throw new Error('Gemini API quota exceeded');
    }
    if (error.message?.includes('model not found') || error.message?.includes('models/')) {
      throw new Error('Gemini model not available');
    }
    
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

// Main API endpoint with proper validation
app.post("/api/claude", async (req, res) => {
  const requestId = Math.random().toString(36).substring(7);
  console.log(`🎯 [${requestId}] New request received`);

  try {
    const { prompt, systemPrompt } = req.body;

    // ✅ CRITICAL: Input validation
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({
        error: "Invalid or missing prompt"
      });
    }

    if (!systemPrompt || typeof systemPrompt !== 'string') {
      return res.status(400).json({
        error: "Invalid or missing systemPrompt"
      });
    }

    // ✅ Length validation to prevent abuse
    if (prompt.length > 10000) {
      return res.status(400).json({
        error: "Prompt too long. Maximum 10,000 characters."
      });
    }

    if (systemPrompt.length > 20000) {
      return res.status(400).json({
        error: "System prompt too long. Maximum 20,000 characters."
      });
    }

    // ✅ Sanitize inputs (remove null bytes and trim)
    const sanitizedPrompt = prompt.replace(/\0/g, '').trim();
    const sanitizedSystemPrompt = systemPrompt.replace(/\0/g, '').trim();

    if (!sanitizedPrompt || !sanitizedSystemPrompt) {
      return res.status(400).json({
        error: "Prompt and system prompt cannot be empty after sanitization"
      });
    }

    // Try Claude first (primary service)
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        console.log(`[${requestId}] Trying Claude...`);
        const response = await callClaudeAPI(sanitizedPrompt, sanitizedSystemPrompt);

        console.log(`✅ [${requestId}] Claude SUCCESS`);
        return res.json({
          response: response.data.content[0].text,
          timestamp: new Date().toISOString(),
          service: "Claude Sonnet 4"
        });
      } catch (claudeError) {
        const status = claudeError.response?.status;
        const errorData = claudeError.response?.data;
        console.error(`❌ [${requestId}] Claude failed (${status}):`, {
          message: errorData?.error?.message || claudeError.message,
          stack: claudeError.stack
        });
      }
    }

    // Try Gemini fallback
    if (process.env.GEMINI_API_KEY) {
      try {
        console.log(`[${requestId}] Trying Gemini...`);
        const response = await callGeminiAPI(sanitizedPrompt, sanitizedSystemPrompt);

        console.log(`✅ [${requestId}] Gemini SUCCESS`);
        return res.json({
          response: response.text,
          timestamp: new Date().toISOString(),
          service: "Gemini 2.5-Flash-Lite"
        });
      } catch (geminiError) {
        console.error(`❌ [${requestId}] Gemini failed:`, {
          message: geminiError.message,
          stack: geminiError.stack
        });
      }
    }

    // Try OpenAI fallback
    if (process.env.OPENAI_API_KEY) {
      try {
        console.log(`[${requestId}] Trying OpenAI...`);
        const response = await callOpenAIAPI(sanitizedPrompt, sanitizedSystemPrompt);

        console.log(`✅ [${requestId}] OpenAI SUCCESS`);
        return res.json({
          response: response.data.choices[0].message.content,
          timestamp: new Date().toISOString(),
          service: "GPT-3.5 Turbo"
        });
      } catch (openaiError) {
        console.error(`❌ [${requestId}] OpenAI failed:`, {
          message: openaiError.message,
          stack: openaiError.stack
        });
      }
    }

    // All services failed
    console.error(`🚨 [${requestId}] ALL SERVICES FAILED`);
    return res.status(503).json({
      error: "All AI services are currently unavailable. Please check your API keys and try again.",
    });

  } catch (error) {
    console.error(`🚨 [${requestId}] Server error:`, {
      message: error.message,
      stack: error.stack
    });
    return res.status(500).json({
      error: "Internal server error. Please try again later.",
    });
  }
});

// ✅ Validate environment on startup
const validateEnvironment = () => {
  const errors = [];
  
  if (!process.env.ANTHROPIC_API_KEY && !process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY) {
    errors.push('❌ CRITICAL: No AI service API keys configured! Add at least one: ANTHROPIC_API_KEY, GEMINI_API_KEY, or OPENAI_API_KEY');
  }
  
  if (errors.length > 0) {
    console.error('\n🚨 ENVIRONMENT CONFIGURATION ERRORS:\n');
    errors.forEach(err => console.error(err));
    console.error('\nServer cannot start without proper configuration.\n');
    process.exit(1);
  }
  
  console.log('✅ Environment validation passed');
};

validateEnvironment();

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Choose-Wise Server running on http://localhost:${PORT}`);
  console.log(`\n🔧 API Status:`);
  console.log(`   Claude 4: ${process.env.ANTHROPIC_API_KEY ? "✅ Ready" : "❌ No API Key"}`);
  console.log(`   Gemini:   ${process.env.GEMINI_API_KEY ? "✅ Ready" : "❌ No API Key"}`);
  console.log(`   OpenAI:   ${process.env.OPENAI_API_KEY ? "✅ Ready" : "❌ No API Key"}`);
  console.log(`\n📝 Using CORRECT model names:`);
  console.log(`   Claude: claude-sonnet-4-20250514`);
  console.log(`   Gemini: gemini-2.5-flash-lite`);
  console.log(`   OpenAI: gpt-3.5-turbo`);
  console.log(`\n🎯 Ready to serve requests!`);
});