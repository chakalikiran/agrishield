import { EvidenceRecord, FieldRecord, DisasterReport, VerificationResult, WeatherReport } from "../types";
import { isPointInsidePolygon, calculateHaversineDistanceMeters } from "./geoUtils";

export function verifyEvidenceItem(
  evidence: EvidenceRecord,
  field: FieldRecord,
  disasterReport?: DisasterReport | null,
  allExistingEvidence: EvidenceRecord[] = [],
  weatherData?: WeatherReport | null
): VerificationResult {
  const anomalies: string[] = [];

  // 1. GPS Verification
  const isInside = isPointInsidePolygon([evidence.lat, evidence.lng], field.coordinates);
  const distToCentroid = calculateHaversineDistanceMeters(
    evidence.lat,
    evidence.lng,
    field.centerLat,
    field.centerLng
  );

  const gpsPassed = isInside || distToCentroid <= 250; // within 250m margin
  if (!gpsPassed) {
    anomalies.push(`Potential anomaly detected: GPS location is ${distToCentroid}m from registered field boundary`);
  }

  // 2. Timestamp Verification
  const evidenceTime = new Date(evidence.timestamp).getTime();
  const fieldRegTime = new Date(field.registeredAt).getTime();
  let timestampPassed = true;

  if (evidenceTime < fieldRegTime - 86400000 * 30) {
    timestampPassed = false;
    anomalies.push("Timestamp anomaly: Evidence date precedes field registration window");
  }

  if (disasterReport && evidence.evidenceType === "Post-disaster") {
    const disasterTime = new Date(disasterReport.date).getTime();
    if (evidenceTime < disasterTime - 86400000) {
      timestampPassed = false;
      anomalies.push("Timestamp anomaly: Post-disaster photo dated before the reported disaster event");
    }
  }

  // 3. Duplicate Detection
  let duplicatePassed = true;
  const duplicateMatch = allExistingEvidence.find(
    (e) =>
      e.id !== evidence.id &&
      ((evidence.imageHash && e.imageHash && e.imageHash === evidence.imageHash) ||
        (Math.abs(e.lat - evidence.lat) < 0.00001 &&
          Math.abs(e.lng - evidence.lng) < 0.00001 &&
          e.timestamp === evidence.timestamp))
  );

  if (duplicateMatch) {
    duplicatePassed = false;
    anomalies.push(`Potential duplicate detected: Matches existing record (${duplicateMatch.id})`);
  }

  // 4. Weather Correlation
  let weatherCorrelationPassed = true;
  if (disasterReport && weatherData) {
    // If disaster is heavy rainfall or flood, check if rainfall peak was > 25mm
    if (
      (disasterReport.disasterType === "Flood" ||
        disasterReport.disasterType === "Heavy Rainfall" ||
        disasterReport.disasterType === "Cyclone") &&
      weatherData.correlationSummary
    ) {
      weatherCorrelationPassed = weatherData.correlationSummary.extremeEventConfirmed;
      if (!weatherCorrelationPassed) {
        anomalies.push("Weather variance: Meteorological satellite records show mild rainfall on reported date");
      }
    }
  }

  // 5. Timeline Consistency
  let timelinePassed = true;
  if (evidence.evidenceType === "Pre-disaster" && disasterReport) {
    const disasterTime = new Date(disasterReport.date).getTime();
    if (evidenceTime > disasterTime + 86400000) {
      timelinePassed = false;
      anomalies.push("Timeline sequence anomaly: Pre-disaster evidence recorded after disaster occurrence");
    }
  }

  const overallStatus =
    gpsPassed && timestampPassed && duplicatePassed && timelinePassed
      ? "Passed"
      : "Flagged";

  return {
    gpsPassed,
    gpsDistanceMeters: distToCentroid,
    timestampPassed,
    duplicatePassed,
    weatherCorrelationPassed,
    timelinePassed,
    overallStatus,
    anomalyDetails: anomalies,
    checkedAt: new Date().toISOString(),
  };
}
