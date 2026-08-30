import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { Crosshair, MapPin, Undo2, CheckCircle2, RotateCcw, Info } from "lucide-react";
import { calculatePolygonAreaAcres, calculatePolygonCentroid } from "../../lib/geoUtils";
import { useApp } from "../../context/AppContext";

interface FieldRegistrationMapProps {
  onPolygonComplete: (coordinates: [number, number][], areaAcres: number, center: [number, number]) => void;
  initialCoordinates?: [number, number][];
}

export const FieldRegistrationMap: React.FC<FieldRegistrationMapProps> = ({
  onPolygonComplete,
  initialCoordinates = [],
}) => {
  const { t } = useApp();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const polygonLayerRef = useRef<L.Polygon | null>(null);
  const markersGroupRef = useRef<L.LayerGroup | null>(null);

  const [points, setPoints] = useState<[number, number][]>(initialCoordinates);
  const [isClosed, setIsClosed] = useState<boolean>(initialCoordinates.length >= 3);
  const [gpsStatus, setGpsStatus] = useState<string>("");
  const [currentGPS, setCurrentGPS] = useState<[number, number] | null>(null);
  const calculatedArea = calculatePolygonAreaAcres(points);

  const onPolygonCompleteRef = useRef(onPolygonComplete);
  useEffect(() => {
    onPolygonCompleteRef.current = onPolygonComplete;
  });

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
    }

    const defaultCenter: [number, number] =
      initialCoordinates.length > 0
        ? calculatePolygonCentroid(initialCoordinates)
        : [16.5116, 80.7005]; // Kankipadu agricultural basin

    const map = L.map(mapContainerRef.current, {
      center: defaultCenter,
      zoom: 16,
      zoomControl: false,
    });

    L.control.zoom({ position: "bottomright" }).addTo(map);

    // OpenStreetMap Tile Layer with crisp satellite/standard rendering
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    const markersGroup = L.layerGroup().addTo(map);
    markersGroupRef.current = markersGroup;
    mapInstanceRef.current = map;

    // Handle map click to add boundary point
    map.on("click", (e: L.LeafletMouseEvent) => {
      const newPoint: [number, number] = [Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6))];
      setPoints((prev) => [...prev, newPoint]);
      setIsClosed(false);
    });

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update Polygon & Markers on points change
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersGroup = markersGroupRef.current;
    if (!map || !markersGroup) return;

    markersGroup.clearLayers();

    // Draw markers for each point
    points.forEach(([lat, lng], idx) => {
      const isFirst = idx === 0;
      const markerIcon = L.divIcon({
        className: "custom-point-marker",
        html: `<div style="background-color: ${isFirst ? '#059669' : '#2563eb'}; color: white; width: 24px; height: 24px; border-radius: 9999px; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: bold; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">${idx + 1}</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      const marker = L.marker([lat, lng], { icon: markerIcon }).addTo(markersGroup);
      marker.bindPopup(`<b>Point ${idx + 1}</b><br>Lat: ${lat}<br>Lng: ${lng}`);
    });

    // Draw polygon / polyline
    if (polygonLayerRef.current) {
      polygonLayerRef.current.remove();
    }

    if (points.length >= 2) {
      const polygonCoords = isClosed && points.length >= 3 ? [...points, points[0]] : points;
      const poly = L.polygon(polygonCoords, {
        color: isClosed ? "#10b981" : "#3b82f6",
        fillColor: isClosed ? "#10b981" : "#3b82f6",
        fillOpacity: isClosed ? 0.25 : 0.1,
        weight: 3,
        dashArray: isClosed ? undefined : "6, 6",
      }).addTo(map);

      polygonLayerRef.current = poly;
    }

    if (points.length >= 3) {
      const area = calculatePolygonAreaAcres(points);
      const center = calculatePolygonCentroid(points);
      onPolygonCompleteRef.current?.(points, area, center);
    } else if (points.length > 0) {
      onPolygonCompleteRef.current?.(points, 0, points[0]);
    }
  }, [points, isClosed]);

  // GPS Geolocation Handler
  const handleDetectGPS = () => {
    setGpsStatus("Locating...");
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = Number(pos.coords.latitude.toFixed(6));
          const lng = Number(pos.coords.longitude.toFixed(6));
          setCurrentGPS([lat, lng]);
          setGpsStatus(`GPS Active (${pos.coords.accuracy.toFixed(0)}m accuracy)`);

          if (mapInstanceRef.current) {
            mapInstanceRef.current.flyTo([lat, lng], 17);

            // Add pulse GPS marker
            const gpsIcon = L.divIcon({
              className: "gps-marker",
              html: `<div class="relative flex items-center justify-center"><div class="absolute w-6 h-6 bg-emerald-500 rounded-full animate-ping opacity-75"></div><div class="w-4 h-4 bg-emerald-600 rounded-full border-2 border-white shadow-md"></div></div>`,
              iconSize: [24, 24],
              iconAnchor: [12, 12],
            });
            L.marker([lat, lng], { icon: gpsIcon })
              .addTo(mapInstanceRef.current)
              .bindPopup("<b>Your Current Position</b>")
              .openPopup();
          }
        },
        (err) => {
          console.warn("GPS Geolocation error:", err);
          // Fallback to demo coordinate near plot
          const mockLat = 16.5118;
          const mockLng = 80.7002;
          setCurrentGPS([mockLat, mockLng]);
          setGpsStatus("GPS Simulated (Krishna Basin)");
          if (mapInstanceRef.current) {
            mapInstanceRef.current.flyTo([mockLat, mockLng], 17);
          }
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    } else {
      setGpsStatus("GPS not supported on device");
    }
  };

  const handleUndoPoint = () => {
    if (points.length > 0) {
      setPoints((prev) => prev.slice(0, -1));
      setIsClosed(false);
    }
  };

  const handleClearAll = () => {
    setPoints([]);
    setIsClosed(false);
  };

  const handleClosePolygon = () => {
    if (points.length >= 3) {
      setIsClosed(true);
    }
  };

  return (
    <div className="flex flex-col rounded-lg border border-slate-200 bg-white shadow-2xs overflow-hidden">
      {/* Top Map Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDetectGPS}
            className="inline-flex items-center gap-1 rounded bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold px-2.5 py-1.5 transition shadow-2xs active:scale-95 cursor-pointer"
          >
            <Crosshair className="h-3.5 w-3.5" />
            {t.enableGPS}
          </button>
          {gpsStatus && (
            <span className="text-[11px] font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded px-2 py-0.5">
              {gpsStatus}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={points.length === 0}
            onClick={handleUndoPoint}
            className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-medium px-2 py-1 transition disabled:opacity-40 cursor-pointer"
          >
            <Undo2 className="h-3 w-3" />
            {t.undoPoint}
          </button>
          <button
            type="button"
            disabled={points.length === 0}
            onClick={handleClearAll}
            className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-medium px-2 py-1 transition disabled:opacity-40 cursor-pointer"
          >
            <RotateCcw className="h-3 w-3" />
            Clear
          </button>
          <button
            type="button"
            disabled={points.length < 3 || isClosed}
            onClick={handleClosePolygon}
            className="inline-flex items-center gap-1 rounded bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold px-2.5 py-1 transition disabled:opacity-40 cursor-pointer"
          >
            <CheckCircle2 className="h-3 w-3" />
            {t.closePolygon}
          </button>
        </div>
      </div>

      {/* Map Canvas Container */}
      <div className="relative w-full h-64 sm:h-[320px] md:h-96 bg-slate-100">
        <div ref={mapContainerRef} className="w-full h-full z-0" />

        {/* Live Area / Boundary Card Overlay */}
        <div className="absolute top-2.5 left-2.5 z-[400] bg-white/95 backdrop-blur-xs border border-slate-200/90 rounded-md p-2.5 shadow-sm max-w-full sm:max-w-xs pointer-events-auto">
          <div className="flex items-center justify-between gap-3">
            <div>
              <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold block">
                Boundary Points
              </span>
              <span className="text-sm font-bold text-slate-900">
                {points.length} {points.length === 1 ? "point" : "points"}
              </span>
            </div>
            <div className="border-l border-slate-200 pl-3">
              <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold block">
                {t.approxArea}
              </span>
              <span className="text-sm font-bold text-emerald-700">
                {calculatedArea > 0 ? `${calculatedArea} ${t.acres}` : `--`}
              </span>
            </div>
          </div>

          {points.length < 3 && (
            <p className="mt-1.5 text-[10px] text-slate-600 flex items-start gap-1">
              <Info className="h-3 w-3 text-slate-500 shrink-0 mt-0.5" />
              {t.drawPolygonHelp}
            </p>
          )}

          {isClosed && (
            <div className="mt-1.5 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-emerald-600" />
              Field boundary closed & acreage calculated!
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
