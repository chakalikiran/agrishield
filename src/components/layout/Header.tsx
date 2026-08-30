import React, { useState } from "react";
import { useApp } from "../../context/AppContext";
import { useAuth } from "../../context/AuthContext";
import { LanguageCode } from "../../types";
import { FarmerProfileModal } from "../farmer/FarmerProfileModal";
import {
  Globe,
  Sparkles,
  Wifi,
  WifiOff,
  LogOut,
  Building2,
  User,
} from "lucide-react";

export const Header: React.FC<{ onOpenWalkthrough: () => void }> = ({ onOpenWalkthrough }) => {
  const {
    role,
    language,
    setLanguage,
    isOnline,
    toggleSimulatedOffline,
    t,
  } = useApp();

  const { farmerProfile, officerProfile, logout } = useAuth();
  const [isProfileModalOpen, setIsProfileModalOpen] = useState<boolean>(false);

  const isOfficer = role === "OFFICER" || role === "officer";

  return (
    <header className="sticky top-0 z-40 h-14 bg-white border-b border-slate-200 flex items-center justify-between px-3 sm:px-6 shrink-0 shadow-xs">
      <div className="mx-auto max-w-7xl w-full flex items-center justify-between gap-3">
        {/* Brand & Portal Label */}
        <div className="flex items-center space-x-3">
          <div className={`w-8 h-8 rounded flex items-center justify-center text-white shrink-0 shadow-xs ${isOfficer ? "bg-blue-600" : "bg-emerald-600"}`}>
            <div className="w-3.5 h-3.5 border-2 border-white rotate-45" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold tracking-tight text-slate-900 flex items-center gap-1.5">
              <span>AgriShield</span>
              <span className="font-normal text-slate-400 text-xs sm:text-sm">
                | {isOfficer ? t.roleOfficer : t.roleFarmer}
              </span>
            </h1>
          </div>
        </div>

        {/* Right Controls Hub */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          {/* Authenticated Profile Chip */}
          {!isOfficer && farmerProfile && (
            <button
              type="button"
              onClick={() => setIsProfileModalOpen(true)}
              title={t.viewProfile || "View & Edit Farmer Profile"}
              className="flex items-center bg-emerald-50 hover:bg-emerald-100/80 rounded-lg px-2.5 py-1 space-x-1.5 border border-emerald-200 transition cursor-pointer"
            >
              <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
              <span className="text-[11px] font-bold text-emerald-900 max-w-[110px] sm:max-w-[150px] truncate">
                {farmerProfile.name}
              </span>
              <span className="text-[10px] font-mono text-emerald-700 bg-emerald-100/80 px-1 py-0.2 rounded hidden sm:inline">
                {farmerProfile.farmerId || farmerProfile.id}
              </span>
            </button>
          )}

          {isOfficer && officerProfile && (
            <div className="flex items-center bg-blue-50 rounded-lg px-2.5 py-1 space-x-1.5 border border-blue-200">
              <Building2 className="w-3 h-3 text-blue-600" />
              <span className="text-[11px] font-bold text-blue-900">
                {officerProfile.name}
              </span>
              <span className="text-[10px] font-mono text-blue-700 bg-blue-100 px-1 py-0.2 rounded">
                {officerProfile.officerId}
              </span>
            </div>
          )}

          {/* Interactive Guide Pill (Farmer only) */}
          {!isOfficer && (
            <button
              type="button"
              onClick={onOpenWalkthrough}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 transition cursor-pointer shadow-2xs"
            >
              <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
              <span className="hidden sm:inline">{t.guide || "Guide"}</span>
            </button>
          )}

          {/* Language Selector */}
          <div className="relative flex items-center">
            <Globe className="h-3.5 w-3.5 text-slate-400 absolute left-2 pointer-events-none" />
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as LanguageCode)}
              className="rounded-lg border border-slate-200 bg-slate-50 pl-6 pr-2 py-1 text-xs font-semibold text-slate-700 focus:outline-none focus:border-emerald-600 cursor-pointer"
            >
              <option value="en">EN</option>
              <option value="hi">हिंदी (HI)</option>
              <option value="te">తెలుగు (TE)</option>
              <option value="ta">தமிழ் (TA)</option>
              <option value="mr">मराठी (MR)</option>
            </select>
          </div>

          {/* Offline Simulation Toggle */}
          <button
            type="button"
            onClick={toggleSimulatedOffline}
            title={isOnline ? t.simulateOffline || "Simulate Offline Mode" : t.switchToOnline || "Switch to Online Mode"}
            className={`p-1.5 rounded-lg border transition cursor-pointer ${
              isOnline
                ? "border-slate-200 text-slate-600 hover:bg-slate-100"
                : "border-amber-400 bg-amber-50 text-amber-700"
            }`}
          >
            {isOnline ? <Wifi className="h-3.5 w-3.5 text-emerald-600" /> : <WifiOff className="h-3.5 w-3.5 text-amber-600" />}
          </button>

          {/* Logout Button */}
          <button
            type="button"
            onClick={() => logout()}
            title={t.logout || "Sign Out of AgriShield"}
            className="inline-flex items-center gap-1 p-1.5 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-rose-700 hover:bg-rose-50 hover:border-rose-200 transition cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden md:inline text-xs font-semibold">{t.logout}</span>
          </button>
        </div>
      </div>

      {/* Farmer Profile Modal */}
      <FarmerProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
      />
    </header>
  );
};
