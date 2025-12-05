// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2025 Guillermo Garcia Maynez

export type RiskLevel = 'critical' | 'high' | 'medium' | 'low';

export type ValidationLevel = 'strict' | 'moderate' | 'permissive' | 'disabled';

export interface ValidationResult {
  allowed: boolean;
  reason?: string;
  riskLevel?: RiskLevel;
}
