import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "50mb" }));

// Server-side Gemini AI Client
let aiClient: GoogleGenAI | null = null;
function getAIClient(): GoogleGenAI | null {
  if (!aiClient && process.env.GEMINI_API_KEY) {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// Helper to resolve image to base64 and mimeType
async function resolveImageToParts(
  input: string,
  fallbackMime: string = "image/jpeg"
): Promise<{ base64: string; mimeType: string } | null> {
  if (!input || typeof input !== "string") return null;

  // Case 1: Remote HTTP/HTTPS URL
  if (input.startsWith("http://") || input.startsWith("https://")) {
    try {
      const response = await fetch(input);
      if (!response.ok) {
        console.warn(`Failed to fetch image from URL: ${input}, status: ${response.status}`);
        return null;
      }
      const arrayBuffer = await response.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString("base64");
      const contentType = response.headers.get("content-type");
      const mimeType = contentType ? contentType.split(";")[0].trim() : fallbackMime;
      return { base64, mimeType };
    } catch (err) {
      console.warn(`Error downloading remote image URL: ${input}`, err);
      return null;
    }
  }

  // Case 2: Data URI (e.g. data:image/jpeg;base64,....)
  if (input.startsWith("data:")) {
    const match = input.match(/^data:([^;]+);base64,(.+)$/s);
    if (match) {
      return {
        mimeType: match[1] || fallbackMime,
        base64: match[2].trim(),
      };
    }
    const clean = input.replace(/^data:[^;]+;base64,/, "").trim();
    return { base64: clean, mimeType: fallbackMime };
  }

  // Case 3: Raw base64 string
  return { base64: input.trim(), mimeType: fallbackMime };
}

// AI Crop Damage Assessment Endpoint
app.post("/api/ai/assess-crop-damage", async (req, res) => {
  try {
    const {
      imageBase64,
      mimeType = "image/jpeg",
      cropType = "Rice",
      stage = "Flowering",
      disasterType = "Heavy Rainfall",
      evidenceType = "Post-disaster",
    } = req.body;

    const ai = getAIClient();

    if (!imageBase64) {
      return res.status(400).json({ error: "Missing imageBase64 parameter" });
    }

    // Resolve image into pure Base64 bytes & MIME type
    const resolvedImage = await resolveImageToParts(imageBase64, mimeType);

    if (!ai || !resolvedImage || !resolvedImage.base64) {
      // Fallback demo/mock assessment with realistic domain parameters
      const isSevere =
        disasterType === "Flood" ||
        disasterType === "Heavy Rainfall" ||
        evidenceType === "Damaged area";
      const mockResult = {
        isFallback: true,
        fallbackReason: !ai ? "Gemini API client not initialized" : "Unable to decode image bytes",
        finalStatus: "NEEDS REVIEW",
        evidenceType: evidenceType || "Post-disaster",
        evidenceQuality: "MEDIUM",
        cropIdentified: cropType || "Rice (Paddy)",
        cropStage: stage || "Flowering",
        observedConditions: "Cannot determine field conditions offline",
        damageSeverity: "UNKNOWN",
        estimatedAffectedArea: "UNKNOWN",
        detectedDamage: [],
        evidenceMismatch: false,
        confidence: 0,
        reason: "AI service temporarily unavailable. Human review required for damage assessment.",
        humanReviewRequired: true,
      };
      return res.json({ success: true, assessment: mockResult });
    }

    const prompt = `You are AgriShield's AI Evidence Verification and Damage Assessment Engine.

FIRST verify what is actually visible in the uploaded image. Do NOT assume it is a crop photograph based on the farmer's claim, disaster type, GPS, weather, or crop registration.
Context (Treat this as metadata, NOT visual proof):
- Registered Crop: \${cropType}
- Crop Stage: \${stage}
- Reported Disaster: \${disasterType}
- Evidence Category: \${evidenceType}

If the image is not clearly agricultural evidence (for example: MRI/CT/X-ray, document, syllabus, PDF, screenshot, computer/mobile screen, random or unrelated image), immediately return:

FINAL STATUS: INVALID EVIDENCE
REASON: [why the image is invalid]
DAMAGE: NOT APPLICABLE
DAMAGE SEVERITY: NOT APPLICABLE
AFFECTED AREA: NOT APPLICABLE
IMPACT PERCENTAGE: NOT APPLICABLE

STOP. Do not perform any crop or damage analysis.

Only if the image clearly shows a crop/field should you:
1. Identify the visible crop and stage if possible.
2. Detect only damage that is visually observable.
3. Estimate severity only when supported by the image.
4. Estimate affected area/percentage ONLY when the image provides sufficient evidence; otherwise return UNKNOWN.
5. Flag inconsistencies with the registered crop/stage as EVIDENCE MISMATCH.

Never invent crop damage, severity, or percentages.
Never use the reported disaster, weather, GPS, or claim information as proof of visual damage.
Clearly distinguish observed facts from assumptions.

Final status must be one of:
VERIFIED EVIDENCE
NEEDS REVIEW
INVALID EVIDENCE
EVIDENCE MISMATCH

AI assessment is preliminary; final insurance decisions require human review.

OUTPUT
Return a strictly formatted JSON object with these exact keys. Ensure the keys follow this exact naming and casing:

{
  "finalStatus": "VERIFIED EVIDENCE" | "NEEDS REVIEW" | "INVALID EVIDENCE" | "EVIDENCE MISMATCH",
  "evidenceType": "Identified evidence type from the image, or the provided category",
  "evidenceQuality": "HIGH" | "MEDIUM" | "LOW" | "INVALID",
  "cropIdentified": "Crop name visually identified or 'Unknown'",
  "cropStage": "Crop stage visually apparent",
  "observedConditions": "Concise description of field conditions based ONLY on what is visible",
  "detectedDamage": ["List", "of", "confirmed", "visible", "damages", "or 'None'"],
  "damageSeverity": "NONE" | "LOW" | "MODERATE" | "HIGH" | "SEVERE" | "UNKNOWN",
  "estimatedAffectedArea": "Percentage or 'UNKNOWN' if cannot be reliably estimated",
  "evidenceMismatch": true | false,
  "confidence": number between 0 and 100,
  "reason": "Detailed explanation of the visual findings that justify the assessment",
  "humanReviewRequired": true | false
}

Important: Return valid JSON only without markdown wrapping.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.7-flash",
      contents: {
        parts: [
          {
            inlineData: {
              data: resolvedImage.base64,
              mimeType: resolvedImage.mimeType,
            },
          },
          {
            text: prompt,
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
      },
    });

    const text = response.text || "{}";
    let parsedResult;
    try {
      parsedResult = JSON.parse(text);
    } catch {
      // In case json wrapper was added
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      parsedResult = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    }

    if (!parsedResult) {
      throw new Error("Failed to parse AI response JSON");
    }

    if (parsedResult.finalStatus === "INVALID EVIDENCE") {
      parsedResult.damageSeverity = "UNKNOWN";
      parsedResult.estimatedAffectedArea = "UNKNOWN";
      parsedResult.detectedDamage = [];
    }

    parsedResult.isFallback = false;
    return res.json({ success: true, assessment: parsedResult });
  } catch (error: any) {
    console.error("Gemini assessment error:", error);
    const isSevere =
      req.body?.disasterType === "Flood" ||
      req.body?.disasterType === "Heavy Rainfall" ||
      req.body?.evidenceType === "Damaged area";
    // Return structured safe fallback
    return res.json({
      success: true,
      assessment: {
        isFallback: true,
        fallbackReason: error?.message || "AI service temporarily unavailable",
        finalStatus: "NEEDS REVIEW",
        evidenceType: req.body?.evidenceType || "Post-disaster",
        evidenceQuality: "MEDIUM",
        cropIdentified: req.body?.cropType || "Unknown",
        cropStage: req.body?.stage || "Unknown",
        observedConditions: "Cannot determine visually due to API failure",
        detectedDamage: [],
        damageSeverity: "UNKNOWN",
        estimatedAffectedArea: "UNKNOWN",
        evidenceMismatch: false,
        confidence: 0,
        reason: "Image analysis failed or was unavailable. Manual verification required.",
        humanReviewRequired: true,
      },
    });
  }
});

// Weather API Proxy / Aggregator with Open-Meteo Integration
app.get("/api/weather", async (req, res) => {
  try {
    const { lat, lng, startDate, endDate } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({ success: false, error: "Latitude and longitude required" });
    }

    const latNum = parseFloat(lat as string);
    const lngNum = parseFloat(lng as string);

    const today = new Date().toISOString().split("T")[0];
    const defaultStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const targetStartDate = (startDate as string) || defaultStart;
    const targetEndDate = (endDate as string) || today;

    const openMeteoUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${latNum}&longitude=${lngNum}&start_date=${targetStartDate}&end_date=${targetEndDate}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,rain_sum,wind_speed_10m_max&timezone=auto`;

    let data;
    try {
      const response = await fetch(openMeteoUrl);
      if (response.ok) {
        data = await response.json();
      } else {
        const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latNum}&longitude=${lngNum}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,rain_sum,wind_speed_10m_max&past_days=7&forecast_days=3&timezone=auto`;
        const forecastRes = await fetch(forecastUrl);
        if (forecastRes.ok) {
          data = await forecastRes.json();
        }
      }
    } catch {
      data = null;
    }

    if (!data || !data.daily || !data.daily.time || data.daily.time.length === 0) {
      return res.status(504).json({ success: false, error: "Weather data unavailable from Open-Meteo API for these coordinates." });
    }

    const times = data.daily.time || [];
    const rainSums = data.daily.precipitation_sum || data.daily.rain_sum || [];
    const rawWindSpeeds = data.daily.wind_speed_10m_max || [];
    // Convert Open-Meteo wind speeds (m/s) to km/h for UI-consistent presentation
    const windSpeeds = (rawWindSpeeds || []).map((w: number) => Number(((w || 0) * 3.6).toFixed(1)));
    const maxTemps = data.daily.temperature_2m_max || [];

    let maxRain = 0;
    let maxRainDate = times[0] || today;
    let totalRain = 0;
    let maxWind = 0;
    let totalTemp = 0;

    rainSums.forEach((r: number, idx: number) => {
      const val = r || 0;
      totalRain += val;
      if (val > maxRain) {
        maxRain = val;
        maxRainDate = times[idx];
      }
    });

    windSpeeds.forEach((w: number) => {
      if ((w || 0) > maxWind) maxWind = w || 0;
    });

    maxTemps.forEach((t: number) => {
      totalTemp += (t || 0);
    });

    const avgMaxTemp = maxTemps.length > 0 ? Number((totalTemp / maxTemps.length).toFixed(1)) : 0;
    const isExtreme = maxRain > 30;

    return res.json({
      success: true,
      source: "open_meteo_live",
      location: { lat: latNum, lng: lngNum },
      daily: {
        time: times,
        precipitation_sum: rainSums,
        temperature_2m_max: maxTemps,
        wind_speed_10m_max: windSpeeds,
        weather_code: data.daily.weather_code || [],
      },
      correlationSummary: {
        peakRainfallDate: maxRainDate,
        peakRainfallMm: Number(maxRain.toFixed(1)),
        peakWindSpeedKmh: Number(maxWind.toFixed(1)),
        avgMaxTempC: avgMaxTemp,
        extremeEventConfirmed: isExtreme,
        eventLabel: isExtreme ? "Heavy Precipitation Anomaly Detected" : "Standard Meteorological Conditions",
        correlationStatement: isExtreme
          ? `Peak rainfall of ${maxRain.toFixed(1)} mm and max wind gusts of ${maxWind.toFixed(1)} km/h recorded around ${maxRainDate}.`
          : `Monitored rainfall max of ${maxRain.toFixed(1)} mm and average max temperature of ${avgMaxTemp}°C.`
      }
    });
  } catch (error: any) {
    console.error("Weather endpoint error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", app: "Smart Crop Insurance Platform", timestamp: new Date().toISOString() });
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Smart Crop Insurance Platform running on port ${PORT}`);
  });
}

startServer();
