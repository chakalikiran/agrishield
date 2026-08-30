import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import {
  FarmerProfile,
  FirestoreField,
  FirestoreCrop,
  FirestoreEvidence,
  FirestoreDisaster,
  FirestoreClaim,
  FieldRecord,
  CropRecord,
  EvidenceRecord,
  DisasterReport,
  ClaimRecord,
} from "../types";

// ==========================================
// 1. Farmer Profile Operations (farmers/{uid})
// ==========================================

export async function getFarmerProfile(uid: string): Promise<FarmerProfile | null> {
  if (!uid) return null;
  const docRef = doc(db, "farmers", uid);
  const snap = await getDoc(docRef);
  if (!snap.exists()) return null;

  const data = snap.data() as FarmerProfile;
  return {
    ...data,
    id: data.farmerId || data.id || `FMR-${uid.substring(0, 4)}`,
    farmerId: data.farmerId || data.id || `FMR-${uid.substring(0, 4)}`,
    uid,
  };
}

export async function saveFarmerProfile(uid: string, profile: FarmerProfile): Promise<void> {
  if (!uid) return;
  const docRef = doc(db, "farmers", uid);
  await setDoc(docRef, profile, { merge: true });
}

export async function updateFarmerProfile(
  uid: string,
  updates: Partial<FarmerProfile>
): Promise<void> {
  if (!uid) return;
  const docRef = doc(db, "farmers", uid);
  await updateDoc(docRef, {
    ...updates,
    updatedAt: new Date().toISOString(),
  } as Record<string, unknown>);
}

// ==========================================
// 2. Field Operations (farmers/{uid}/fields/{fieldId})
// ==========================================

export function fieldToRecord(f: FirestoreField, farmerId: string): FieldRecord {
  const boundaryCoords: [number, number][] = (f.boundary || []).map((b) => [
    b.latitude,
    b.longitude,
  ]);
  const centerLat = f.center?.latitude || 16.5116;
  const centerLng = f.center?.longitude || 80.7005;

  return {
    id: f.fieldId,
    fieldId: f.fieldId,
    farmerId,
    name: f.name,
    surveyNumber: f.surveyNumber,
    soilType: f.soilType,
    coordinates: boundaryCoords.length > 0 ? boundaryCoords : [[centerLat, centerLng]],
    centerLat,
    centerLng,
    approxAreaAcres: f.areaAcres,
    areaAcres: f.areaAcres,
    center: f.center,
    boundary: f.boundary,
    registeredAt: f.createdAt || new Date().toISOString(),
    createdAt: f.createdAt,
  };
}

export async function getFarmerFields(uid: string): Promise<FirestoreField[]> {
  if (!uid) return [];
  const fieldsRef = collection(db, "farmers", uid, "fields");
  const snap = await getDocs(fieldsRef);
  const fields: FirestoreField[] = [];
  snap.forEach((d) => {
    const data = d.data() as FirestoreField;
    fields.push({
      ...data,
      fieldId: data.fieldId || d.id,
      id: data.fieldId || d.id,
      approxAreaAcres: data.areaAcres,
      centerLat: data.center?.latitude,
      centerLng: data.center?.longitude,
      coordinates: (data.boundary || []).map((b) => [b.latitude, b.longitude]),
    });
  });
  return fields.sort(
    (a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
  );
}

export function getNextFieldId(existingFields: Array<{ id?: string; fieldId?: string }>): string {
  let maxNum = 0;
  for (const f of existingFields) {
    const id = f.fieldId || f.id || "";
    const match = id.match(/FL(\d+)/i);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    }
  }
  const nextNum = maxNum + 1;
  return `FL${String(nextNum).padStart(3, "0")}`;
}

export function getNextCropId(existingCrops: Array<{ id?: string; cropId?: string }>): string {
  let maxNum = 0;
  for (const c of existingCrops) {
    const id = c.cropId || c.id || "";
    const match = id.match(/CR(\d+)/i);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    }
  }
  const nextNum = maxNum + 1;
  return `CR${String(nextNum).padStart(3, "0")}`;
}

export async function saveField(uid: string, field: FirestoreField): Promise<FirestoreField> {
  if (!uid) throw new Error("Authenticated UID required");
  const docRef = doc(db, "farmers", uid, "fields", field.fieldId);
  await setDoc(docRef, field);
  return field;
}

export async function registerFieldAndCropInFirestore(
  uid: string,
  field: FirestoreField,
  crop: FirestoreCrop
): Promise<{ field: FirestoreField; crop: FirestoreCrop }> {
  if (!uid) throw new Error("Please log in to continue.");

  const batch = writeBatch(db);
  const fieldDocRef = doc(db, "farmers", uid, "fields", field.fieldId);
  const cropDocRef = doc(db, "farmers", uid, "fields", field.fieldId, "crops", crop.cropId);

  batch.set(fieldDocRef, field);
  batch.set(cropDocRef, crop);

  await batch.commit();
  return { field, crop };
}

// ==========================================
// 3. Crop Operations (farmers/{uid}/fields/{fieldId}/crops/{cropId})
// ==========================================

export function cropToRecord(c: FirestoreCrop, fieldId: string, farmerId: string): CropRecord {
  return {
    id: c.cropId,
    fieldId: c.fieldId || fieldId,
    farmerId,
    cropType: c.cropType,
    variety: c.variety,
    sowingDate: c.sowingDate,
    expectedHarvestDate: c.expectedHarvestDate || "",
    currentStage: (c.currentStage as any) || "Vegetative Growth",
    season: c.season || "Kharif",
    cultivatedAreaAcres: c.cultivatedAreaAcres || 0,
  };
}

export async function getFieldCrops(uid: string, fieldId: string): Promise<FirestoreCrop[]> {
  if (!uid || !fieldId) return [];
  const cropsRef = collection(db, "farmers", uid, "fields", fieldId, "crops");
  const snap = await getDocs(cropsRef);
  const crops: FirestoreCrop[] = [];
  snap.forEach((d) => {
    const data = d.data() as FirestoreCrop;
    crops.push({
      ...data,
      cropId: data.cropId || d.id,
      id: data.cropId || d.id,
      fieldId,
    });
  });
  return crops.sort(
    (a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
  );
}

export async function saveCrop(
  uid: string,
  fieldId: string,
  crop: FirestoreCrop
): Promise<FirestoreCrop> {
  if (!uid || !fieldId) throw new Error("UID and Field ID required");
  const docRef = doc(db, "farmers", uid, "fields", fieldId, "crops", crop.cropId);
  await setDoc(docRef, crop);
  return crop;
}

// ==========================================
// 4. Evidence Operations (farmers/{uid}/fields/{fieldId}/crops/{cropId}/evidence/{evidenceId})
// ==========================================

export function evidenceToRecord(
  e: FirestoreEvidence,
  farmerId: string
): EvidenceRecord {
  return {
    id: e.evidenceId,
    farmerId,
    fieldId: e.fieldId,
    cropId: e.cropId,
    imageUrl: e.imageUrl,
    lat: e.latitude,
    lng: e.longitude,
    timestamp: e.capturedAt,
    cropStage: (e.cropStage as any) || "Vegetative Growth",
    evidenceType: (e.type as any) || "Growth",
    stepName: e.stepName,
    notes: e.notes,
    damageClassification: (e.damageClassification as any) || "Healthy",
    aiAssessment: e.aiAssessment,
    verification: e.verification,
  };
}

export async function getCropEvidence(
  uid: string,
  fieldId: string,
  cropId: string
): Promise<FirestoreEvidence[]> {
  if (!uid || !fieldId || !cropId) return [];
  const evRef = collection(db, "farmers", uid, "fields", fieldId, "crops", cropId, "evidence");
  const snap = await getDocs(evRef);
  const evidenceList: FirestoreEvidence[] = [];
  snap.forEach((d) => {
    const data = d.data() as FirestoreEvidence;
    evidenceList.push({
      ...data,
      evidenceId: data.evidenceId || d.id,
      id: data.evidenceId || d.id,
      lat: data.latitude,
      lng: data.longitude,
      timestamp: data.capturedAt,
      evidenceType: data.type as any,
    });
  });
  return evidenceList.sort(
    (a, b) => new Date(a.capturedAt || 0).getTime() - new Date(b.capturedAt || 0).getTime()
  );
}

export async function getAllFarmerEvidence(
  uid: string,
  fields: FirestoreField[]
): Promise<FirestoreEvidence[]> {
  if (!uid) return [];
  const allEvidence: FirestoreEvidence[] = [];

  for (const field of fields) {
    const crops = await getFieldCrops(uid, field.fieldId);
    for (const crop of crops) {
      const evList = await getCropEvidence(uid, field.fieldId, crop.cropId);
      allEvidence.push(...evList);
    }
  }

  return allEvidence.sort(
    (a, b) => new Date(a.capturedAt || 0).getTime() - new Date(b.capturedAt || 0).getTime()
  );
}

export async function saveEvidence(
  uid: string,
  fieldId: string,
  cropId: string,
  evidence: FirestoreEvidence
): Promise<FirestoreEvidence> {
  if (!uid || !fieldId || !cropId) throw new Error("UID, Field ID, and Crop ID required");
  const docRef = doc(
    db,
    "farmers",
    uid,
    "fields",
    fieldId,
    "crops",
    cropId,
    "evidence",
    evidence.evidenceId
  );
  await setDoc(docRef, evidence);
  return evidence;
}

// ==========================================
// 5. Disaster Reports (farmers/{uid}/disasters/{disasterId})
// ==========================================

export function disasterToRecord(d: FirestoreDisaster, farmerId: string): DisasterReport {
  return {
    id: d.disasterId,
    fieldId: d.fieldId,
    cropId: d.cropId || "",
    farmerId,
    disasterType: d.disasterType as any,
    date: d.date,
    time: d.time,
    description: d.description,
    photoUrl: d.photoUrl,
    status: d.status as any,
    reportedAt: d.reportedAt,
    weatherAnomalyConfirmed: d.weatherAnomalyConfirmed,
  };
}

export async function getFarmerDisasters(uid: string): Promise<FirestoreDisaster[]> {
  if (!uid) return [];
  const ref = collection(db, "farmers", uid, "disasters");
  const snap = await getDocs(ref);
  const list: FirestoreDisaster[] = [];
  snap.forEach((d) => {
    const data = d.data() as FirestoreDisaster;
    list.push({
      ...data,
      disasterId: data.disasterId || d.id,
      id: data.disasterId || d.id,
    });
  });
  return list.sort(
    (a, b) => new Date(b.reportedAt || 0).getTime() - new Date(a.reportedAt || 0).getTime()
  );
}

export async function saveDisaster(
  uid: string,
  disaster: FirestoreDisaster
): Promise<FirestoreDisaster> {
  if (!uid) throw new Error("UID required");
  const docRef = doc(db, "farmers", uid, "disasters", disaster.disasterId);
  await setDoc(docRef, disaster);
  return disaster;
}

// ==========================================
// 6. Claim Operations (farmers/{uid}/claims/{claimId})
// ==========================================

export function claimToRecord(c: FirestoreClaim, farmerId: string): ClaimRecord {
  return {
    id: c.claimId,
    disasterReportId: c.disasterId || "",
    farmerId,
    fieldId: c.fieldId,
    cropId: c.cropId || "",
    status: (c.status as any) || "Under Review",
    claimDate: c.claimDate || c.createdAt?.split("T")[0] || "2026-08-23",
    evidenceCompleteness: c.evidenceCompleteness || 0,
    disasterType: (c.disasterType as any) || "Heavy Rainfall",
    aiDamageAggregate: c.aiDamageAggregate || {
      healthyPercent: 0,
      moderatePercent: 0,
      severePercent: 0,
      estimatedDamagePercent: 0,
      totalImagesAnalyzed: 0,
    },
    preliminaryLossEstimate: c.preliminaryLossEstimate || {
      fieldAreaAcres: 0,
      estimatedDamagePercent: 0,
      estimatedAffectedAcres: 0,
      sumInsuredPerAcreINR: 38500,
      estimatedLossAmountINR: 0,
    },
    officerDecision: c.officerDecision,
  };
}

export async function getFarmerClaims(uid: string): Promise<FirestoreClaim[]> {
  if (!uid) return [];
  const ref = collection(db, "farmers", uid, "claims");
  const snap = await getDocs(ref);
  const list: FirestoreClaim[] = [];
  snap.forEach((d) => {
    const data = d.data() as FirestoreClaim;
    list.push({
      ...data,
      claimId: data.claimId || d.id,
      id: data.claimId || d.id,
    });
  });
  return list.sort(
    (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  );
}

export async function saveClaim(uid: string, claim: FirestoreClaim): Promise<FirestoreClaim> {
  if (!uid) throw new Error("UID required");
  const claimData = {
    ...claim,
    farmerId: claim.farmerId || uid,
    createdAt: claim.createdAt || new Date().toISOString(),
  };
  const topRef = doc(db, "claims", claim.claimId);
  await setDoc(topRef, claimData, { merge: true });

  const docRef = doc(db, "farmers", uid, "claims", claim.claimId);
  await setDoc(docRef, claimData, { merge: true });
  return claimData;
}

export function subscribeToClaims(
  userRole: "farmer" | "officer" | null,
  uid: string | undefined,
  callback: (claims: FirestoreClaim[]) => void
): () => void {
  if (!userRole || !uid) {
    callback([]);
    return () => {};
  }

  let q;
  if (userRole === "officer") {
    q = collection(db, "claims");
  } else {
    q = query(collection(db, "claims"), where("farmerId", "==", uid));
  }

  return onSnapshot(
    q,
    (snapshot) => {
      const list: FirestoreClaim[] = [];
      snapshot.forEach((d) => {
        const data = d.data() as FirestoreClaim;
        list.push({
          ...data,
          claimId: data.claimId || d.id,
          id: data.claimId || d.id,
          farmerId: data.farmerId || uid,
        });
      });
      list.sort(
        (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
      );
      callback(list);
    },
    (err) => {
      console.warn("Claims snapshot error:", err);
      callback([]);
    }
  );
}

// ==========================================
// 7. Development-Only Seed Mechanism
// ==========================================

export async function seedDemoFarmerData(uid: string): Promise<{
  fields: FirestoreField[];
  crops: FirestoreCrop[];
  evidence: FirestoreEvidence[];
  disasters: FirestoreDisaster[];
  claims: FirestoreClaim[];
}> {
  if (!uid) throw new Error("Authenticated UID required for seeding");

  const fieldsData: FirestoreField[] = [
    {
      fieldId: "FL001",
      name: "North Cauvery Canal Plot A",
      areaAcres: 2.35,
      surveyNumber: "142/3B",
      soilType: "Alluvial Clay Loam",
      center: { latitude: 16.5116, longitude: 80.7005 },
      boundary: [
        { latitude: 16.5124, longitude: 80.6982 },
        { latitude: 16.5138, longitude: 80.7015 },
        { latitude: 16.5109, longitude: 80.7028 },
        { latitude: 16.5095, longitude: 80.6995 },
      ],
      createdAt: "2026-05-28T08:30:00.000Z",
    },
    {
      fieldId: "FL002",
      name: "East Krishna Main Road Field",
      areaAcres: 3.15,
      surveyNumber: "158/1A",
      soilType: "Black Cotton Soil",
      center: { latitude: 16.5208, longitude: 80.7145 },
      boundary: [
        { latitude: 16.521, longitude: 80.712 },
        { latitude: 16.5235, longitude: 80.7155 },
        { latitude: 16.5205, longitude: 80.717 },
        { latitude: 16.518, longitude: 80.7135 },
      ],
      createdAt: "2026-05-30T10:15:00.000Z",
    },
    {
      fieldId: "FL003",
      name: "South Pond Ridge",
      areaAcres: 1.3,
      surveyNumber: "164/4",
      soilType: "Sandy Loam",
      center: { latitude: 16.5038, longitude: 80.693 },
      boundary: [
        { latitude: 16.504, longitude: 80.691 },
        { latitude: 16.506, longitude: 80.6935 },
        { latitude: 16.5035, longitude: 80.695 },
        { latitude: 16.5015, longitude: 80.6925 },
      ],
      createdAt: "2026-06-02T11:00:00.000Z",
    },
  ];

  const cropsData: { fieldId: string; crop: FirestoreCrop }[] = [
    {
      fieldId: "FL001",
      crop: {
        cropId: "CR001",
        fieldId: "FL001",
        cropType: "Rice",
        variety: "BPT 5204",
        sowingDate: "2026-06-10",
        expectedHarvestDate: "2026-11-20",
        currentStage: "Flowering",
        season: "Kharif",
        cultivatedAreaAcres: 2.35,
        createdAt: "2026-06-10T09:00:00.000Z",
      },
    },
    {
      fieldId: "FL002",
      crop: {
        cropId: "CR002",
        fieldId: "FL002",
        cropType: "Cotton",
        variety: "RCH-659 BG II",
        sowingDate: "2026-06-18",
        expectedHarvestDate: "2026-12-15",
        currentStage: "Vegetative Growth",
        season: "Kharif",
        cultivatedAreaAcres: 3.15,
        createdAt: "2026-06-18T08:00:00.000Z",
      },
    },
    {
      fieldId: "FL003",
      crop: {
        cropId: "CR003",
        fieldId: "FL003",
        cropType: "Black Gram",
        variety: "PU-31 (Urad)",
        sowingDate: "2026-06-22",
        expectedHarvestDate: "2026-09-30",
        currentStage: "Tillering",
        season: "Kharif",
        cultivatedAreaAcres: 1.3,
        createdAt: "2026-06-22T07:30:00.000Z",
      },
    },
  ];

  const evidenceData: { fieldId: string; cropId: string; ev: FirestoreEvidence }[] = [
    {
      fieldId: "FL001",
      cropId: "CR001",
      ev: {
        evidenceId: "EV001",
        fieldId: "FL001",
        cropId: "CR001",
        type: "growth",
        imageUrl:
          "https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=800&q=80",
        latitude: 16.5116,
        longitude: 80.7005,
        capturedAt: "2026-06-25T08:45:00.000Z",
        cropStage: "Vegetative Growth",
        stepName: "Initial Shoot Emergence",
        notes: "Healthy green shoot emergence across Plot A.",
        damageClassification: "Healthy",
        createdAt: "2026-06-25T08:45:00.000Z",
      },
    },
    {
      fieldId: "FL001",
      cropId: "CR001",
      ev: {
        evidenceId: "EV002",
        fieldId: "FL001",
        cropId: "CR001",
        type: "growth",
        imageUrl:
          "https://images.unsplash.com/photo-1574943320219-553eb213f72d?auto=format&fit=crop&w=800&q=80",
        latitude: 16.5122,
        longitude: 80.701,
        capturedAt: "2026-07-20T09:15:00.000Z",
        cropStage: "Tillering",
        stepName: "Active Tillering Phase",
        notes: "Dense tiller density and optimal water management.",
        damageClassification: "Healthy",
        createdAt: "2026-07-20T09:15:00.000Z",
      },
    },
    {
      fieldId: "FL001",
      cropId: "CR001",
      ev: {
        evidenceId: "EV003",
        fieldId: "FL001",
        cropId: "CR001",
        type: "pre-disaster",
        imageUrl:
          "https://images.unsplash.com/photo-1530595467537-0b5996c41f2d?auto=format&fit=crop&w=800&q=80",
        latitude: 16.5118,
        longitude: 80.6998,
        capturedAt: "2026-08-18T11:00:00.000Z",
        cropStage: "Flowering",
        stepName: "Pre-Monsoon Health Baseline",
        notes: "Pre-disaster baseline: Excellent panicle initiation.",
        damageClassification: "Healthy",
        createdAt: "2026-08-18T11:00:00.000Z",
      },
    },
  ];

  const disasterData: FirestoreDisaster[] = [
    {
      disasterId: "DR001",
      fieldId: "FL001",
      cropId: "CR001",
      disasterType: "Heavy Rainfall",
      date: "2026-08-22",
      time: "14:30",
      description: "Severe precipitation and canal inundation causing waterlogging and lodging.",
      status: "Under Review",
      reportedAt: "2026-08-22T14:30:00.000Z",
      weatherAnomalyConfirmed: true,
      createdAt: "2026-08-22T14:30:00.000Z",
    },
  ];

  // Write all records to Firestore
  for (const f of fieldsData) {
    await saveField(uid, f);
  }
  for (const item of cropsData) {
    await saveCrop(uid, item.fieldId, item.crop);
  }
  for (const item of evidenceData) {
    await saveEvidence(uid, item.fieldId, item.cropId, item.ev);
  }
  for (const d of disasterData) {
    await saveDisaster(uid, d);
  }

  return {
    fields: fieldsData,
    crops: cropsData.map((c) => c.crop),
    evidence: evidenceData.map((e) => e.ev),
    disasters: disasterData,
    claims: [],
  };
}

export async function clearFarmerData(uid: string): Promise<void> {
  if (!uid) return;
  const fields = await getFarmerFields(uid);
  for (const f of fields) {
    const crops = await getFieldCrops(uid, f.fieldId);
    for (const c of crops) {
      const evList = await getCropEvidence(uid, f.fieldId, c.cropId);
      for (const ev of evList) {
        await deleteDoc(
          doc(db, "farmers", uid, "fields", f.fieldId, "crops", c.cropId, "evidence", ev.evidenceId)
        );
      }
      await deleteDoc(doc(db, "farmers", uid, "fields", f.fieldId, "crops", c.cropId));
    }
    await deleteDoc(doc(db, "farmers", uid, "fields", f.fieldId));
  }

  const disasters = await getFarmerDisasters(uid);
  for (const d of disasters) {
    await deleteDoc(doc(db, "farmers", uid, "disasters", d.disasterId));
  }

  const claims = await getFarmerClaims(uid);
  for (const c of claims) {
    await deleteDoc(doc(db, "farmers", uid, "claims", c.claimId));
  }
}

export async function getAllClaimsForOfficer(): Promise<FirestoreClaim[]> {
  try {
    const claimsSnap = await getDocs(collection(db, "claims"));
    const allClaims: FirestoreClaim[] = [];
    claimsSnap.forEach((d) => {
      const data = d.data() as FirestoreClaim;
      allClaims.push({
        ...data,
        claimId: data.claimId || d.id,
        id: data.claimId || d.id,
        farmerId: data.farmerId || "FMR001",
      });
    });
    return allClaims.sort(
      (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
  } catch (err) {
    console.warn("Failed to fetch all claims for officer:", err);
    return [];
  }
}

export async function updateClaimDecisionInFirestore(
  farmerId: string,
  claimId: string,
  decision: string,
  remarks: string,
  officerName: string,
  officerId: string,
  approvedAmount?: number
): Promise<void> {
  if (!farmerId || !claimId) return;
  const docRef = doc(db, "farmers", farmerId, "claims", claimId);
  await updateDoc(docRef, {
    status: decision,
    officerDecision: {
      officerName,
      officerId,
      decision,
      actionTimestamp: new Date().toISOString(),
      remarks,
      approvedAmount,
    },
  });
}

