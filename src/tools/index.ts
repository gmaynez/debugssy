import { DebugControlTools } from './debugControl';
import { BreakpointTools } from './breakpoints';
import { InspectionTools } from './inspection';
import { DAPClient } from '../dap/client';
import { ConfigManager } from '../config';

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

export * from './debugControl';
export * from './breakpoints';
export * from './inspection';

