import React, { useState, useCallback } from "react";
import { useApp } from "../../context/AppContext";
import { useAuth } from "../../context/AuthContext";
import { auth } from "../../lib/firebase";
import { FieldRegistrationMap } from "../maps/FieldRegistrationMap";
import { X, CheckCircle2, ArrowRight, Loader2, AlertCircle } from "lucide-react";
import { SoilType, CropStage } from "../../types";

export const FieldRegistrationModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({
  isOpen,
  onClose,
}) => {
  const { registerFieldAndCrop, registerField, registerCrop, farmer, reloadFarmerData } = useApp();
  const { user } = useAuth();

  const [step, setStep] = useState<1 | 2>(1); // Step 1: Map Polygon Boundary, Step 2: Crop Details
  const [fieldName, setFieldName] = useState<string>("North Canal Plot B");
  const [surveyNumber, setSurveyNumber] = useState<string>("Sy.No 148/2A");
  const [soilType, setSoilType] = useState<SoilType>("Alluvial Clay Loam");

  const [polygonCoords, setPolygonCoords] = useState<[number, number][]>([]);
  const [calculatedArea, setCalculatedArea] = useState<number>(2.4);
  const [centerCoord, setCenterCoord] = useState<[number, number]>([16.5124, 80.6982]);

  // Step 2 Crop Details
  const [cropType, setCropType] = useState<string>("Rice");
  const [variety, setVariety] = useState<string>("BPT 5204 (Samba Mahsuri)");
  const [sowingDate, setSowingDate] = useState<string>("2026-06-15");
  const [harvestDate, setHarvestDate] = useState<string>("2026-11-20");
  const [currentStage, setCurrentStage] = useState<CropStage>("Vegetative Growth");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handlePolygonComplete = useCallback(
    (
      coords: [number, number][],
      area: number,
      center: [number, number]
    ) => {
      setPolygonCoords(coords);
      if (area > 0) {
        setCalculatedArea(Number(area.toFixed(2)));
      }
      if (center && center.length === 2) {
        setCenterCoord(center);
      }
    },
    []
  );

  if (!isOpen) return null;

  const handleFinalSubmit = async () => {
    setFormError(null);

    // 1. Authenticated user validation
    const currentUid = user?.uid || auth.currentUser?.uid;
    if (!currentUid) {
      setFormError("Please log in to continue.");
      return;
    }

    // 2. Step 1 validation
    if (!fieldName.trim()) {
      setFormError("Please provide a Field / Plot identifier.");
      return;
    }

    if (!surveyNumber.trim()) {
      setFormError("Please provide a Survey Number / Khatiyan.");
      return;
    }

    // 3. Step 2 validation
    if (!cropType.trim()) {
      setFormError("Please select a crop type.");
      return;
    }

    if (!variety.trim()) {
      setFormError("Please provide the seed variety / hybrid.");
      return;
    }

    if (!sowingDate) {
      setFormError("Please select a sowing / transplanting date.");
      return;
    }

    if (!harvestDate) {
      setFormError("Please select an expected harvest date.");
      return;
    }

    if (new Date(harvestDate) < new Date(sowingDate)) {
      setFormError("Expected harvest date cannot be before the sowing date.");
      return;
    }

    if (!currentStage) {
      setFormError("Please select the current crop stage.");
      return;
    }

    setIsSubmitting(true);

    try {
      const boundaryCoords =
        polygonCoords.length >= 3
          ? polygonCoords
          : [
              [16.5124, 80.6982] as [number, number],
              [16.5138, 80.7015] as [number, number],
              [16.5109, 80.7028] as [number, number],
              [16.5095, 80.6995] as [number, number],
            ];

      if (registerFieldAndCrop) {
        await registerFieldAndCrop(
          {
            name: fieldName.trim(),
            surveyNumber: surveyNumber.trim(),
            soilType,
            coordinates: boundaryCoords,
            centerLat: centerCoord[0] || 16.5116,
            centerLng: centerCoord[1] || 80.7005,
            approxAreaAcres: calculatedArea || 2.4,
          },
          {
            cropType: cropType.trim(),
            variety: variety.trim(),
            sowingDate,
            expectedHarvestDate: harvestDate,
            currentStage,
            season: "Kharif 2026",
            cultivatedAreaAcres: calculatedArea || 2.4,
          }
        );
      } else {
        // Fallback
        const createdField = await registerField({
          farmerId: farmer.id,
          name: fieldName.trim(),
          surveyNumber: surveyNumber.trim(),
          soilType,
          coordinates: boundaryCoords,
          centerLat: centerCoord[0] || 16.5116,
          centerLng: centerCoord[1] || 80.7005,
          approxAreaAcres: calculatedArea || 2.4,
        });

        await registerCrop({
          fieldId: createdField.id,
          farmerId: farmer.id,
          cropType: cropType.trim(),
          variety: variety.trim(),
          sowingDate,
          expectedHarvestDate: harvestDate,
          currentStage,
          season: "Kharif 2026",
          cultivatedAreaAcres: calculatedArea || 2.4,
        });

        if (reloadFarmerData) {
          await reloadFarmerData();
        }
      }

      setSuccessMessage("Field and Crop registered successfully!");
      setTimeout(() => {
        onClose();
      }, 400);
    } catch (err: any) {
      console.error("Firestore field registration error:", err);
      setFormError("Unable to complete registration. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-xl max-w-3xl w-full p-4 sm:p-6 shadow-xl space-y-4 animate-in fade-in zoom-in-95 my-6 border border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
              Field Registration Wizard
            </span>
            <h3 className="text-base font-bold text-slate-900 mt-1">
              {step === 1 ? "1. Map Agricultural Boundary & Survey Details" : "2. Crop & Seasonal Sowing Profile"}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="text-slate-400 hover:text-slate-700 p-1 rounded hover:bg-slate-100 transition disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Error Alert */}
        {formError && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700 flex items-center gap-2 animate-in fade-in">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
            <span>{formError}</span>
          </div>
        )}

        {/* Success Alert */}
        {successMessage && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-800 flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            <span>{successMessage}</span>
          </div>
        )}

        {step === 1 ? (
          /* Step 1: Map Boundary + Survey info */
          <div className="space-y-3.5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1 uppercase tracking-wider">
                  Field / Plot Identifier
                </label>
                <input
                  type="text"
                  value={fieldName}
                  onChange={(e) => {
                    setFieldName(e.target.value);
                    if (formError) setFormError(null);
                  }}
                  className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1 uppercase tracking-wider">
                  Survey Number / Khatiyan
                </label>
                <input
                  type="text"
                  value={surveyNumber}
                  onChange={(e) => {
                    setSurveyNumber(e.target.value);
                    if (formError) setFormError(null);
                  }}
                  className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs font-mono text-slate-900 focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1 uppercase tracking-wider">
                  Soil Classification
                </label>
                <select
                  value={soilType}
                  onChange={(e) => setSoilType(e.target.value as any)}
                  className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-emerald-600"
                >
                  <option value="Alluvial Clay Loam">Alluvial Clay Loam</option>
                  <option value="Black Cotton Soil">Black Cotton Soil</option>
                  <option value="Red Sandy Soil">Red Sandy Soil</option>
                  <option value="Loamy Soil">Loamy Soil</option>
                  <option value="Sandy Loam">Sandy Loam</option>
                </select>
              </div>
            </div>

            {/* Interactive Leaflet Registration Map */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1 flex items-center justify-between">
                <span>Draw Boundary Polygon (Click points on map to enclose field):</span>
                <span className="text-emerald-700 font-bold">
                  {calculatedArea > 0 ? `Calculated Area: ${calculatedArea} Acres` : "Area Pending Closure"}
                </span>
              </label>
              <FieldRegistrationMap onPolygonComplete={handlePolygonComplete} />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2.5 border-t border-slate-200">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!fieldName.trim()) {
                    setFormError("Please enter a field identifier.");
                    return;
                  }
                  if (!surveyNumber.trim()) {
                    setFormError("Please enter a survey number.");
                    return;
                  }
                  setFormError(null);
                  setStep(2);
                }}
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold px-4 py-2 shadow-2xs transition cursor-pointer"
              >
                <span>Continue to Crop Profile</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ) : (
          /* Step 2: Crop Details */
          <div className="space-y-3.5">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-2.5 flex items-center justify-between text-xs">
              <div>
                <span className="text-slate-500 block text-[10px]">Field Registered:</span>
                <span className="font-bold text-slate-900">{fieldName} &bull; {surveyNumber}</span>
              </div>
              <div className="text-right">
                <span className="text-slate-500 block text-[10px]">Enclosed Acreage:</span>
                <span className="font-bold text-emerald-800">{calculatedArea} Acres</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1 uppercase tracking-wider">
                  Crop Type
                </label>
                <select
                  value={cropType}
                  onChange={(e) => {
                    setCropType(e.target.value);
                    if (formError) setFormError(null);
                  }}
                  className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-emerald-600"
                >
                  <option value="Rice">Rice (Paddy)</option>
                  <option value="Cotton">Cotton</option>
                  <option value="Maize">Maize (Corn)</option>
                  <option value="Black Gram">Black Gram (Urad)</option>
                  <option value="Sugarcane">Sugarcane</option>
                  <option value="Wheat">Wheat</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1 uppercase tracking-wider">
                  Seed Variety / Hybrid
                </label>
                <input
                  type="text"
                  value={variety}
                  onChange={(e) => {
                    setVariety(e.target.value);
                    if (formError) setFormError(null);
                  }}
                  className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1 uppercase tracking-wider">
                  Sowing / Transplanting Date
                </label>
                <input
                  type="date"
                  value={sowingDate}
                  onChange={(e) => {
                    setSowingDate(e.target.value);
                    if (formError) setFormError(null);
                  }}
                  className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1 uppercase tracking-wider">
                  Expected Harvest Date
                </label>
                <input
                  type="date"
                  value={harvestDate}
                  onChange={(e) => {
                    setHarvestDate(e.target.value);
                    if (formError) setFormError(null);
                  }}
                  className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-700 mb-1 uppercase tracking-wider">
                  Current Crop Stage
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {(["Sowing", "Vegetative Growth", "Flowering", "Maturity / Harvest"] as CropStage[]).map(
                    (stg) => (
                      <button
                        key={stg}
                        type="button"
                        onClick={() => {
                          setCurrentStage(stg);
                          if (formError) setFormError(null);
                        }}
                        className={`rounded border p-1.5 text-center text-xs font-semibold transition cursor-pointer ${
                          currentStage === stg
                            ? "border-emerald-600 bg-emerald-50 text-emerald-800 ring-1 ring-emerald-500"
                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {stg}
                      </button>
                    )
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => {
                  setFormError(null);
                  setStep(1);
                }}
                disabled={isSubmitting}
                className="text-xs font-semibold text-slate-600 hover:text-slate-900 disabled:opacity-50"
              >
                &larr; Back to Map Boundary
              </button>

              <button
                type="button"
                onClick={handleFinalSubmit}
                disabled={isSubmitting}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold px-4 py-2 shadow-2xs transition cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Complete Registration</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
