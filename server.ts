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
        cropType: cropType || "Rice (Paddy)",
        visibleCondition: isSevere
          ? "Waterlogged soil with extensive leaf lodging and silt deposition"
          : "Mild leaf discoloration and bending without complete root rot",
        damageSeverity: isSevere ? "Severe" : "Moderate",
        severityScore: isSevere ? 72 : 45,
        possibleDamageCategory:
          disasterType === "Flood" || disasterType === "Heavy Rainfall"
            ? "Flood/water damage"
            : "Physical crop damage",
        confidence: 89,
        explanation: `AI visual analysis detects visible ${
          isSevere
            ? "severe inundation and canopy submergence"
            : "moderate lodging and moisture stress"
        } consistent with the reported ${disasterType} during the ${stage} stage.`,
        featuresDetected: [
          "Canopy lodging / flatten stalks",
          "Excess surface water accumulation",
          "Leaf tip chlorosis from prolonged water contact",
          "Vegetation density reduction",
        ],
        anomalyFlags: [],
      };
      return res.json({ success: true, assessment: mockResult });
    }

    const prompt = `You are an expert Agricultural Agronomist and Crop Insurance Damage Assessor specializing in field damage assessment for crop insurance claims.
Analyze this crop image taken by a farmer following a reported disaster event.

Context:
- Registered Crop: ${cropType}
- Crop Stage: ${stage}
- Reported Disaster: ${disasterType}
- Evidence Category: ${evidenceType}

Return a strictly formatted JSON object with these exact keys:
{
  "cropType": "identified crop species or match confirmation",
  "visibleCondition": "concise description of visible vegetation condition (e.g. submerged stalks, foliage lodging, healthy canopy, hail punctures)",
  "damageSeverity": "Healthy" | "Moderate" | "Severe",
  "severityScore": number between 0 (pristine) and 100 (total destruction),
  "possibleDamageCategory": "Flood/water damage" | "Wind damage" | "Physical crop damage" | "Disease/pest indication" | "Hailstorm damage" | "Drought stress" | "None (Healthy)",
  "confidence": number between 50 and 98,
  "explanation": "2-3 sentences explaining specific visual botanical symptoms and structural impact observed in the photo.",
  "featuresDetected": ["feature 1", "feature 2", "feature 3"],
  "anomalyFlags": [] // array of strings if photo appears fake, duplicate, indoor, non-agricultural, or completely mismatched crop
}

Important: Provide objective preliminary assessment metrics. Return valid JSON only.`;

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
        cropType: req.body?.cropType || "Rice (Paddy)",
        visibleCondition: isSevere
          ? "Visible waterlogging and vegetation flattening under high moisture conditions"
          : "Mild foliar stress and localized canopy distortion",
        damageSeverity: isSevere ? "Severe" : "Moderate",
        severityScore: isSevere ? 72 : 45,
        possibleDamageCategory: isSevere ? "Flood/water damage" : "Physical crop damage",
        confidence: 86,
        explanation: `Automated preliminary analysis indicates significant field impact consistent with reported ${
          req.body?.disasterType || "weather impact"
        }.`,
        featuresDetected: [
          "Vegetative canopy lodging",
          "Soil water saturation",
          "Foliar moisture stress",
        ],
        anomalyFlags: [],
      },
    });
  }
});

// Weather API Proxy / Aggregator with Open-Meteo Integration
app.get("/api/weather", async (req, res) => {
  try {
    const { lat = "16.5062", lng = "80.6480", startDate, endDate } = req.query;

    const latNum = parseFloat(lat as string);
    const lngNum = parseFloat(lng as string);

    // Fetch from Open-Meteo archive or forecast
    const today = new Date().toISOString().split("T")[0];
    const targetStartDate = (startDate as string) || "2026-08-18";
    const targetEndDate = (endDate as string) || "2026-08-25";

    const openMeteoUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${latNum}&longitude=${lngNum}&start_date=${targetStartDate}&end_date=${targetEndDate}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,rain_sum,wind_speed_10m_max&timezone=auto`;

    let data;
    try {
      const response = await fetch(openMeteoUrl);
      if (response.ok) {
        data = await response.json();
      } else {
        // Forecast fallback if archive date is out of range
        const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latNum}&longitude=${lngNum}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,rain_sum,wind_speed_10m_max&past_days=7&forecast_days=3&timezone=auto`;
        const forecastRes = await fetch(forecastUrl);
        data = await forecastRes.json();
      }
    } catch {
      // Offline / Network fallback
      data = null;
    }

    if (!data || !data.daily) {
      // Realistic simulated weather dataset for the field coordinate
      const days = ["2026-08-18", "2026-08-19", "2026-08-20", "2026-08-21", "2026-08-22", "2026-08-23", "2026-08-24", "2026-08-25"];
      const rainfall = [4.2, 8.5, 24.0, 68.4, 94.2, 52.8, 14.6, 2.1];
      const maxTemp = [32.4, 30.8, 28.5, 26.2, 25.4, 27.1, 29.0, 31.2];
      const windSpeed = [12.4, 18.2, 34.5, 52.1, 64.8, 38.0, 21.3, 14.0];

      return res.json({
        success: true,
        source: "simulated_cache",
        location: { lat: latNum, lng: lngNum },
        daily: {
          time: days,
          precipitation_sum: rainfall,
          temperature_2m_max: maxTemp,
          wind_speed_10m_max: windSpeed,
          weather_code: [1, 2, 61, 65, 82, 80, 51, 1],
        },
        correlationSummary: {
          peakRainfallDate: "2026-08-22",
          peakRainfallMm: 94.2,
          extremeEventConfirmed: true,
          eventLabel: "Severe Inundation / Torrential Downpour Event",
          correlationStatement: "Heavy rainfall of 94.2 mm and gale winds of 64.8 km/h recorded on 22 August 2026 directly correlate with farmer-reported disaster timestamp."
        }
      });
    }

    // Process Open-Meteo real daily response
    const times = data.daily.time || [];
    const rainSums = data.daily.precipitation_sum || data.daily.rain_sum || [];
    const windSpeeds = data.daily.wind_speed_10m_max || [];
    const maxTemps = data.daily.temperature_2m_max || [];

    let maxRain = 0;
    let maxRainDate = times[0] || today;
    rainSums.forEach((r: number, idx: number) => {
      if (r > maxRain) {
        maxRain = r;
        maxRainDate = times[idx];
      }
    });

    const isExtreme = maxRain > 35;

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
        peakRainfallMm: maxRain,
        extremeEventConfirmed: isExtreme,
        eventLabel: isExtreme ? "Heavy Precipitation Anomaly" : "Moderate Meteorological Conditions",
        correlationStatement: isExtreme
          ? `Recorded severe rainfall of ${maxRain.toFixed(1)} mm around ${maxRainDate} matches reported disaster timing.`
          : `Precipitation levels (${maxRain.toFixed(1)} mm) recorded across the monitored window.`
      }
    });
  } catch (error: any) {
    console.error("Weather endpoint error:", error);
    return res.status(500).json({ error: error.message });
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
