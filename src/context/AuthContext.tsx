import React, { createContext, useContext, useState, useEffect } from "react";
import {
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
} from "firebase/firestore";
import { auth, db, handleFirestoreError, OperationType } from "../lib/firebase";
import { FarmerProfile, FarmerRegistrationInput } from "../types";

interface AuthContextType {
  user: User | null;
  farmerProfile: FarmerProfile | null;
  loading: boolean;
  error: string | null;
  clearError: () => void;
  login: (email: string, pass: string) => Promise<void>;
  register: (input: FarmerRegistrationInput) => Promise<void>;
  logout: () => Promise<void>;
  updateFarmerProfile: (updates: Partial<FarmerProfile>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function getFriendlyAuthErrorMessage(error: unknown): string {
  if (!error) return "An unexpected error occurred. Please try again.";
  console.error("Firebase Authentication error:", error);
  const errObj = error as { code?: string; message?: string };
  const code = errObj.code || errObj.message || "";

  if (code.includes("auth/configuration-not-found")) {
    return "Authentication is not configured for this application. Please check the Firebase Authentication setup.";
  }
  if (code.includes("auth/invalid-email")) {
    return "Please enter a valid email address.";
  }
  if (code.includes("auth/user-not-found") || code.includes("auth/invalid-credential")) {
    return "Invalid email or password. Please verify your login details.";
  }
  if (code.includes("auth/wrong-password")) {
    return "Incorrect password. Please try again.";
  }
  if (code.includes("auth/email-already-in-use")) {
    return "An account with this email address already exists. Please sign in.";
  }
  if (code.includes("auth/weak-password")) {
    return "Password is too weak. Please use at least 6 characters.";
  }
  if (code.includes("auth/network-request-failed")) {
    return "Network connection issue. Please check your internet connection.";
  }
  if (code.includes("auth/too-many-requests")) {
    return "Too many failed login attempts. Please wait a moment and try again.";
  }
  if (code.includes("auth/operation-not-allowed")) {
    return "Email/Password sign-in is currently disabled in your Firebase console.";
  }
  if (typeof error === "string") return error;
  return errObj.message || "An authentication error occurred. Please try again.";
}

// Prototype-friendly sequential/readable ID generator
async function generateReadableFarmerId(): Promise<string> {
  try {
    const snap = await getDocs(collection(db, "farmers"));
    const count = snap.size + 1;
    return `FMR${String(count).padStart(3, "0")}`;
  } catch {
    const randomNum = Math.floor(100 + Math.random() * 900);
    return `FMR${randomNum}`;
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [farmerProfile, setFarmerProfile] = useState<FarmerProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const clearError = () => setError(null);

  // Fetch or create fallback profile for authenticated user
  const fetchFarmerProfile = async (firebaseUser: User): Promise<FarmerProfile> => {
    const farmerDocRef = doc(db, "farmers", firebaseUser.uid);
    let profileData: FarmerProfile;

    try {
      const docSnap = await getDoc(farmerDocRef);
      if (docSnap.exists()) {
        const raw = docSnap.data();
        profileData = {
          id: raw.farmerId || raw.id || `FMR-${firebaseUser.uid.substring(0, 4)}`,
          farmerId: raw.farmerId || raw.id || `FMR-${firebaseUser.uid.substring(0, 4)}`,
          uid: firebaseUser.uid,
          name: raw.name || firebaseUser.displayName || "Authenticated Farmer",
          phone: raw.phone || "9848022338",
          email: raw.email || firebaseUser.email || "",
          village: raw.village || "Kankipadu",
          district: raw.district || "Krishna",
          state: raw.state || "Andhra Pradesh",
          preferredLanguage: raw.preferredLanguage || "en",
          role: raw.role || "farmer",
          aadharLastFour: raw.aadharLastFour || "8821",
          createdAt: raw.createdAt || new Date().toISOString(),
          updatedAt: raw.updatedAt,
          insuranceInfo: raw.insuranceInfo || {
            policyNumber: "PMFBY/AP/2026/094281",
            schemeName: "Pradhan Mantri Fasal Bima Yojana (PMFBY)",
            sumInsuredPerAcre: 38500,
            insurerName: "Agriculture Insurance Company of India (AIC)",
            coverageStartDate: "2026-06-01",
            coverageEndDate: "2026-11-30",
            applicationId: "APP-PMFBY-2026-8819",
          },
        };
      } else {
        // Auto-bootstrap profile if missing
        const newFarmerId = await generateReadableFarmerId();
        profileData = {
          id: newFarmerId,
          farmerId: newFarmerId,
          uid: firebaseUser.uid,
          name: firebaseUser.displayName || firebaseUser.email?.split("@")[0] || "Registered Farmer",
          phone: "9848022338",
          email: firebaseUser.email || "",
          village: "Kankipadu",
          district: "Krishna",
          state: "Andhra Pradesh",
          preferredLanguage: "en",
          role: "farmer",
          aadharLastFour: "8821",
          createdAt: new Date().toISOString(),
          insuranceInfo: {
            policyNumber: `PMFBY/AP/2026/${Math.floor(100000 + Math.random() * 900000)}`,
            schemeName: "Pradhan Mantri Fasal Bima Yojana (PMFBY)",
            sumInsuredPerAcre: 38500,
            insurerName: "Agriculture Insurance Company of India (AIC)",
            coverageStartDate: "2026-06-01",
            coverageEndDate: "2026-11-30",
            applicationId: `APP-PMFBY-${Math.floor(10000 + Math.random() * 90000)}`,
          },
        };

        try {
          await setDoc(farmerDocRef, profileData);
        } catch (setErr) {
          console.warn("Could not write bootstrap profile to Firestore:", setErr);
        }
      }
    } catch (err) {
      console.warn("Firestore error fetching farmer profile:", err);
      // Fallback in-memory profile so UI doesn't crash
      profileData = {
        id: `FMR001`,
        farmerId: `FMR001`,
        uid: firebaseUser.uid,
        name: firebaseUser.displayName || firebaseUser.email?.split("@")[0] || "Farmer",
        phone: "9848022338",
        email: firebaseUser.email || "",
        village: "Kankipadu",
        district: "Krishna",
        state: "Andhra Pradesh",
        preferredLanguage: "en",
        role: "farmer",
        aadharLastFour: "8821",
        createdAt: new Date().toISOString(),
        insuranceInfo: {
          policyNumber: "PMFBY/AP/2026/094281",
          schemeName: "Pradhan Mantri Fasal Bima Yojana (PMFBY)",
          sumInsuredPerAcre: 38500,
          insurerName: "Agriculture Insurance Company of India (AIC)",
          coverageStartDate: "2026-06-01",
          coverageEndDate: "2026-11-30",
          applicationId: "APP-PMFBY-2026-8819",
        },
      };
    }

    return profileData;
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setLoading(true);
      if (currentUser) {
        setUser(currentUser);
        try {
          const profile = await fetchFarmerProfile(currentUser);
          setFarmerProfile(profile);
        } catch (err) {
          console.error("Failed to load farmer profile:", err);
        }
      } else {
        setUser(null);
        setFarmerProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = async (email: string, pass: string): Promise<void> => {
    setError(null);
    setLoading(true);
    try {
      const credential = await signInWithEmailAndPassword(auth, email.trim(), pass);
      setUser(credential.user);
      const profile = await fetchFarmerProfile(credential.user);
      setFarmerProfile(profile);
    } catch (err) {
      const friendly = getFriendlyAuthErrorMessage(err);
      setError(friendly);
      throw new Error(friendly);
    } finally {
      setLoading(false);
    }
  };

  const register = async (input: FarmerRegistrationInput): Promise<void> => {
    setError(null);
    setLoading(true);
    try {
      const credential = await createUserWithEmailAndPassword(
        auth,
        input.email.trim(),
        input.password
      );

      const newFarmerId = await generateReadableFarmerId();
      const stateCode = (input.state || "AP").substring(0, 2).toUpperCase();
      const randomPolicyDigits = Math.floor(100000 + Math.random() * 900000);

      const newProfile: FarmerProfile = {
        id: newFarmerId,
        farmerId: newFarmerId,
        uid: credential.user.uid,
        name: input.name.trim(),
        email: input.email.trim().toLowerCase(),
        phone: input.phone.trim(),
        village: input.village.trim(),
        district: input.district.trim(),
        state: input.state.trim(),
        preferredLanguage: input.preferredLanguage || "en",
        role: "farmer",
        aadharLastFour: input.aadharLastFour?.trim() || "8821",
        createdAt: new Date().toISOString(),
        insuranceInfo: {
          policyNumber: `PMFBY/${stateCode}/2026/${randomPolicyDigits}`,
          schemeName: "Pradhan Mantri Fasal Bima Yojana (PMFBY)",
          sumInsuredPerAcre: 38500,
          insurerName: "Agriculture Insurance Company of India (AIC)",
          coverageStartDate: "2026-06-01",
          coverageEndDate: "2026-11-30",
          applicationId: `APP-PMFBY-2026-${Math.floor(1000 + Math.random() * 9000)}`,
        },
      };

      // Store in Firestore farmers/{uid}
      const farmerDocRef = doc(db, "farmers", credential.user.uid);
      try {
        await setDoc(farmerDocRef, newProfile);
      } catch (storeErr) {
        console.warn("Could not save farmer to Firestore, continuing with local state:", storeErr);
      }

      setUser(credential.user);
      setFarmerProfile(newProfile);
    } catch (err) {
      const friendly = getFriendlyAuthErrorMessage(err);
      setError(friendly);
      throw new Error(friendly);
    } finally {
      setLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    setLoading(true);
    try {
      await signOut(auth);
      setUser(null);
      setFarmerProfile(null);
    } catch (err) {
      console.error("Sign out error:", err);
    } finally {
      setLoading(false);
    }
  };

  const updateFarmerProfile = async (updates: Partial<FarmerProfile>): Promise<void> => {
    if (!user || !farmerProfile) return;

    const updatedProfile: FarmerProfile = {
      ...farmerProfile,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    try {
      const farmerDocRef = doc(db, "farmers", user.uid);
      await updateDoc(farmerDocRef, updates as Record<string, unknown>);
      setFarmerProfile(updatedProfile);
    } catch (err) {
      console.warn("Firestore update error, updating local state:", err);
      setFarmerProfile(updatedProfile);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        farmerProfile,
        loading,
        error,
        clearError,
        login,
        register,
        logout,
        updateFarmerProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
