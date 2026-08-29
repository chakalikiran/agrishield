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
} from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { FarmerProfile, FarmerRegistrationInput, OfficerProfile } from "../types";

interface AuthContextType {
  user: User | null;
  userRole: "farmer" | "officer" | null;
  farmerProfile: FarmerProfile | null;
  officerProfile: OfficerProfile | null;
  loading: boolean;
  error: string | null;
  clearError: () => void;
  login: (email: string, pass: string) => Promise<void>;
  register: (input: FarmerRegistrationInput) => Promise<void>;
  logout: () => Promise<void>;
  updateFarmerProfile: (updates: Partial<FarmerProfile>) => Promise<void>;
  seedOfficerTestAccount: () => Promise<void>;
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

async function generateReadableFarmerId(): Promise<string> {
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  return `FMR${randomNum}`;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<"farmer" | "officer" | null>(null);
  const [farmerProfile, setFarmerProfile] = useState<FarmerProfile | null>(null);
  const [officerProfile, setOfficerProfile] = useState<OfficerProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const clearError = () => setError(null);

  const loadUserRoleAndProfile = async (firebaseUser: User) => {
    // 1. Check users/{uid} for central role lookup
    const userDocRef = doc(db, "users", firebaseUser.uid);
    const userSnap = await getDoc(userDocRef);

    if (userSnap.exists()) {
      const userData = userSnap.data();
      const roleVal = (userData.role || "").toLowerCase();
      if (roleVal === "officer") {
        setUserRole("officer");
        setOfficerProfile({
          uid: firebaseUser.uid,
          id: userData.officerId || `OFF-${firebaseUser.uid.substring(0, 4)}`,
          name: userData.name || "Officer",
          email: firebaseUser.email || userData.email || "",
          role: "officer",
          officerId: userData.officerId || "AIC-AP-KR-042",
          district: userData.district || "Krishna",
          badgeNumber: userData.officerId || "AIC-AP-KR-042",
          assignedDistrict: userData.district || "Krishna",
          insurerName: "Agriculture Insurance Company of India",
        });
        setFarmerProfile(null);
        return;
      }
    }

    // 2. Check farmers/{uid} for farmer profile
    const farmerDocRef = doc(db, "farmers", firebaseUser.uid);
    const farmerSnap = await getDoc(farmerDocRef);

    if (farmerSnap.exists()) {
      const raw = farmerSnap.data();
      setUserRole("farmer");
      setFarmerProfile({
        id: raw.farmerId || raw.id || `FMR-${firebaseUser.uid.substring(0, 4)}`,
        farmerId: raw.farmerId || raw.id || `FMR-${firebaseUser.uid.substring(0, 4)}`,
        uid: firebaseUser.uid,
        name: raw.name || firebaseUser.displayName || "",
        phone: raw.phone || "",
        email: raw.email || firebaseUser.email || "",
        village: raw.village || "",
        district: raw.district || "",
        state: raw.state || "",
        preferredLanguage: raw.preferredLanguage || "en",
        role: "farmer",
        aadharLastFour: raw.aadharLastFour || "",
        createdAt: raw.createdAt || new Date().toISOString(),
        updatedAt: raw.updatedAt,
        insuranceInfo: raw.insuranceInfo || {
          policyNumber: `PMFBY/AP/2026/${Math.floor(100000 + Math.random() * 900000)}`,
          schemeName: "Pradhan Mantri Fasal Bima Yojana (PMFBY)",
          sumInsuredPerAcre: 38500,
          insurerName: "Agriculture Insurance Company of India (AIC)",
          coverageStartDate: "2026-06-01",
          coverageEndDate: "2026-11-30",
          applicationId: `APP-PMFBY-${Math.floor(10000 + Math.random() * 90000)}`,
        },
      });
      setOfficerProfile(null);
      return;
    }

    // If neither exists, role is missing
    setUserRole(null);
    setFarmerProfile(null);
    setOfficerProfile(null);
    throw new Error("Your account does not have an assigned role. Please contact the administrator.");
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setLoading(true);
      if (currentUser) {
        setUser(currentUser);
        try {
          await loadUserRoleAndProfile(currentUser);
          setError(null);
        } catch (err: any) {
          console.error("Role lookup error:", err);
          setUserRole(null);
          setFarmerProfile(null);
          setOfficerProfile(null);
          setError(err.message || "Your account does not have an assigned role. Please contact the administrator.");
        }
      } else {
        setUser(null);
        setUserRole(null);
        setFarmerProfile(null);
        setOfficerProfile(null);
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
      await loadUserRoleAndProfile(credential.user);
    } catch (err: any) {
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
        aadharLastFour: input.aadharLastFour?.trim() || "",
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

      const farmerDocRef = doc(db, "farmers", credential.user.uid);
      await setDoc(farmerDocRef, newProfile);

      setUser(credential.user);
      setUserRole("farmer");
      setFarmerProfile(newProfile);
      setOfficerProfile(null);
    } catch (err: any) {
      const friendly = getFriendlyAuthErrorMessage(err);
      setError(friendly);
      throw new Error(friendly);
    } finally {
      setLoading(false);
    }
  };

  const seedOfficerTestAccount = async (): Promise<void> => {
    if (!user) return;
    try {
      const officerData = {
        uid: user.uid,
        email: user.email || "officer@aicofindia.gov.in",
        role: "officer",
        name: "Dr. Ananya Sharma",
        officerId: "AIC-AP-KR-042",
        district: "Krishna",
      };
      await setDoc(doc(db, "users", user.uid), officerData);
      setUserRole("officer");
      setOfficerProfile({
        uid: user.uid,
        id: "AIC-AP-KR-042",
        name: "Dr. Ananya Sharma",
        email: user.email || "officer@aicofindia.gov.in",
        role: "officer",
        officerId: "AIC-AP-KR-042",
        district: "Krishna",
        badgeNumber: "AIC-AP-KR-042",
        assignedDistrict: "Krishna",
        insurerName: "Agriculture Insurance Company of India",
      });
      setFarmerProfile(null);
      setError(null);
    } catch (err: any) {
      console.error("Failed to seed officer account:", err);
      setError("Failed to initialize officer test account.");
    }
  };

  const logout = async (): Promise<void> => {
    setLoading(true);
    try {
      await signOut(auth);
      setUser(null);
      setUserRole(null);
      setFarmerProfile(null);
      setOfficerProfile(null);
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
        userRole,
        farmerProfile,
        officerProfile,
        loading,
        error,
        clearError,
        login,
        register,
        logout,
        updateFarmerProfile,
        seedOfficerTestAccount,
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
