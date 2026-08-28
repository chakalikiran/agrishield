import React, { useState } from "react";
import { useApp } from "../../context/AppContext";
import { X, CheckCircle2, Sprout } from "lucide-react";
import { CropStage } from "../../types";

export const CropRegistrationModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  targetFieldId?: string;
}> = ({ isOpen, onClose, targetFieldId }) => {
  const { registerCrop, farmer, fields, activeFieldId } = useApp();

  const effectiveFieldId = targetFieldId || activeFieldId;
  const currentField = fields.find((f) => f.id === effectiveFieldId);

  const [cropType, setCropType] = useState<string>("Rice");
  const [variety, setVariety] = useState<string>("BPT 5204 (Samba Mahsuri)");
  const [sowingDate, setSowingDate] = useState<string>("2026-06-15");
  const [harvestDate, setHarvestDate] = useState<string>("2026-11-20");
  const [currentStage, setCurrentStage] = useState<CropStage>("Vegetative Growth");
  const [season, setSeason] = useState<string>("Kharif 2026");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  if (!isOpen || !effectiveFieldId) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      await registerCrop({
        fieldId: effectiveFieldId,
        farmerId: farmer.farmerId || farmer.id,
        cropType: cropType,
        variety: variety,
        sowingDate: sowingDate,
        expectedHarvestDate: harvestDate,
        currentStage: currentStage,
        season: season,
        cultivatedAreaAcres: currentField?.approxAreaAcres || 2.0,
      });
      onClose();
    } catch (err) {
      console.error("Error registering crop:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-xl max-w-md w-full p-4 sm:p-5 shadow-xl space-y-3.5 animate-in fade-in zoom-in-95 border border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded bg-emerald-100 flex items-center justify-center text-emerald-700">
              <Sprout className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Register Sown Crop</h3>
              <span className="text-[11px] text-slate-500">
                Plot: {currentField?.name || "Selected Field"} ({currentField?.surveyNumber})
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1 rounded hover:bg-slate-100 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1 uppercase tracking-wider">
              Crop Species
            </label>
            <select
              value={cropType}
              onChange={(e) => setCropType(e.target.value)}
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
              Cultivar / Seed Variety
            </label>
            <input
              type="text"
              value={variety}
              onChange={(e) => setVariety(e.target.value)}
              required
              className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-emerald-600"
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1 uppercase tracking-wider">
                Sowing Date
              </label>
              <input
                type="date"
                value={sowingDate}
                onChange={(e) => setSowingDate(e.target.value)}
                required
                className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-emerald-600"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1 uppercase tracking-wider">
                Harvest Date
              </label>
              <input
                type="date"
                value={harvestDate}
                onChange={(e) => setHarvestDate(e.target.value)}
                className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-emerald-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1 uppercase tracking-wider">
              Growth Stage
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {(["Sowing", "Vegetative Growth", "Flowering", "Harvest Ready"] as CropStage[]).map(
                (stg) => (
                  <button
                    key={stg}
                    type="button"
                    onClick={() => setCurrentStage(stg)}
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

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold px-3.5 py-1.5 shadow-2xs transition cursor-pointer disabled:opacity-50"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {isSubmitting ? "Saving..." : "Save Crop"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
