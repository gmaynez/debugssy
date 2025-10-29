// SPDX-License-Identifier: Apache-2.0

import { DebugControlTools } from './DebugControl';
import { BreakpointTools } from './Breakpoints';
import { InspectionTools } from './Inspection';
import { DAPClient } from '../dap/Client';
import { ConfigManager } from '../Config';

export interface ToolRegistry {
    debugControl: DebugControlTools;
    breakpoints: BreakpointTools;
    inspection: InspectionTools;
}

export function createToolRegistry(dapClient: DAPClient, configManager: ConfigManager): ToolRegistry {
    return {
        debugControl: new DebugControlTools(configManager),
        breakpoints: new BreakpointTools(),
        inspection: new InspectionTools(dapClient, configManager)
    };
}

export * from './DebugControl';
export * from './Breakpoints';
export * from './Inspection';

