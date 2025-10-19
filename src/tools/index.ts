import { DebugControlTools } from './debugControl';
import { BreakpointTools } from './breakpoints';
import { InspectionTools } from './inspection';
import { DAPClient } from '../dap/client';

export interface ToolRegistry {
    debugControl: DebugControlTools;
    breakpoints: BreakpointTools;
    inspection: InspectionTools;
}

export function createToolRegistry(dapClient: DAPClient): ToolRegistry {
    return {
        debugControl: new DebugControlTools(),
        breakpoints: new BreakpointTools(),
        inspection: new InspectionTools(dapClient)
    };
}

export * from './debugControl';
export * from './breakpoints';
export * from './inspection';

