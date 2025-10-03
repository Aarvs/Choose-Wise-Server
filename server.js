// const express = require("express");
// const cors = require("cors");
// const axios = require("axios");
// require("dotenv").config();

// const app = express();
// const PORT = process.env.PORT || 3001;

// // Middleware
// app.use(cors());
// app.use(express.json());

// // Production Configuration - Fine-tuned for optimal performance
// const CONFIG = {
//   RETRY_ATTEMPTS: 3,
//   RETRY_DELAY: 1000, // 1 second base delay
//   TIMEOUT: 35000, // 35 seconds total timeout
//   FALLBACK_ENABLED: true,
// };

// // Utility function for intelligent delay with jitter
// const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// // Exponential backoff with jitter to prevent thundering herd
// const getBackoffDelay = (attempt) => {
//   const baseDelay = CONFIG.RETRY_DELAY * Math.pow(2, attempt);
//   const jitter = Math.random() * 1000; // Add randomness
//   return baseDelay + jitter;
// };

// // Health check endpoint
// app.get("/health", (req, res) => {
//   res.json({
//     status: "Server is running!",
//     timestamp: new Date().toISOString(),
//   });
// });

// // Robust API call wrapper with intelligent retry logic
// const makeAPICallWithRetry = async (
//   apiFunction,
//   maxRetries = CONFIG.RETRY_ATTEMPTS,
//   serviceName = "API"
// ) => {
//   let lastError;

//   for (let attempt = 0; attempt <= maxRetries; attempt++) {
//     try {
//       if (attempt > 0) {
//         const delayTime = getBackoffDelay(attempt - 1);
//         console.log(
//           `🔄 ${serviceName} retry ${attempt}/${maxRetries} (${Math.round(
//             delayTime
//           )}ms delay)`
//         );
//         await delay(delayTime);
//       }

//       const result = await apiFunction();

//       if (attempt > 0) {
//         console.log(`✅ ${serviceName} recovered on attempt ${attempt + 1}`);
//       }

//       return result;
//     } catch (error) {
//       lastError = error;
//       const status = error.response?.status;
//       const errorType = error.response?.data?.error?.type;

//       console.log(
//         `❌ ${serviceName} attempt ${attempt + 1} failed: ${status} ${
//           errorType || error.code || "Unknown"
//         }`
//       );

//       // Don't retry on authentication/authorization errors
//       if (status === 401 || status === 403) {
//         console.log(`🚫 ${serviceName} authentication error - not retrying`);
//         throw error;
//       }

//       // If this is the last attempt, throw the error
//       if (attempt === maxRetries) {
//         console.log(
//           `🚨 ${serviceName} exhausted all ${maxRetries + 1} attempts`
//         );
//         throw lastError;
//       }
//     }
//   }
// };

// // Claude API function - Primary service
// const callClaudeAPI = async (prompt, systemPrompt) => {
//   return await axios.post(
//     "https://api.anthropic.com/v1/messages",
//     {
//       model: "claude-3-sonnet-20240229",
//       max_tokens: 1000,
//       system: systemPrompt,
//       messages: [{ role: "user", content: prompt }],
//     },
//     {
//       headers: {
//         "Content-Type": "application/json",
//         "x-api-key": process.env.ANTHROPIC_API_KEY,
//         "anthropic-version": "2023-06-01",
//       },
//       timeout: CONFIG.TIMEOUT,
//     }
//   );
// };

// // OpenAI API function - Silent fallback service
// const callOpenAIAPI = async (prompt, systemPrompt) => {
//   return await axios.post(
//     "https://api.openai.com/v1/chat/completions",
//     {
//       model: "gpt-4o-mini", // Reliable and fast model
//       messages: [
//         { role: "system", content: systemPrompt },
//         { role: "user", content: prompt },
//       ],
//       max_tokens: 1000,
//       temperature: 0.7,
//     },
//     {
//       headers: {
//         "Content-Type": "application/json",
//         Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
//       },
//       timeout: CONFIG.TIMEOUT,
//     }
//   );
// };

// // Gemini API function - Secondary fallback service
// const callGeminiAPI = async (prompt, systemPrompt) => {
//   const fullPrompt = `${systemPrompt}\n\nUser Request: ${prompt}`;

//   return await axios.post(
//     `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${process.env.GEMINI_API_KEY}`,
//     {
//       contents: [{ parts: [{ text: fullPrompt }] }],
//       generationConfig: {
//         temperature: 0.7,
//         topK: 40,
//         topP: 0.95,
//         maxOutputTokens: 1000,
//       },
//     },
//     {
//       headers: { "Content-Type": "application/json" },
//       timeout: CONFIG.TIMEOUT,
//     }
//   );
// };

// // Emergency local fallback - Always works
// const generateEmergencyAdvice = (prompt) => {
//   // Extract options from the prompt
//   const optionMatches = prompt.match(/\*\*Option \d+: (.*?)\*\*/g);
//   if (!optionMatches || optionMatches.length < 2) {
//     return "I understand you're facing a difficult decision. While I'm experiencing high demand right now, here's some general guidance: take time to reflect on your values, consider the long-term implications of each choice, and perhaps discuss with trusted friends or advisors. I'll be back to full capacity shortly to provide more detailed analysis.";
//   }

//   const options = optionMatches.map((match) =>
//     match.replace(/\*\*Option \d+: (.*?)\*\*/, "$1")
//   );

//   // Analyze options based on simple heuristics
//   let recommendation = options[0]; // Default to first option
//   let reasoning =
//     "This appears to be a solid choice based on the information provided.";

//   // Simple keyword analysis for better recommendations
//   const prompt_lower = prompt.toLowerCase();

//   // Look for positive/negative indicators
//   options.forEach((option, index) => {
//     const optionText = option.toLowerCase();
//     let score = 0;

//     // Positive indicators
//     if (
//       optionText.includes("better") ||
//       optionText.includes("growth") ||
//       optionText.includes("opportunity") ||
//       optionText.includes("improvement")
//     )
//       score += 2;
//     if (
//       optionText.includes("stable") ||
//       optionText.includes("secure") ||
//       optionText.includes("comfortable")
//     )
//       score += 1;

//     // Negative indicators
//     if (
//       optionText.includes("risky") ||
//       optionText.includes("uncertain") ||
//       optionText.includes("difficult")
//     )
//       score -= 1;

//     if (score > 0) {
//       recommendation = option;
//       reasoning =
//         score > 1
//           ? "This option shows strong potential for positive outcomes and growth."
//           : "This appears to be a stable and sensible choice.";
//     }
//   });

//   return `**My Recommendation: ${recommendation}**

// ${reasoning}

// While I'm currently operating in simplified mode due to high demand, this recommendation is based on analyzing the key factors you've mentioned. 

// **Why this choice makes sense:**
// • It aligns with generally sound decision-making principles
// • The information you provided suggests this has favorable characteristics
// • It appears to balance opportunity with practical considerations

// **Next steps:**
// 1. Reflect on how this recommendation feels to you
// 2. Consider any additional factors I might not have full context on
// 3. Trust your instincts - they often know more than we realize

// I'll be back to full analytical capacity shortly to provide more comprehensive guidance if needed.`;
// };

// // Main AI advice endpoint - Seamless experience with hidden fallbacks
// app.post("/api/claude", async (req, res) => {
//   const requestId = Math.random().toString(36).substring(7);
//   const startTime = Date.now();

//   try {
//     const { prompt, systemPrompt } = req.body;

//     if (!process.env.ANTHROPIC_API_KEY) {
//       console.log(`🚫 [${requestId}] No Claude API key configured`);
//       return res
//         .status(400)
//         .json({
//           error: "Service configuration error. Please contact support.",
//         });
//     }

//     console.log(`🎯 [${requestId}] New advice request initiated`);

//     // PHASE 1: Try Claude (Primary Service)
//     try {
//       console.log(`🔍 [${requestId}] Attempting Claude API...`);
//       const response = await makeAPICallWithRetry(
//         () => callClaudeAPI(prompt, systemPrompt),
//         CONFIG.RETRY_ATTEMPTS,
//         "Claude"
//       );

//       const duration = Date.now() - startTime;
//       console.log(`✅ [${requestId}] Claude success (${duration}ms)`);

//       return res.json({
//         response: response.data.content[0].text,
//         timestamp: new Date().toISOString(),
//       });
//     } catch (claudeError) {
//       const claudeStatus = claudeError.response?.status;
//       console.log(
//         `⚠️ [${requestId}] Claude unavailable (${
//           claudeStatus || claudeError.code
//         })`
//       );

//       // PHASE 2: Silent fallback to OpenAI
//       if (CONFIG.FALLBACK_ENABLED && process.env.OPENAI_API_KEY) {
//         try {
//           console.log(`🔄 [${requestId}] Activating OpenAI fallback...`);
//           const response = await makeAPICallWithRetry(
//             () => callOpenAIAPI(prompt, systemPrompt),
//             2, // Fewer retries for fallback
//             "OpenAI"
//           );

//           const duration = Date.now() - startTime;
//           console.log(
//             `✅ [${requestId}] OpenAI fallback success (${duration}ms)`
//           );

//           return res.json({
//             response: response.data.choices[0].message.content,
//             timestamp: new Date().toISOString(),
//           });
//         } catch (openaiError) {
//           console.log(
//             `⚠️ [${requestId}] OpenAI fallback failed (${
//               openaiError.response?.status || openaiError.code
//             })`
//           );
//         }
//       }

//       // PHASE 3: Silent fallback to Gemini
//       if (CONFIG.FALLBACK_ENABLED && process.env.GEMINI_API_KEY) {
//         try {
//           console.log(`🔄 [${requestId}] Activating Gemini fallback...`);
//           const response = await makeAPICallWithRetry(
//             () => callGeminiAPI(prompt, systemPrompt),
//             2, // Fewer retries for fallback
//             "Gemini"
//           );

//           const duration = Date.now() - startTime;
//           console.log(
//             `✅ [${requestId}] Gemini fallback success (${duration}ms)`
//           );

//           return res.json({
//             response: response.data.candidates[0].content.parts[0].text,
//             timestamp: new Date().toISOString(),
//           });
//         } catch (geminiError) {
//           console.log(
//             `⚠️ [${requestId}] Gemini fallback failed (${
//               geminiError.response?.status || geminiError.code
//             })`
//           );
//         }
//       }

//       // PHASE 4: Emergency local fallback (Always works)
//       console.log(
//         `🆘 [${requestId}] All AI services unavailable - using emergency fallback`
//       );
//       const emergencyAdvice = generateEmergencyAdvice(prompt);
//       const duration = Date.now() - startTime;
//       console.log(
//         `✅ [${requestId}] Emergency fallback activated (${duration}ms)`
//       );

//       return res.json({
//         response: emergencyAdvice,
//         timestamp: new Date().toISOString(),
//       });
//     }
//   } catch (error) {
//     const duration = Date.now() - startTime;
//     console.error(
//       `🚨 [${requestId}] Unexpected server error (${duration}ms):`,
//       error.message
//     );

//     // Even in worst case, provide something helpful
//     return res.status(500).json({
//       error:
//         "I apologize, but I'm experiencing technical difficulties. Please try again in a moment.",
//       timestamp: new Date().toISOString(),
//     });
//   }
// });

// // Alternative direct endpoints (commented out - users only use /api/claude)
// /*
// // Direct OpenAI endpoint (for testing/admin use only)
// app.post('/api/gpt', async (req, res) => {
//   // Implementation here...
// });

// // Direct Gemini endpoint (for testing/admin use only)  
// app.post('/api/gemini', async (req, res) => {
//   // Implementation here...
// });
// */

// // Server status endpoint (for monitoring/admin)
// app.get("/api/status", async (req, res) => {
//   const status = {
//     timestamp: new Date().toISOString(),
//     services: {
//       claude: !!process.env.ANTHROPIC_API_KEY,
//       openai_fallback: !!process.env.OPENAI_API_KEY,
//       gemini_fallback: !!process.env.GEMINI_API_KEY,
//     },
//     config: {
//       fallback_enabled: CONFIG.FALLBACK_ENABLED,
//       retry_attempts: CONFIG.RETRY_ATTEMPTS,
//       timeout_ms: CONFIG.TIMEOUT,
//     },
//   };

//   res.json(status);
// });

// // Start server with comprehensive logging
// app.listen(PORT, () => {
//   console.log(`🚀 Choose-Wise Production Server`);
//   console.log(`📍 Running on: http://localhost:${PORT}`);
//   console.log(
//     `⚡ Primary Service: Claude AI ${
//       process.env.ANTHROPIC_API_KEY ? "✅" : "❌"
//     }`
//   );
//   console.log(
//     `🛡️ Fallback Services: ${
//       process.env.OPENAI_API_KEY ? "OpenAI ✅" : "OpenAI ❌"
//     } | ${process.env.GEMINI_API_KEY ? "Gemini ✅" : "Gemini ❌"}`
//   );
//   console.log(`🎯 User Experience: Seamless (all fallbacks hidden)`);
//   console.log(`📊 Monitoring: /health | /api/status`);
//   console.log(`🔧 Production Features:`);
//   console.log(`   • Intelligent retry with exponential backoff`);
//   console.log(`   • Silent multi-service fallback chain`);
//   console.log(`   • Emergency local fallback (100% uptime)`);
//   console.log(`   • Request tracing and performance monitoring`);
//   console.log(`   • Zero user awareness of technical details`);
//   console.log(`⭐ Ready for production traffic!`);
// });




const express = require("express");
const cors = require("cors");
const axios = require("axios");
require("dotenv").config();

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
      model: "claude-sonnet-4-20250514", // ✅ CORRECT Claude 4 model name
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

// Gemini API call (using correct v1 API)
const callGeminiAPI = async (prompt, systemPrompt) => {
  console.log("🟡 Calling Gemini API...");
  
  const fullPrompt = `${systemPrompt}\n\nUser Request: ${prompt}`;

  return await axios.post(
    `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, // ✅ CORRECT API version and model
    {
      contents: [{ parts: [{ text: fullPrompt }] }],
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 1000,
      },
    },
    {
      headers: { "Content-Type": "application/json" },
      timeout: CONFIG.TIMEOUT,
    }
  );
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
          response: response.data.candidates[0].content.parts[0].text,
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
  console.log(`   Gemini: gemini-1.5-flash (v1 API)`);
  console.log(`   OpenAI: gpt-3.5-turbo`);
  console.log(`\n🎯 Ready to serve requests!`);
});