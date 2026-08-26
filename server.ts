import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import {
  seedLessons,
  seedContacts,
  seedIncidents,
  seedNews,
  seedFeedback
} from "./server/seeds";
import { UserProfile, IncidentReport, FeedbackItem, ScamAnalysis } from "./src/types";

dotenv.config();

// Initialize Gemini Client
let ai: GoogleGenAI | null = null;
const API_KEY = process.env.GEMINI_API_KEY;

if (API_KEY && API_KEY !== "MY_GEMINI_API_KEY") {
  try {
    ai = new GoogleGenAI({
      apiKey: API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
    console.log("Successfully initialized Gemini GenAI Client.");
  } catch (error) {
    console.error("Error initializing Gemini Client:", error);
  }
} else {
  console.log("No valid GEMINI_API_KEY found. Falling back to rule-based security scanner.");
}

const app = express();
const PORT = 3000;

app.use(express.json());

// In-Memory Database State
const db = {
  users: [] as UserProfile[],
  lessons: [...seedLessons],
  incidents: [...seedIncidents],
  contacts: [...seedContacts],
  news: [...seedNews],
  feedback: [...seedFeedback],
  scamAnalyses: [] as ScamAnalysis[],
  currentUser: null as UserProfile | null
};

// Seed a default current user profile for quick out-of-the-box interaction
const defaultUser: UserProfile = {
  uid: "demo-user-123",
  email: "demo.student@safecampus.edu",
  displayName: "Alex Mercer",
  role: "student",
  score: 120,
  completedLessons: ["upi-scam"],
  reportsFiledCount: 1,
  createdAt: new Date().toISOString(),
  settings: {
    theme: "dark",
    notificationsEnabled: true,
    smsAlertsEnabled: false,
    language: "en"
  }
};
db.users.push(defaultUser);
db.currentUser = defaultUser;

// --- API ROUTES ---

// 1. Authentication Endpoints
app.post("/api/auth/signup", (req, res) => {
  const { email, password, displayName, role } = req.body;
  if (!email || !password || !displayName) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const existing = db.users.find(u => u.email === email);
  if (existing) {
    return res.status(400).json({ error: "Email already registered" });
  }

  const newUser: UserProfile = {
    uid: "user_" + Math.random().toString(36).substr(2, 9),
    email,
    displayName,
    role: role || "student",
    score: 0,
    completedLessons: [],
    reportsFiledCount: 0,
    createdAt: new Date().toISOString(),
    settings: {
      theme: "dark",
      notificationsEnabled: true,
      smsAlertsEnabled: false,
      language: "en"
    }
  };

  db.users.push(newUser);
  db.currentUser = newUser;
  res.status(201).json(newUser);
});

app.post("/api/auth/signin", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Missing email or password" });
  }

  const user = db.users.find(u => u.email === email);
  if (!user) {
    // For demo purposes, if user does not exist, let's auto-create them to keep the UX seamless
    const name = email.split("@")[0];
    const newUser: UserProfile = {
      uid: "user_" + Math.random().toString(36).substr(2, 9),
      email,
      displayName: name.charAt(0).toUpperCase() + name.slice(1),
      role: "student",
      score: 0,
      completedLessons: [],
      reportsFiledCount: 0,
      createdAt: new Date().toISOString(),
      settings: {
        theme: "dark",
        notificationsEnabled: true,
        smsAlertsEnabled: false,
        language: "en"
      }
    };
    db.users.push(newUser);
    db.currentUser = newUser;
    return res.status(200).json(newUser);
  }

  db.currentUser = user;
  res.status(200).json(user);
});

app.post("/api/auth/logout", (req, res) => {
  db.currentUser = null;
  res.json({ success: true });
});

app.get("/api/auth/me", (req, res) => {
  res.json(db.currentUser);
});

// 2. Lessons Endpoints
app.get("/api/lessons", (req, res) => {
  res.json(db.lessons);
});

app.get("/api/lessons/:id", (req, res) => {
  const lesson = db.lessons.find(l => l.id === req.params.id);
  if (!lesson) {
    return res.status(404).json({ error: "Lesson not found" });
  }
  res.json(lesson);
});

app.post("/api/lessons/:id/quiz", (req, res) => {
  const { selectedAnswerIndex } = req.body;
  const lessonId = req.params.id;

  const lesson = db.lessons.find(l => l.id === lessonId);
  if (!lesson) {
    return res.status(404).json({ error: "Lesson not found" });
  }

  // Currently we use a single quiz question model for simplicity
  const isCorrect = lesson.quiz[0].correctAnswerIndex === selectedAnswerIndex;

  if (isCorrect && db.currentUser) {
    const alreadyCompleted = db.currentUser.completedLessons.includes(lessonId);
    if (!alreadyCompleted) {
      db.currentUser.completedLessons.push(lessonId);
      db.currentUser.score += lesson.xpReward;
    }
  }

  res.json({
    isCorrect,
    correctAnswerIndex: lesson.quiz[0].correctAnswerIndex,
    explanation: lesson.quiz[0].explanation,
    userScore: db.currentUser ? db.currentUser.score : 0,
    completedLessons: db.currentUser ? db.currentUser.completedLessons : []
  });
});

// 3. Incidents Endpoints
app.get("/api/incidents", (req, res) => {
  res.json(db.incidents);
});

app.post("/api/incidents", (req, res) => {
  const { title, description, type, location, severity } = req.body;
  if (!title || !description || !type || !location) {
    return res.status(400).json({ error: "Missing required report fields" });
  }

  const newReport: IncidentReport = {
    id: "inc_" + Math.random().toString(36).substr(2, 9),
    title,
    description,
    type,
    location,
    date: new Date().toISOString().split("T")[0],
    status: "PENDING",
    severity: severity || "Medium",
    // Random coordinates inside India boundary box for presentation
    lat: 10 + Math.random() * 20,
    lng: 70 + Math.random() * 18
  };

  db.incidents.unshift(newReport);

  if (db.currentUser) {
    db.currentUser.reportsFiledCount += 1;
    db.currentUser.score += 25; // Reward community points for filing reports
  }

  res.status(201).json(newReport);
});

app.post("/api/incidents/:id/forward", (req, res) => {
  const report = db.incidents.find(r => r.id === req.params.id);
  if (!report) {
    return res.status(404).json({ error: "Report not found" });
  }

  // Simulate official government portal API forwarding
  report.status = "FORWARDED";
  report.governmentRefId = "NCRB-" + (2026) + "-" + Math.floor(10000 + Math.random() * 90000);

  res.json({
    success: true,
    status: report.status,
    governmentRefId: report.governmentRefId,
    message: "Incident successfully pushed to federal cybersecurity desk."
  });
});

// 4. Contacts, News & Settings Endpoints
app.get("/api/contacts", (req, res) => {
  res.json(db.contacts);
});

app.get("/api/news", (req, res) => {
  res.json(db.news);
});

app.get("/api/feedback", (req, res) => {
  res.json(db.feedback);
});

app.post("/api/feedback", (req, res) => {
  const { name, role, rating, comment } = req.body;
  if (!rating || !comment) {
    return res.status(400).json({ error: "Missing rating or comments" });
  }

  const item: FeedbackItem = {
    id: "feed_" + Math.random().toString(36).substr(2, 9),
    name: name || (db.currentUser ? db.currentUser.displayName : "Anonymous"),
    role: role || (db.currentUser ? db.currentUser.role : "Guest"),
    rating,
    comment,
    date: new Date().toISOString().split("T")[0]
  };

  db.feedback.unshift(item);
  res.status(201).json(item);
});

app.put("/api/settings", (req, res) => {
  if (!db.currentUser) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const { theme, notificationsEnabled, smsAlertsEnabled, language, displayName, role } = req.body;
  
  if (theme) db.currentUser.settings.theme = theme;
  if (notificationsEnabled !== undefined) db.currentUser.settings.notificationsEnabled = notificationsEnabled;
  if (smsAlertsEnabled !== undefined) db.currentUser.settings.smsAlertsEnabled = smsAlertsEnabled;
  if (language) db.currentUser.settings.language = language;
  if (displayName) db.currentUser.displayName = displayName;
  if (role) db.currentUser.role = role;

  res.json(db.currentUser);
});

// 5. AI Scam Analyzer Endpoint using Google GenAI
app.post("/api/analyze", async (req, res) => {
  const { text } = req.body;
  if (!text || text.trim().length === 0) {
    return res.status(400).json({ error: "No suspicious message provided for analysis." });
  }

  console.log(`Analyzing suspicious message (Length: ${text.length})...`);

  // If Gemini API is available, call it with retries and fallback models
  if (ai) {
    const models = ["gemini-2.5-flash", "gemini-3.5-flash", "gemini-3.1-flash-lite"];
    const prompt = `You are a cybersecurity scanner. Analyze the following suspicious message, link, email, or QR code destination. Carefully inspect for psychological coercion, urgency, request for private keys/credentials/UPI PINs, or spoofed URLs. Be factual, helpful, and write clear explanations.

Suspicious Text to Analyze:
"""
${text}
"""`;

    const systemInstruction = "You are SafeCampus AI, an award-winning security system built for students, seniors, and everyday citizens. Analyze the input, identify psychological manipulation tactics, danger signals, and clear defensive recommendations. Always output valid JSON strictly matching the requested schema.";

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        riskScore: { type: Type.INTEGER, description: "Risk rating from 0 (Safe) to 100 (Extremely Dangerous)" },
        verdict: { type: Type.STRING, description: "One-word assessment: SAFE, SUSPICIOUS, or FRAUD" },
        scamType: { type: Type.STRING, description: "Category of scam (e.g., Phishing Link, UPI PIN Trap, Lottery Scam, Job Offer Fraud, Bank Impersonation)" },
        confidence: { type: Type.INTEGER, description: "Confidence percentage (e.g., 95)" },
        dangerSigns: { 
          type: Type.ARRAY, 
          items: { type: Type.STRING },
          description: "List of 3-4 specific warning flags found in the text"
        },
        tacticsUsed: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "List of psychological triggers used (e.g., False Urgency, Fear, Greed, Authority Impersonation)"
        },
        safetyRecommendations: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "3-4 actionable instructions for the user (e.g., Do not enter PIN, block this number)"
        },
        explanation: { type: Type.STRING, description: "An easy-to-understand explanation of how this scam operates and why it was flagged." }
      },
      required: ["riskScore", "verdict", "scamType", "confidence", "dangerSigns", "tacticsUsed", "safetyRecommendations", "explanation"]
    };

    let lastError: any = null;
    let successData: any = null;

    for (const modelName of models) {
      const maxAttempts = 3;
      let backoffDelay = 1000;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          console.log(`Sending API request using model: ${modelName} (Attempt ${attempt}/${maxAttempts})...`);
          const response = await ai.models.generateContent({
            model: modelName,
            contents: prompt,
            config: {
              systemInstruction,
              responseMimeType: "application/json",
              responseSchema,
            }
          });

          const responseText = response.text;
          if (responseText) {
            successData = JSON.parse(responseText.trim());
            break;
          }
        } catch (err: any) {
          lastError = err;
          console.warn(`Attempt ${attempt} with model ${modelName} failed:`, err.message || err);
          if (attempt < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, backoffDelay));
            backoffDelay *= 2;
          }
        }
      }
      if (successData) {
        const analysis: ScamAnalysis = {
          id: "an_" + Math.random().toString(36).substr(2, 9),
          inputText: text,
          ...successData,
          analyzedAt: new Date().toISOString()
        };

        db.scamAnalyses.unshift(analysis);
        return res.json(analysis);
      }
    }

    console.error("Gemini API request failed on all models and retries, falling back to rule engine:", lastError);
  }

  // --- RULE-BASED SAFETY HEURISTIC ENGINE (Fallback) ---
  // If Gemini client isn't configured, or fails, we run a robust heuristic regex scanner.
  // This guarantees an exceptional, fully functioning experience.
  const lowerText = text.toLowerCase();
  let score = 15;
  let verdict: 'SAFE' | 'SUSPICIOUS' | 'FRAUD' = "SAFE";
  let scamType = "Generic Link or Message";
  const dangerSigns: string[] = [];
  const tactics: string[] = [];
  const recommendations: string[] = [
    "Never share OTPs, passwords, or credit card details via chats or links.",
    "Verify details on official company apps or portals before acting."
  ];
  let explanation = "This message seems relatively normal, but always verify before sharing personal data.";

  // Phishing Link checks
  if (lowerText.includes("http://") || lowerText.includes("https://") || lowerText.includes(".net/") || lowerText.includes(".info/")) {
    score += 25;
    scamType = "Phishing Link Warning";
    dangerSigns.push("Contains an external web link targeting unverified domains.");
    recommendations.push("Do not click links originating from unsolicited messages.");
  }

  // Urgent triggers
  if (lowerText.match(/(block|suspend|disconnect|cancel|expire|terminate|urgent|within|immediately|24 hours|last chance)/)) {
    score += 25;
    tactics.push("False Urgency (manipulating you to act fast without thinking)");
    dangerSigns.push("Creates high panic by threatening immediate suspension or losses.");
    explanation = "The message utilizes intense psychological urgency to force quick, uncalculated actions.";
  }

  // Payment UPI checks
  if (lowerText.match(/(upi|pin|gpay|paytm|phonepe|wallet|receive cash|scan QR|refund|claim bonus)/)) {
    score += 30;
    scamType = "UPI Payment Trap";
    tactics.push("Greed (claiming free cash rewards) or Confusion");
    dangerSigns.push("Mentions mobile UPI wallets, scanning codes, or receiving cash refunds.");
    recommendations.push("Remember: You NEVER need to enter your UPI PIN to receive money.");
    explanation = "This message matches typical UPI money request scams where fraudsters claim scanning a QR code or typing a PIN sends money to your bank.";
  }

  // Impersonation
  if (lowerText.match(/(bank|netflix|amazon|customs|delivery|post|courier|lottery|win|congratulations|prize)/)) {
    score += 15;
    tactics.push("Authority Impersonation (mimicking a well-known brand or government body)");
    dangerSigns.push("Pretends to be a trusted provider, carrier, or prize distributor.");
  }

  score = Math.min(score, 100);
  if (score >= 70) {
    verdict = "FRAUD";
  } else if (score >= 35) {
    verdict = "SUSPICIOUS";
  }

  const isKeyMissing = !process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "MY_GEMINI_API_KEY";

  const result: ScamAnalysis = {
    id: "an_" + Math.random().toString(36).substr(2, 9),
    inputText: text,
    riskScore: score,
    verdict,
    scamType,
    confidence: score > 35 ? 85 : 90,
    dangerSigns: dangerSigns.length > 0 ? dangerSigns : ["Unusual formatting or cold message origin."],
    tacticsUsed: tactics.length > 0 ? tactics : ["Cold contact requesting external verification."],
    safetyRecommendations: recommendations,
    explanation: explanation || "Our AI patterns flagged key vocabulary terms often correlated with digital credit fraud and credentials phishing.",
    analyzedAt: new Date().toISOString(),
    isAiFallback: true,
    isKeyMissing
  };

  db.scamAnalyses.unshift(result);
  res.json(result);
});

// --- INTEGRATE VITE FOR SPA FLOWS ---
async function startViteServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Mounted Vite development middleware.");
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
    console.log("Mounted static production assets from /dist.");
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`SafeCampus AI Full-Stack Server running at http://0.0.0.0:${PORT}`);
  });
}

startViteServer();
