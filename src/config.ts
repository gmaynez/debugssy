// SPDX-License-Identifier: Apache-2.0

import * as vscode from 'vscode';
import { z } from 'zod';
import { DEFAULT_BREAKPOINT_TIMEOUT_MS } from './constants';

/**
 * Zod schema for runtime validation of configuration values.
 * Ensures configuration meets requirements even if user provides invalid values.
 */
export const DebugConfigurationSchema = z.object({
    enabled: z.boolean(),
    port: z.number().int().min(1024, { message: 'Port must be >= 1024' }).max(65535, { message: 'Port must be <= 65535' }),
    automationLevel: z.enum(['assisted', 'full']),
    waitForBreakpointTimeout: z.number().int().min(1000, { message: 'Timeout must be >= 1000ms' }).max(300000, { message: 'Timeout must be <= 300000ms' }),
    allowStepOperations: z.boolean(),
    maxExpressionLength: z.number().int().min(20, { message: 'Max expression length must be >= 20' }).max(400, { message: 'Max expression length must be <= 400' })
});

export type DebugConfiguration = z.infer<typeof DebugConfigurationSchema>;

export class ConfigManager {
    private static readonly CONFIG_SECTION = 'debugssy';
    private configChangeEmitter = new vscode.EventEmitter<DebugConfiguration>();
    public readonly onConfigChange = this.configChangeEmitter.event;

    constructor() {
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration(ConfigManager.CONFIG_SECTION)) {
                this.configChangeEmitter.fire(this.getConfig());
            }
        });
    }

    getConfig(): DebugConfiguration {
        const config = vscode.workspace.getConfiguration(ConfigManager.CONFIG_SECTION);
        const rawConfig = {
            enabled: config.get<boolean>('mcp.enabled', true),
            port: config.get<number>('mcp.port', 3000),
            automationLevel: config.get<'assisted' | 'full'>('automationLevel', 'assisted'),
            waitForBreakpointTimeout: config.get<number>('waitForBreakpointTimeout', DEFAULT_BREAKPOINT_TIMEOUT_MS),
            allowStepOperations: config.get<boolean>('allowStepOperations', false),
            maxExpressionLength: config.get<number>('maxExpressionLength', 100)
        };

        // Validate configuration using Zod schema
        const result = DebugConfigurationSchema.safeParse(rawConfig);
        
        if (!result.success) {
            // Log validation errors but return defaults to prevent extension failure
            console.error('Invalid configuration detected:', result.error.issues);
            const issues = result.error.issues.map(issue => 
                `${issue.path.join('.')}: ${issue.message}`
            ).join(', ');
            vscode.window.showWarningMessage(
                `Debugssy: Invalid configuration (${issues}). Using defaults.`
            );
            
            // Return validated defaults
            return DebugConfigurationSchema.parse({
                enabled: true,
                port: 3000,
                automationLevel: 'assisted',
                waitForBreakpointTimeout: DEFAULT_BREAKPOINT_TIMEOUT_MS,
                allowStepOperations: false,
                maxExpressionLength: 100
            });
        }
        
        return result.data;
    }

    dispose(): void {
        this.configChangeEmitter.dispose();
    }
}

