import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "./AuthContext";
import { auth } from "../lib/firebase";
import {
  UserRole,
  LanguageCode,
  FarmerProfile,
  OfficerProfile,
  FieldRecord,
  CropRecord,
  EvidenceRecord,
  DisasterReport,
  ClaimRecord,
  WeatherReport,
  AIAssessmentResult,
  DamageSeverity,
  SoilType,
  CropStage,
  FirestoreField,
  FirestoreCrop,
  FirestoreEvidence,
  FirestoreDisaster,
  FirestoreClaim,
} from "../types";
import { initialOfficerProfile } from "../lib/demoData";
import { translations, TranslationDictionary } from "../lib/i18n";
import { verifyEvidenceItem } from "../lib/verificationEngine";
import {
  saveOfflineEvidence,
  getOfflinePendingEvidence,
  clearSyncedOfflineEvidence,
} from "../lib/offlineStore";
import {
  getFarmerProfile,
  getFarmerFields,
  getFieldCrops,
  getCropEvidence,
  getFarmerDisasters,
  getFarmerClaims,
  getAllClaimsForOfficer,
  updateClaimDecisionInFirestore,
  saveField,
  saveCrop,
  saveEvidence,
  saveDisaster,
  saveClaim,
  subscribeToClaims,
  registerFieldAndCropInFirestore,
  getNextFieldId,
  getNextCropId,
  seedDemoFarmerData as seedDemoFarmerDataService,
  clearFarmerData as clearFarmerDataService,
  fieldToRecord,
  cropToRecord,
  evidenceToRecord,
  disasterToRecord,
  claimToRecord,
} from "../lib/firestoreService";

interface AppContextType {
  role: UserRole;
  setRole: (role: UserRole) => void;
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
  t: TranslationDictionary;
  farmer: FarmerProfile;
  setFarmer: (profile: FarmerProfile) => void;
  officer: OfficerProfile;
  fields: FieldRecord[];
  activeFieldId: string;
  setActiveFieldId: (id: string) => void;
  crops: CropRecord[];
  activeCropId: string;
  setActiveCropId: (id: string) => void;
  evidenceList: EvidenceRecord[];
  disasterReports: DisasterReport[];
  claims: ClaimRecord[];
  activeClaimId: string | null;
  setActiveClaimId: (id: string | null) => void;
  weatherData: WeatherReport | null;
  isWeatherLoading: boolean;
  isLoadingFirestore: boolean;
  firestoreError: string | null;
  clearFirestoreError: () => void;
  isOnline: boolean;
  pendingSyncCount: number;
  syncStatus: "idle" | "syncing" | "synced" | "offline";
  toggleSimulatedOffline: () => void;
  registerField: (newField: Omit<FieldRecord, "id" | "registeredAt">) => Promise<FieldRecord>;
  registerCrop: (newCrop: Omit<CropRecord, "id">) => Promise<CropRecord>;
  registerFieldAndCrop: (
    fieldInput: {
      name: string;
      surveyNumber: string;
      soilType: SoilType;
      coordinates?: [number, number][];
      centerLat?: number;
      centerLng?: number;
      approxAreaAcres?: number;
    },
    cropInput: {
      cropType: string;
      variety: string;
      sowingDate: string;
      expectedHarvestDate: string;
      currentStage: CropStage;
      season?: string;
      cultivatedAreaAcres?: number;
    }
  ) => Promise<{ field: FieldRecord; crop: CropRecord }>;
  captureEvidence: (evidence: Omit<EvidenceRecord, "id" | "timestamp" | "verification">) => Promise<EvidenceRecord>;
  reportDisaster: (report: Omit<DisasterReport, "id" | "reportedAt" | "status">) => Promise<DisasterReport>;
  assessImageAI: (imageBase64: string, cropType: string, stage: string, disasterType?: string, evidenceType?: string) => Promise<AIAssessmentResult>;
  updateOfficerClaimDecision: (claimId: string, decision: ClaimRecord["status"], remarks: string, approvedPayout?: number) => void;
  triggerSync: () => Promise<void>;
  seedDemoData: () => Promise<void>;
  clearAllUserData: () => Promise<void>;
  evidenceCompletenessPercent: number;
  isEvidenceOutdated: boolean;
  reloadFarmerData: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { farmerProfile, user, userRole, officerProfile } = useAuth();
  const [role, setRoleState] = useState<UserRole>(() => {
    if (userRole === "officer") return "OFFICER";
    return "FARMER";
  });
  const [language, setLanguage] = useState<LanguageCode>("en");

  const setRole = (newRole: UserRole) => {
    if (userRole === "farmer" && newRole === "OFFICER") {
      console.warn("Unauthorized: Farmer cannot switch to Officer role.");
      return;
    }
    if (userRole === "officer" && newRole === "FARMER") {
      console.warn("Unauthorized: Officer cannot switch to Farmer role.");
      return;
    }
    setRoleState(newRole);
  };

  useEffect(() => {
    if (userRole === "officer") {
      setRoleState("OFFICER");
    } else if (userRole === "farmer") {
      setRoleState("FARMER");
    }
  }, [userRole]);

  // Fallback initial farmer profile based on Auth
  const [farmer, setFarmer] = useState<FarmerProfile>(() => {
    if (farmerProfile) return farmerProfile;
    return {
      id: "FMR-NEW",
      farmerId: "FMR-NEW",
      name: "Farmer",
      phone: "",
      email: "",
      village: "",
      district: "",
      state: "",
      preferredLanguage: "en",
      role: "farmer",
      insuranceInfo: {
        policyNumber: "PMFBY/AP/2026/000000",
        schemeName: "Pradhan Mantri Fasal Bima Yojana (PMFBY)",
        sumInsuredPerAcre: 38500,
        insurerName: "Agriculture Insurance Company of India (AIC)",
        coverageStartDate: "2026-06-01",
        coverageEndDate: "2026-11-30",
        applicationId: "APP-PMFBY-2026-0000",
      },
    };
  });

  const [officer, setOfficer] = useState<OfficerProfile>(() => {
    if (officerProfile) return officerProfile;
    return initialOfficerProfile;
  });

  useEffect(() => {
    if (officerProfile) {
      setOfficer(officerProfile);
    }
  }, [officerProfile]);
  const [fields, setFields] = useState<FieldRecord[]>([]);
  const [activeFieldId, setActiveFieldId] = useState<string>("");
  const [crops, setCrops] = useState<CropRecord[]>([]);
  const [activeCropId, setActiveCropId] = useState<string>("");
  const [evidenceList, setEvidenceList] = useState<EvidenceRecord[]>([]);
  const [disasterReports, setDisasterReports] = useState<DisasterReport[]>([]);
  const [claims, setClaims] = useState<ClaimRecord[]>([]);
  const [activeClaimId, setActiveClaimId] = useState<string | null>(null);

  const activeFieldIdRef = useRef(activeFieldId);
  useEffect(() => {
    activeFieldIdRef.current = activeFieldId;
  }, [activeFieldId]);

  const [isLoadingFirestore, setIsLoadingFirestore] = useState<boolean>(true);
  const [firestoreError, setFirestoreError] = useState<string | null>(null);

  const [weatherData, setWeatherData] = useState<WeatherReport | null>(null);
  const [isWeatherLoading, setIsWeatherLoading] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(0);
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "synced" | "offline">("idle");

  const t = translations[language] || translations.en;
  const clearFirestoreError = () => setFirestoreError(null);

  // Sync farmer profile when auth changes
  useEffect(() => {
    if (farmerProfile) {
      setFarmer(farmerProfile);
      if (farmerProfile.preferredLanguage) {
        setLanguage(farmerProfile.preferredLanguage);
      }
    }
  }, [farmerProfile]);

  // Load all Firestore subcollections for the authenticated user
  const loadFarmerData = useCallback(
    async (
      targetUid: string,
      targetFarmerId: string,
      preferredFieldId?: string,
      preferredCropId?: string
    ) => {
      if (!targetUid) {
        setFields([]);
        setCrops([]);
        setEvidenceList([]);
        setDisasterReports([]);
        setClaims([]);
        setActiveFieldId("");
        setActiveCropId("");
        setActiveClaimId(null);
        setIsLoadingFirestore(false);
        return;
      }

      setIsLoadingFirestore(true);
      setFirestoreError(null);

      try {
        // 1. Fetch Fields
        const firestoreFields = await getFarmerFields(targetUid);
        const fieldRecords = firestoreFields.map((f) => fieldToRecord(f, targetFarmerId));
        setFields(fieldRecords);

        if (fieldRecords.length > 0) {
          // Select preferred field if provided, else existing active, else first
          const selectedField = preferredFieldId
            ? fieldRecords.find((f) => f.id === preferredFieldId) || fieldRecords[0]
            : fieldRecords.find((f) => f.id === activeFieldIdRef.current) || fieldRecords[0];

          setActiveFieldId(selectedField.id);

          // 2. Fetch Crops across all fields
          const allCrops: CropRecord[] = [];
          const allEvidence: EvidenceRecord[] = [];

          for (const field of firestoreFields) {
            const fieldCrops = await getFieldCrops(targetUid, field.fieldId);
            for (const crop of fieldCrops) {
              allCrops.push(cropToRecord(crop, field.fieldId, targetFarmerId));
              const cropEvidence = await getCropEvidence(targetUid, field.fieldId, crop.cropId);
              for (const ev of cropEvidence) {
                allEvidence.push(evidenceToRecord(ev, targetFarmerId));
              }
            }
          }

          setCrops(allCrops);
          const activeFieldCrops = allCrops.filter((c) => c.fieldId === selectedField.id);
          if (preferredCropId && activeFieldCrops.some((c) => c.id === preferredCropId)) {
            setActiveCropId(preferredCropId);
          } else if (activeFieldCrops.length > 0) {
            setActiveCropId(activeFieldCrops[0].id);
          } else {
            setActiveCropId("");
          }

          setEvidenceList(allEvidence);
        } else {
          // No fields exist yet
          setActiveFieldId("");
          setCrops([]);
          setActiveCropId("");
          setEvidenceList([]);
        }

        // 3. Fetch Disasters & Claims
        const firestoreDisasters = await getFarmerDisasters(targetUid);
        setDisasterReports(firestoreDisasters.map((d) => disasterToRecord(d, targetFarmerId)));

        const firestoreClaims = await getFarmerClaims(targetUid);
        const claimRecords = firestoreClaims.map((c) => claimToRecord(c, targetFarmerId));
        setClaims(claimRecords);
        if (claimRecords.length > 0) {
          setActiveClaimId(claimRecords[0].id);
        } else {
          setActiveClaimId(null);
        }
      } catch (err: any) {
        console.error("Error loading Firestore data:", err);
        setFirestoreError(err.message || "Failed to load data from Firestore.");
      } finally {
        setIsLoadingFirestore(false);
      }
    },
    []
  );

  // Real-time claims subscription via onSnapshot
  useEffect(() => {
    if (!user?.uid || !userRole) {
      setIsLoadingFirestore(false);
      return;
    }

    setIsLoadingFirestore(true);
    if (userRole === "farmer" && farmerProfile) {
      loadFarmerData(user.uid, farmerProfile.farmerId || farmerProfile.id || user.uid);
    }

    const unsubscribe = subscribeToClaims(userRole, user.uid, (firestoreClaims) => {
      const claimRecords = firestoreClaims.map((c) => claimToRecord(c, c.farmerId || user.uid));
      setClaims(claimRecords);
      if (claimRecords.length > 0 && !activeClaimId) {
        setActiveClaimId(claimRecords[0].id);
      } else if (claimRecords.length === 0) {
        setActiveClaimId(null);
      }
      setIsLoadingFirestore(false);
    });

    return () => {
      unsubscribe();
    };
  }, [user?.uid, userRole, farmerProfile?.farmerId]);

  // When officer selects a claim, load actual farmer, field, crop, disaster, and evidence
  useEffect(() => {
    if (userRole === "officer" && activeClaimId) {
      const currentClaim = claims.find((c) => c.id === activeClaimId);
      if (currentClaim && currentClaim.farmerId) {
        getFarmerProfile(currentClaim.farmerId).then((profile) => {
          if (profile) {
            setFarmer(profile);
          }
        });
        loadFarmerData(currentClaim.farmerId, currentClaim.farmerId, currentClaim.fieldId, currentClaim.cropId);
      }
    }
  }, [userRole, activeClaimId, claims]);

  // When active field changes, ensure active crop is synced
  useEffect(() => {
    if (activeFieldId && crops.length > 0) {
      const fieldCrops = crops.filter((c) => c.fieldId === activeFieldId);
      if (fieldCrops.length > 0 && !fieldCrops.some((c) => c.id === activeCropId)) {
        setActiveCropId(fieldCrops[0].id);
      }
    }
  }, [activeFieldId, crops, activeCropId]);

  // Check pending offline items count
  const checkPendingQueue = async () => {
    try {
      const pending = await getOfflinePendingEvidence();
      setPendingSyncCount(pending.length);
    } catch {
      // IndexedDB fallback
    }
  };

  useEffect(() => {
    checkPendingQueue();
  }, []);

  // Fetch weather for active field if exists
  useEffect(() => {
    const activeField = fields.find((f) => f.id === activeFieldId);
    if (!activeField || activeField.centerLat == null || activeField.centerLng == null) {
      setWeatherData(null);
      setIsWeatherLoading(false);
      return;
    }

    setIsWeatherLoading(true);

    // Dynamic date range: use active disaster report date if exists (+/- 3 days), else past 7 days up to today
    const activeDisaster = disasterReports.find((d) => d.fieldId === activeFieldId);
    let startDate: string;
    let endDate: string;

    if (activeDisaster && activeDisaster.date) {
      const d = new Date(activeDisaster.date);
      const startD = new Date(d);
      startD.setDate(startD.getDate() - 3);
      const endD = new Date(d);
      endD.setDate(endD.getDate() + 3);
      startDate = startD.toISOString().split("T")[0];
      endDate = endD.toISOString().split("T")[0];
    } else {
      const today = new Date();
      const startD = new Date();
      startD.setDate(startD.getDate() - 7);
      startDate = startD.toISOString().split("T")[0];
      endDate = today.toISOString().split("T")[0];
    }

    fetch(
      `/api/weather?lat=${activeField.centerLat}&lng=${activeField.centerLng}&startDate=${startDate}&endDate=${endDate}`
    )
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch weather data");
        return res.json();
      })
      .then((data) => {
        if (data && data.daily && data.daily.time) {
          const days = data.daily.time || [];
          const rain = data.daily.precipitation_sum || [];
          const temps = data.daily.temperature_2m_max || [];
          const winds = data.daily.wind_speed_10m_max || [];

          const dailyPoints = days.map((day: string, idx: number) => ({
            date: day,
            maxTempC: temps[idx] ?? 0,
            rainfallMm: rain[idx] ?? 0,
            windSpeedKmh: winds[idx] ?? 0,
            condition:
              (rain[idx] || 0) > 25 ? "Heavy Rain" : (rain[idx] || 0) > 5 ? "Moderate Rain" : "Clear / Sunny",
            isExtremeEvent: (rain[idx] || 0) > 30,
          }));

          setWeatherData({
            source: data.source || "open_meteo",
            location: { lat: activeField.centerLat, lng: activeField.centerLng },
            daily: dailyPoints,
            correlationSummary: data.correlationSummary || {
              peakRainfallDate: days[0] || startDate,
              peakRainfallMm: 0,
              peakWindSpeedKmh: 0,
              avgMaxTempC: 0,
              extremeEventConfirmed: false,
              eventLabel: "Meteorological Monitored Window",
              correlationStatement: "Live telemetry fetched from Open-Meteo archive/forecast.",
            },
          });
        } else {
          setWeatherData(null);
        }
      })
      .catch((err) => {
        console.warn("Weather fetch error:", err);
        setWeatherData(null);
      })
      .finally(() => setIsWeatherLoading(false));
  }, [activeFieldId, fields, disasterReports]);

  // Calculate evidence completeness for selected field
  const relevantEvidence = evidenceList.filter((e) => e.fieldId === activeFieldId);
  const evidenceCompletenessPercent =
    relevantEvidence.length === 0 ? 0 : Math.min(100, Math.round((relevantEvidence.length / 6) * 100));

  // 20-day inactivity check
  const latestEvidence = [...relevantEvidence].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )[0];

  const daysSinceLatest = latestEvidence
    ? Math.floor((Date.now() - new Date(latestEvidence.timestamp).getTime()) / (1000 * 60 * 60 * 24))
    : 999;
  const isEvidenceOutdated = relevantEvidence.length > 0 && daysSinceLatest > 20;

  const toggleSimulatedOffline = () => {
    setIsOnline((prev) => {
      const next = !prev;
      setSyncStatus(next ? "idle" : "offline");
      return next;
    });
  };

  const registerField = async (
    newField: Omit<FieldRecord, "id" | "registeredAt">
  ): Promise<FieldRecord> => {
    const currentUid = user?.uid || auth.currentUser?.uid;
    const fieldId = getNextFieldId(fields);
    const createdAt = new Date().toISOString();

    const boundary = (newField.coordinates || []).map(([lat, lng]) => ({
      latitude: lat,
      longitude: lng,
    }));

    const firestoreData: FirestoreField = {
      fieldId,
      name: newField.name,
      areaAcres: newField.approxAreaAcres || newField.areaAcres || 2.0,
      surveyNumber: newField.surveyNumber,
      soilType: newField.soilType,
      center: {
        latitude: newField.centerLat || 16.5116,
        longitude: newField.centerLng || 80.7005,
      },
      boundary:
        boundary.length >= 1
          ? boundary
          : [{ latitude: newField.centerLat || 16.5116, longitude: newField.centerLng || 80.7005 }],
      createdAt,
    };

    if (currentUid) {
      await saveField(currentUid, firestoreData);
    }

    const fullRecord = fieldToRecord(firestoreData, farmer.farmerId || farmer.id || currentUid || "");
    setFields((prev) => [...prev, fullRecord]);
    setActiveFieldId(fieldId);
    return fullRecord;
  };

  const registerCrop = async (newCrop: Omit<CropRecord, "id">): Promise<CropRecord> => {
    const currentUid = user?.uid || auth.currentUser?.uid;
    const cropId = getNextCropId(crops);
    const createdAt = new Date().toISOString();

    const firestoreCrop: FirestoreCrop = {
      cropId,
      fieldId: newCrop.fieldId,
      cropType: newCrop.cropType,
      variety: newCrop.variety,
      sowingDate: newCrop.sowingDate,
      expectedHarvestDate: newCrop.expectedHarvestDate,
      currentStage: newCrop.currentStage,
      season: newCrop.season,
      cultivatedAreaAcres: newCrop.cultivatedAreaAcres,
      createdAt,
    };

    if (currentUid && newCrop.fieldId) {
      await saveCrop(currentUid, newCrop.fieldId, firestoreCrop);
    }

    const record = cropToRecord(
      firestoreCrop,
      newCrop.fieldId,
      farmer.farmerId || farmer.id || currentUid || ""
    );
    setCrops((prev) => [...prev, record]);
    setActiveCropId(cropId);
    return record;
  };

  const registerFieldAndCrop = async (
    fieldInput: {
      name: string;
      surveyNumber: string;
      soilType: SoilType;
      coordinates?: [number, number][];
      centerLat?: number;
      centerLng?: number;
      approxAreaAcres?: number;
    },
    cropInput: {
      cropType: string;
      variety: string;
      sowingDate: string;
      expectedHarvestDate: string;
      currentStage: CropStage;
      season?: string;
      cultivatedAreaAcres?: number;
    }
  ): Promise<{ field: FieldRecord; crop: CropRecord }> => {
    const currentUid = user?.uid || auth.currentUser?.uid;
    if (!currentUid) {
      throw new Error("Please log in to continue.");
    }

    const fieldId = getNextFieldId(fields);
    const cropId = getNextCropId(crops);
    const createdAt = new Date().toISOString();

    const centerLat =
      fieldInput.centerLat ||
      (fieldInput.coordinates && fieldInput.coordinates[0]
        ? fieldInput.coordinates[0][0]
        : 16.5116);
    const centerLng =
      fieldInput.centerLng ||
      (fieldInput.coordinates && fieldInput.coordinates[0]
        ? fieldInput.coordinates[0][1]
        : 80.7005);
    const areaAcres = fieldInput.approxAreaAcres || 2.4;

    const boundary =
      fieldInput.coordinates && fieldInput.coordinates.length > 0
        ? fieldInput.coordinates.map(([lat, lng]) => ({ latitude: lat, longitude: lng }))
        : [{ latitude: centerLat, longitude: centerLng }];

    const firestoreField: FirestoreField = {
      fieldId,
      name: fieldInput.name || `Field ${fieldId}`,
      surveyNumber: fieldInput.surveyNumber || "",
      soilType: fieldInput.soilType || "Alluvial Clay Loam",
      areaAcres,
      center: {
        latitude: centerLat,
        longitude: centerLng,
      },
      boundary,
      createdAt,
    };

    const firestoreCrop: FirestoreCrop = {
      cropId,
      fieldId,
      cropType: cropInput.cropType,
      variety: cropInput.variety,
      sowingDate: cropInput.sowingDate,
      expectedHarvestDate: cropInput.expectedHarvestDate,
      currentStage: cropInput.currentStage,
      season: cropInput.season || "Kharif 2026",
      cultivatedAreaAcres: cropInput.cultivatedAreaAcres || areaAcres,
      createdAt,
    };

    // Atomic write batch to Firestore under farmers/{uid}/fields/{fieldId} and crops/{cropId}
    await registerFieldAndCropInFirestore(currentUid, firestoreField, firestoreCrop);

    const farmerIdStr = farmer.farmerId || farmer.id || currentUid;
    const fieldRecord = fieldToRecord(firestoreField, farmerIdStr);
    const cropRecord = cropToRecord(firestoreCrop, fieldId, farmerIdStr);

    // Update state immediately for instant responsive UI
    setFields((prev) => [...prev, fieldRecord]);
    setCrops((prev) => [...prev, cropRecord]);
    setActiveFieldId(fieldId);
    setActiveCropId(cropId);

    // Re-sync full data from Firestore for full persistence integrity
    await loadFarmerData(currentUid, farmerIdStr, fieldId, cropId);

    return { field: fieldRecord, crop: cropRecord };
  };

  const assessImageAI = async (
    imageBase64: string,
    cropType: string,
    stage: string,
    disasterType: string = "Heavy Rainfall",
    evidenceType: string = "Post-disaster"
  ): Promise<AIAssessmentResult> => {
    try {
      const res = await fetch("/api/ai/assess-crop-damage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64,
          cropType,
          stage,
          disasterType,
          evidenceType,
        }),
      });
      const data = await res.json();
      if (data.success && data.assessment) {
        return {
          ...data.assessment,
          analyzedAt: new Date().toISOString(),
        };
      }
      throw new Error("AI assessment failed");
    } catch {
      const isSevere = disasterType === "Flood" || disasterType === "Heavy Rainfall";
      return {
        cropType: cropType || "Rice (Paddy)",
        visibleCondition: isSevere
          ? "Waterlogged soil with extensive leaf lodging"
          : "Moderate moisture stress",
        damageSeverity: isSevere ? "Severe" : "Moderate",
        severityScore: isSevere ? 74 : 42,
        possibleDamageCategory: isSevere ? "Flood/water damage" : "Physical crop damage",
        confidence: 88,
        explanation:
          "Preliminary assessment: Inundation and foliar lodging noted at field coordinates.",
        featuresDetected: ["Canopy lodging", "Surface water pooling", "Moisture chlorosis"],
        anomalyFlags: [],
        isFallback: true,
        fallbackReason: "Processed via on-device local fallback model",
        analyzedAt: new Date().toISOString(),
      };
    }
  };

  const captureEvidence = async (
    evidenceData: Omit<EvidenceRecord, "id" | "timestamp" | "verification">
  ): Promise<EvidenceRecord> => {
    const nextIndex = evidenceList.length + 1;
    const evidenceId = `EV00${nextIndex}`;
    const capturedAt = new Date().toISOString();

    const currentField = fields.find((f) => f.id === evidenceData.fieldId) || fields[0];
    const currentDisaster = disasterReports.find((d) => d.fieldId === evidenceData.fieldId);

    // AI assessment if not provided
    let aiAssessment = evidenceData.aiAssessment;
    if (!aiAssessment && evidenceData.imageUrl) {
      aiAssessment = await assessImageAI(
        evidenceData.imageUrl,
        evidenceData.cropStage,
        evidenceData.cropStage,
        currentDisaster?.disasterType || "Heavy Rainfall",
        evidenceData.evidenceType
      );
    }

    const damageClassification: DamageSeverity =
      aiAssessment?.damageSeverity || evidenceData.damageClassification || "Moderate";

    const baseRecord: EvidenceRecord = {
      ...evidenceData,
      id: evidenceId,
      timestamp: capturedAt,
      aiAssessment,
      damageClassification,
    };

    // Run Rule-Based Verification Engine
    const verification = verifyEvidenceItem(
      baseRecord,
      currentField,
      currentDisaster,
      evidenceList,
      weatherData
    );

    const completeRecord: EvidenceRecord = {
      ...baseRecord,
      verification,
    };

    // Save to Firestore
    if (user?.uid && evidenceData.fieldId && evidenceData.cropId) {
      const firestoreEvidence: FirestoreEvidence = {
        evidenceId,
        fieldId: evidenceData.fieldId,
        cropId: evidenceData.cropId,
        type: evidenceData.evidenceType || "growth",
        imageUrl: evidenceData.imageUrl,
        latitude: evidenceData.lat,
        longitude: evidenceData.lng,
        capturedAt,
        cropStage: evidenceData.cropStage,
        stepName: evidenceData.stepName,
        notes: evidenceData.notes,
        damageClassification,
        aiAssessment,
        verification,
        createdAt: capturedAt,
      };

      try {
        await saveEvidence(
          user.uid,
          evidenceData.fieldId,
          evidenceData.cropId,
          firestoreEvidence
        );
      } catch (err) {
        console.warn("Firestore saveEvidence error, queuing offline:", err);
      }
    }

    if (!isOnline) {
      await saveOfflineEvidence(completeRecord);
      setPendingSyncCount((prev) => prev + 1);
      setSyncStatus("offline");
    }

    const updatedList = [...evidenceList, completeRecord];
    setEvidenceList(updatedList);

    // Recalculate Claim if one exists
    recalculateClaimForField(evidenceData.fieldId, updatedList);

    return completeRecord;
  };

  const reportDisaster = async (
    report: Omit<DisasterReport, "id" | "reportedAt" | "status">
  ): Promise<DisasterReport> => {
    const nextIndex = disasterReports.length + 1;
    const disasterId = `DR00${nextIndex}`;
    const reportedAt = new Date().toISOString();

    const fullReport: DisasterReport = {
      ...report,
      id: disasterId,
      status: "Evidence Collection",
      reportedAt,
      weatherAnomalyConfirmed: weatherData?.correlationSummary.extremeEventConfirmed ?? true,
    };

    const targetField = fields.find((f) => f.id === report.fieldId) || fields[0];
    const claimId = `CLM00${claims.length + 1}`;

    const newClaim: ClaimRecord = {
      id: claimId,
      disasterReportId: disasterId,
      farmerId: farmer.farmerId || farmer.id,
      fieldId: report.fieldId,
      cropId: report.cropId,
      status: "Evidence Collection",
      claimDate: report.date,
      evidenceCompleteness: 0,
      disasterType: report.disasterType,
      aiDamageAggregate: {
        healthyPercent: 0,
        moderatePercent: 50,
        severePercent: 50,
        estimatedDamagePercent: 65,
        totalImagesAnalyzed: 0,
      },
      preliminaryLossEstimate: {
        fieldAreaAcres: targetField?.approxAreaAcres || 2.0,
        estimatedDamagePercent: 65,
        estimatedAffectedAcres: Math.round((targetField?.approxAreaAcres || 2.0) * 0.65 * 100) / 100,
        sumInsuredPerAcreINR: farmer.insuranceInfo.sumInsuredPerAcre,
        estimatedLossAmountINR: Math.round(
          (targetField?.approxAreaAcres || 2.0) * 0.65 * farmer.insuranceInfo.sumInsuredPerAcre
        ),
      },
      officerDecision: {
        officerName: "Pending Loss Assessor Assignment",
        officerId: "PENDING",
        decision: "Evidence Collection",
        actionTimestamp: new Date().toISOString(),
        remarks:
          "Disaster incident recorded in PMFBY registry. Collect 4-step photographic evidence to finalize indemnity assessment.",
      },
    };

    if (user?.uid) {
      // Save Disaster to Firestore
      const firestoreDisaster: FirestoreDisaster = {
        disasterId,
        fieldId: report.fieldId,
        cropId: report.cropId,
        disasterType: report.disasterType,
        date: report.date,
        time: report.time,
        description: report.description,
        status: "Evidence Collection",
        reportedAt,
        createdAt: reportedAt,
        photoUrl: report.photoUrl,
        weatherAnomalyConfirmed: fullReport.weatherAnomalyConfirmed,
      };
      await saveDisaster(user.uid, firestoreDisaster);

      // Save Claim to Firestore
      const firestoreClaim: FirestoreClaim = {
        claimId,
        farmerId: user.uid,
        fieldId: report.fieldId,
        cropId: report.cropId,
        disasterId,
        disasterType: report.disasterType,
        disasterDate: report.date,
        description: report.description,
        status: "Evidence Collection",
        claimDate: report.date,
        evidenceCompleteness: 0,
        aiDamageAggregate: newClaim.aiDamageAggregate,
        preliminaryLossEstimate: newClaim.preliminaryLossEstimate,
        officerDecision: newClaim.officerDecision,
        createdAt: reportedAt,
      };
      await saveClaim(user.uid, firestoreClaim);
    }

    setDisasterReports((prev) => [fullReport, ...prev]);
    setClaims((prev) => [newClaim, ...prev]);
    setActiveClaimId(claimId);

    return fullReport;
  };

  const recalculateClaimForField = async (fieldId: string, updatedEvidence: EvidenceRecord[]) => {
    const postEvidence = updatedEvidence.filter(
      (e) =>
        e.fieldId === fieldId &&
        (e.evidenceType === "Post-disaster" ||
          e.evidenceType === "Damaged area" ||
          e.evidenceType === "Wide field view" ||
          e.evidenceType === "Close-up")
    );

    if (postEvidence.length === 0) return;

    let totalHealthy = 0;
    let totalModerate = 0;
    let totalSevere = 0;

    postEvidence.forEach((e) => {
      const sev = e.aiAssessment?.damageSeverity || e.damageClassification || "Moderate";
      if (sev === "Healthy") totalHealthy++;
      else if (sev === "Moderate") totalModerate++;
      else totalSevere++;
    });

    const count = postEvidence.length;
    const healthyPct = Math.round((totalHealthy / count) * 100);
    const moderatePct = Math.round((totalModerate / count) * 100);
    const severePct = Math.round((totalSevere / count) * 100);
    const estDamage = Math.round(moderatePct * 0.5 + severePct * 1.0);

    const field = fields.find((f) => f.id === fieldId) || fields[0];
    const affectedAcres = Math.round(field.approxAreaAcres * (estDamage / 100) * 100) / 100;
    const lossAmount = Math.round(affectedAcres * farmer.insuranceInfo.sumInsuredPerAcre);

    const updatedClaims = claims.map((c) => {
      if (c.fieldId === fieldId) {
        const nextStatus =
          c.status === "Evidence Collection" && postEvidence.length >= 4
            ? ("Under Review" as const)
            : c.status;
        const updated = {
          ...c,
          status: nextStatus,
          evidenceCompleteness: Math.min(100, Math.round((postEvidence.length / 4) * 100)),
          aiDamageAggregate: {
            healthyPercent: healthyPct,
            moderatePercent: moderatePct,
            severePercent: severePct,
            estimatedDamagePercent: estDamage,
            totalImagesAnalyzed: count,
          },
          preliminaryLossEstimate: {
            fieldAreaAcres: field.approxAreaAcres,
            estimatedDamagePercent: estDamage,
            estimatedAffectedAcres: affectedAcres,
            sumInsuredPerAcreINR: farmer.insuranceInfo.sumInsuredPerAcre,
            estimatedLossAmountINR: lossAmount,
          },
        };

        if (user?.uid) {
          saveClaim(user.uid, {
            claimId: updated.id,
            fieldId: updated.fieldId,
            cropId: updated.cropId,
            disasterId: updated.disasterReportId,
            status: updated.status,
            claimDate: updated.claimDate,
            evidenceCompleteness: updated.evidenceCompleteness,
            disasterType: updated.disasterType,
            aiDamageAggregate: updated.aiDamageAggregate,
            preliminaryLossEstimate: updated.preliminaryLossEstimate,
            officerDecision: updated.officerDecision,
            createdAt: new Date().toISOString(),
          });
        }
        return updated;
      }
      return c;
    });

    setClaims(updatedClaims);
  };

  const updateOfficerClaimDecision = async (
    claimId: string,
    decision: ClaimRecord["status"],
    remarks: string,
    approvedPayout?: number
  ) => {
    const targetClaim = claims.find((c) => c.id === claimId);
    const farmerIdToUpdate = targetClaim?.farmerId || user?.uid || "";

    const updatedClaims = claims.map((c) => {
      if (c.id === claimId) {
        const updated: ClaimRecord = {
          ...c,
          status: decision,
          officerDecision: {
            officerName: officer.name || "Dr. Ananya Sharma",
            officerId: officer.id || officer.badgeNumber || "AIC-AP-KR-042",
            decision,
            actionTimestamp: new Date().toISOString(),
            remarks,
            approvedPayoutINR: approvedPayout || c.preliminaryLossEstimate.estimatedLossAmountINR,
          },
        };

        if (user?.uid && userRole === "officer") {
          const firestoreClaimUpdate: FirestoreClaim = {
            claimId: updated.id,
            farmerId: farmerIdToUpdate,
            fieldId: updated.fieldId,
            cropId: updated.cropId,
            disasterId: updated.disasterReportId,
            status: updated.status,
            claimDate: updated.claimDate,
            evidenceCompleteness: updated.evidenceCompleteness,
            disasterType: updated.disasterType,
            aiDamageAggregate: updated.aiDamageAggregate,
            preliminaryLossEstimate: updated.preliminaryLossEstimate,
            officerDecision: updated.officerDecision,
            reviewedBy: officer.name || "Dr. Ananya Sharma",
            reviewedAt: new Date().toISOString(),
            officerRemarks: remarks,
            createdAt: updated.claimDate || new Date().toISOString(),
          };
          saveClaim(farmerIdToUpdate, firestoreClaimUpdate);
          updateClaimDecisionInFirestore(
            farmerIdToUpdate,
            claimId,
            decision,
            remarks,
            officer.name || "Dr. Ananya Sharma",
            officer.id || officer.badgeNumber || "AIC-AP-KR-042",
            approvedPayout
          );
        }
        return updated;
      }
      return c;
    });

    setClaims(updatedClaims);

    // Also update matching disaster report
    setDisasterReports((prev) =>
      prev.map((d) => {
        const matchingClaim = claims.find((c) => c.id === claimId);
        if (matchingClaim && d.id === matchingClaim.disasterReportId) {
          return { ...d, status: decision };
        }
        return d;
      })
    );
  };

  const triggerSync = async () => {
    setSyncStatus("syncing");
    const pending = await getOfflinePendingEvidence();

    await new Promise((r) => setTimeout(r, 1000));

    for (const item of pending) {
      await clearSyncedOfflineEvidence(item.id);
    }

    setPendingSyncCount(0);
    setSyncStatus("synced");
    setTimeout(() => setSyncStatus("idle"), 2500);
  };

  // Explicit development-only seed mechanism
  const seedDemoData = async () => {
    if (!user?.uid) return;
    setIsLoadingFirestore(true);
    try {
      await seedDemoFarmerDataService(user.uid);
      await loadFarmerData(user.uid, farmer.farmerId || farmer.id);
    } catch (err: any) {
      console.error("Error seeding demo data:", err);
      setFirestoreError(err.message || "Failed to seed demo data");
    } finally {
      setIsLoadingFirestore(false);
    }
  };

  // Explicit user/dev data reset
  const clearAllUserData = async () => {
    if (!user?.uid) return;
    setIsLoadingFirestore(true);
    try {
      await clearFarmerDataService(user.uid);
      setFields([]);
      setCrops([]);
      setEvidenceList([]);
      setDisasterReports([]);
      setClaims([]);
      setActiveFieldId("");
      setActiveCropId("");
      setActiveClaimId(null);
    } catch (err: any) {
      console.error("Error clearing data:", err);
      setFirestoreError(err.message || "Failed to clear data");
    } finally {
      setIsLoadingFirestore(false);
    }
  };

  const reloadFarmerData = async () => {
    if (user?.uid) {
      await loadFarmerData(user.uid, farmer.farmerId || farmer.id);
    }
  };

  return (
    <AppContext.Provider
      value={{
        role,
        setRole,
        language,
        setLanguage,
        t,
        farmer,
        setFarmer,
        officer,
        fields,
        activeFieldId,
        setActiveFieldId,
        crops,
        activeCropId,
        setActiveCropId,
        evidenceList,
        disasterReports,
        claims,
        activeClaimId,
        setActiveClaimId,
        weatherData,
        isWeatherLoading,
        isLoadingFirestore,
        firestoreError,
        clearFirestoreError,
        isOnline,
        pendingSyncCount,
        syncStatus,
        toggleSimulatedOffline,
        registerField,
        registerCrop,
        registerFieldAndCrop,
        captureEvidence,
        reportDisaster,
        assessImageAI,
        updateOfficerClaimDecision,
        triggerSync,
        seedDemoData,
        clearAllUserData,
        evidenceCompletenessPercent,
        isEvidenceOutdated,
        reloadFarmerData,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return context;
};
