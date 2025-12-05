// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2025 Guillermo Garcia Maynez

import { DebugControlTools } from './DebugControl';
import { BreakpointTools } from './Breakpoints';
import { InspectionTools } from './Inspection';
import { DAPClient } from '../dap/Client';
import { ConfigManager } from '../Config';

export interface ToolRegistry {
  debugControl: DebugControlTools;
  breakpoints: BreakpointTools;
  inspection: InspectionTools;
  dispose(): void;
}

export function createToolRegistry(
  dapClient: DAPClient,
  configManager: ConfigManager
): ToolRegistry {
  const debugControl = new DebugControlTools(configManager);
  const breakpoints = new BreakpointTools();
  const inspection = new InspectionTools(dapClient, configManager);

  return {
    debugControl,
    breakpoints,
    inspection,
    dispose() {
      debugControl.dispose();
      // breakpoints and inspection don't have disposables currently
    },
  };
}

export * from './DebugControl';
export * from './Breakpoints';
export * from './Inspection';
