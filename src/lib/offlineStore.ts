import { EvidenceRecord } from "../types";

const DB_NAME = "SmartCropEvidenceDB";
const STORE_NAME = "pending_evidence";
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      return reject(new Error("IndexedDB not supported"));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveOfflineEvidence(evidence: EvidenceRecord): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const record = { ...evidence, isOfflinePending: true };
      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Fallback to localStorage
    try {
      const existing = JSON.parse(localStorage.getItem("offline_evidence_queue") || "[]");
      existing.push({ ...evidence, isOfflinePending: true });
      localStorage.setItem("offline_evidence_queue", JSON.stringify(existing));
    } catch (err) {
      console.warn("Failed to cache offline evidence:", err);
    }
  }
}

export async function getOfflinePendingEvidence(): Promise<EvidenceRecord[]> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  } catch {
    try {
      return JSON.parse(localStorage.getItem("offline_evidence_queue") || "[]");
    } catch {
      return [];
    }
  }
}

export async function clearSyncedOfflineEvidence(id: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.delete(id);
  } catch {
    try {
      const existing = JSON.parse(localStorage.getItem("offline_evidence_queue") || "[]");
      const filtered = existing.filter((item: EvidenceRecord) => item.id !== id);
      localStorage.setItem("offline_evidence_queue", JSON.stringify(filtered));
    } catch (e) {
      console.error(e);
    }
  }
}
