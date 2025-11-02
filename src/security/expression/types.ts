export type RiskLevel = "critical" | "high" | "medium" | "low";

export type ValidationLevel = "strict" | "moderate" | "permissive" | "disabled";

export interface ValidationResult {
  allowed: boolean;
  reason?: string;
  riskLevel?: RiskLevel;
}
