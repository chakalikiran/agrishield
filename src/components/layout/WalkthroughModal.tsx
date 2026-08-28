import React, { useState } from "react";
import { useApp } from "../../context/AppContext";
import {
  Sparkles,
  ArrowRight,
  CheckCircle2,
  X,
  MapPin,
  Camera,
  CloudLightning,
  FileText,
  Award,
  Layers,
} from "lucide-react";

interface WalkthroughStep {
  step: number;
  title: string;
  role: "FARMER" | "OFFICER";
  description: string;
  keyFeature: string;
}

const WALKTHROUGH_STEPS: WalkthroughStep[] = [
  {
    step: 1,
    title: "Field & Crop Registration",
    role: "FARMER",
    description: "Farmer marks polygon boundary on Leaflet map (Sy.No 142/3B, 2.35 acres) and records crop profile (Rice - BPT 5204).",
    keyFeature: "Interactive map polygon drawing with real-time acreage calculation.",
  },
  {
    step: 2,
    title: "Continuous Growth Evidence",
    role: "FARMER",
    description: "System logs geo-tagged baseline photos across Sowing, Vegetative Growth, and Flowering stages (91% completeness score).",
    keyFeature: "Continuous visual monitoring prevents post-disaster claim rejection.",
  },
  {
    step: 3,
    title: "Disaster Occurrence & Weather Query",
    role: "FARMER",
    description: "Farmer reports Heavy Rainfall on 22 August 2026. Open-Meteo telemetry immediately validates a 94.2 mm localized rainfall spike.",
    keyFeature: "Automated meteorological correlation with agricultural coordinates.",
  },
  {
    step: 4,
    title: "Guided 4-Step Post-Disaster Capture",
    role: "FARMER",
    description: "Farmer follows the guided workflow: Wide field view → Quadrant section → Epicenter damage → Macro close-up.",
    keyFeature: "Prevents fraudulent single-photo submissions with spatial angle guidance.",
  },
  {
    step: 5,
    title: "Multi-Point Spatial Damage & AI Assessment",
    role: "FARMER",
    description: "Gemini AI categorizes sector severity into Healthy (35%), Moderate (40%), and Severe (25%) with 65% aggregate damage.",
    keyFeature: "Multi-point color-coded map markers (Green/Orange/Red).",
  },
  {
    step: 6,
    title: "Consolidated Claim Dossier Generation",
    role: "FARMER",
    description: "System generates a complete evidence dossier with GIS coordinates, Open-Meteo charts, AI ratings, and loss estimate (₹45,825).",
    keyFeature: "Printable/Exportable audit package for fast-track claim settlement.",
  },
  {
    step: 7,
    title: "Officer Adjudication & Approval",
    role: "OFFICER",
    description: "Dr. Ananya Sharma reviews the dossier, verifies rule matrix checks, and approves DBT indemnity release.",
    keyFeature: "Human-in-the-loop transparent decision audit trail.",
  },
];

export const WalkthroughModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({
  isOpen,
  onClose,
}) => {
  const { setRole } = useApp();
  const [currentStepIdx, setCurrentStepIdx] = useState<number>(0);

  if (!isOpen) return null;

  const currentStep = WALKTHROUGH_STEPS[currentStepIdx];

  const handleStepSelect = (idx: number) => {
    setCurrentStepIdx(idx);
    setRole(WALKTHROUGH_STEPS[idx].role);
  };

  const handleNext = () => {
    if (currentStepIdx < WALKTHROUGH_STEPS.length - 1) {
      handleStepSelect(currentStepIdx + 1);
    } else {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl space-y-6 animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-200 pb-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-800">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-stone-900">
                End-to-End Prototype Demonstration Guide
              </h3>
              <span className="text-xs text-stone-500">
                Smart Crop Insurance Evidence & Damage Assessment Workflow
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-stone-400 hover:text-stone-700 p-1 rounded-lg"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Step Indicator Pills */}
        <div className="flex items-center justify-between gap-1 overflow-x-auto pb-2">
          {WALKTHROUGH_STEPS.map((s, idx) => (
            <button
              key={s.step}
              type="button"
              onClick={() => handleStepSelect(idx)}
              className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition ${
                idx === currentStepIdx
                  ? "bg-emerald-700 text-white ring-4 ring-emerald-100 shadow-sm"
                  : idx < currentStepIdx
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-stone-100 text-stone-600 hover:bg-stone-200"
              }`}
            >
              {s.step}
            </button>
          ))}
        </div>

        {/* Current Step Card */}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-900 bg-emerald-100 px-2.5 py-0.5 rounded-full">
              Step {currentStep.step} of 7 &bull; Active View: {currentStep.role}
            </span>
            <span className="text-xs font-bold text-stone-700">
              {currentStep.role === "FARMER" ? "👨‍🌾 Farmer Persona" : "🏛️ Officer Persona"}
            </span>
          </div>

          <h4 className="text-lg font-bold text-stone-900">{currentStep.title}</h4>
          <p className="text-xs text-stone-700 leading-relaxed font-medium">
            {currentStep.description}
          </p>

          <div className="rounded-lg bg-white p-3 border border-emerald-200/90 text-xs">
            <span className="font-bold text-emerald-950 block mb-0.5">Key Innovation:</span>
            <span className="text-stone-600">{currentStep.keyFeature}</span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center justify-between pt-2 border-t border-stone-200">
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-semibold text-stone-600 hover:text-stone-900"
          >
            Exit Guide
          </button>

          <button
            type="button"
            onClick={handleNext}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold px-5 py-2.5 shadow-sm transition cursor-pointer"
          >
            <span>{currentStepIdx === WALKTHROUGH_STEPS.length - 1 ? "Start Exploring Platform" : "Next Step"}</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
