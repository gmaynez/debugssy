// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2025 Guillermo Garcia Maynez

import { vi } from 'vitest';

/**
 * Mock VS Code API for testing.
 * Provides commonly used VS Code types and functions.
 */

// Event Emitter mock
export class MockEventEmitter<T> {
  private listeners: Array<(e: T) => any> = [];

  event = (listener: (e: T) => any) => {
    this.listeners.push(listener);
    return {
      dispose: () => {
        const index = this.listeners.indexOf(listener);
        if (index > -1) {
          this.listeners.splice(index, 1);
        }
      },
    };
  };

  fire(data: T) {
    this.listeners.forEach((listener) => listener(data));
  }

  dispose() {
    this.listeners = [];
  }
}

// Disposable mock
export const mockDisposable = () => ({
  dispose: vi.fn(),
});

// Uri mock
export class MockUri {
  constructor(
    public scheme: string,
    public authority: string,
    public path: string,
    public query: string,
    public fragment: string,
    public fsPath: string
  ) {}

  static file(path: string) {
    return new MockUri('file', '', path, '', '', path);
  }

  static parse(value: string) {
    return new MockUri('file', '', value, '', '', value);
  }

  /**
   * Static method to join path segments to a base URI.
   * Matches VS Code's vscode.Uri.joinPath(base, ...segments) signature.
   */
  static joinPath(base: MockUri, ...pathSegments: string[]): MockUri {
    const joinedPath = [base.fsPath, ...pathSegments].join('/');
    return new MockUri('file', '', joinedPath, '', '', joinedPath);
  }

  /**
   * Instance method for compatibility (some code may use uri.joinPath()).
   * @deprecated Use static Uri.joinPath(uri, ...segments) instead.
   */
  joinPath(...pathSegments: string[]): MockUri {
    return MockUri.joinPath(this, ...pathSegments);
  }

  toString() {
    return this.fsPath;
  }
}

// Position mock
export class MockPosition {
  constructor(
    public line: number,
    public character: number
  ) {}
}

// Range mock
export class MockRange {
  constructor(
    public start: MockPosition,
    public end: MockPosition
  ) {}
}

// Location mock
export class MockLocation {
  constructor(
    public uri: MockUri,
    public range: MockRange
  ) {}
}

// SourceBreakpoint mock
export class MockSourceBreakpoint {
  public id: string;

  constructor(
    public location: MockLocation,
    public enabled: boolean = true,
    public condition?: string,
    public hitCondition?: string,
    public logMessage?: string
  ) {
    this.id = Math.random().toString(36).substring(7);
  }
}

// RelativePattern mock
export class MockRelativePattern {
  constructor(
    public base: string,
    public pattern: string
  ) {}
}

// Debug Session mock
export const createMockDebugSession = (name: string = 'test-session', type: string = 'node') =>
  ({
    id: Math.random().toString(36).substring(7),
    name,
    type,
    workspaceFolder: undefined,
    configuration: {
      type,
      name,
      request: 'launch',
    },
    customRequest: vi.fn(),
    getDebugProtocolBreakpoint: vi.fn(),
  }) as any;

// Debug API mock
export const createMockDebugAPI = () => ({
  activeDebugSession: undefined as any,
  activeStackFrame: undefined as any,
  breakpoints: [] as any[],
  onDidStartDebugSession: vi.fn(() => mockDisposable()),
  onDidTerminateDebugSession: vi.fn(() => mockDisposable()),
  onDidChangeActiveDebugSession: vi.fn(() => mockDisposable()),
  onDidChangeBreakpoints: vi.fn(() => mockDisposable()),
  addBreakpoints: vi.fn((breakpoints: any[]) => {
    createMockDebugAPI().breakpoints.push(...breakpoints);
  }),
  removeBreakpoints: vi.fn((breakpoints: any[]) => {
    const mockDebug = createMockDebugAPI();
    mockDebug.breakpoints = mockDebug.breakpoints.filter((bp) => !breakpoints.includes(bp));
  }),
  registerDebugAdapterTrackerFactory: vi.fn(() => mockDisposable()),
  startDebugging: vi.fn(),
  stopDebugging: vi.fn(),
});

// File type enum mock (matches vscode.FileType)
export const FileType = {
  Unknown: 0,
  File: 1,
  Directory: 2,
  SymbolicLink: 64,
} as const;

// Symbol kind enum mock (matches vscode.SymbolKind)
export const SymbolKind = {
  File: 0,
  Module: 1,
  Namespace: 2,
  Package: 3,
  Class: 4,
  Method: 5,
  Property: 6,
  Field: 7,
  Constructor: 8,
  Enum: 9,
  Interface: 10,
  Function: 11,
  Variable: 12,
  Constant: 13,
  String: 14,
  Number: 15,
  Boolean: 16,
  Array: 17,
  Object: 18,
  Key: 19,
  Null: 20,
  EnumMember: 21,
  Struct: 22,
  Event: 23,
  Operator: 24,
  TypeParameter: 25,
} as const;

// Workspace API mock
export const createMockWorkspaceAPI = () => ({
  workspaceFolders: [] as any[],
  getConfiguration: vi.fn((_section?: string) => ({
    get: vi.fn((_key: string, defaultValue?: any) => defaultValue),
    has: vi.fn(() => true),
    inspect: vi.fn(),
    update: vi.fn(),
  })),
  onDidChangeConfiguration: vi.fn(() => mockDisposable()),
  onDidChangeWorkspaceFolders: vi.fn(() => mockDisposable()),
  findFiles: vi.fn(),
  createFileSystemWatcher: vi.fn(() => ({
    onDidCreate: vi.fn(() => mockDisposable()),
    onDidDelete: vi.fn(() => mockDisposable()),
    dispose: vi.fn(),
  })),
  fs: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    delete: vi.fn(),
    stat: vi.fn(),
    createDirectory: vi.fn(),
  },
});

// Window API mock
export const createMockWindowAPI = () => ({
  activeTextEditor: undefined as any,
  showInformationMessage: vi.fn(),
  showWarningMessage: vi.fn(),
  showErrorMessage: vi.fn(),
  showQuickPick: vi.fn(),
  showInputBox: vi.fn(),
  createOutputChannel: vi.fn(() => ({
    append: vi.fn(),
    appendLine: vi.fn(),
    clear: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    dispose: vi.fn(),
  })),
  withProgress: vi.fn((_options, task) => task({ report: vi.fn() })),
});

// Commands API mock
export const createMockCommandsAPI = () => ({
  executeCommand: vi.fn(),
  registerCommand: vi.fn(() => mockDisposable()),
  registerTextEditorCommand: vi.fn(() => mockDisposable()),
  getCommands: vi.fn(() => Promise.resolve([])),
});

// McpHttpServerDefinition mock (VS Code 1.105+ MCP auto-discovery)
export class MockMcpHttpServerDefinition {
  public label: string;
  public uri: MockUri;
  public headers?: Record<string, string>;
  public version?: string;

  constructor(label: string, uri: MockUri, headers?: Record<string, string>, version?: string) {
    this.label = label;
    this.uri = uri;
    this.headers = headers;
    this.version = version;
  }
}

// Language Model API mock
export const createMockLmAPI = () => ({
  registerMcpServerDefinitionProvider: vi.fn(() => mockDisposable()),
});

// Disposable class mock
export class MockDisposable {
  constructor(private disposeFn: () => void = () => {}) {}

  dispose() {
    this.disposeFn();
  }
}

/**
 * Creates a complete VS Code API mock for testing
 */
export function createVSCodeMock() {
  const debug = createMockDebugAPI();
  const workspace = createMockWorkspaceAPI();
  const window = createMockWindowAPI();
  const commands = createMockCommandsAPI();
  const lm = createMockLmAPI();

  return {
    // APIs
    debug,
    workspace,
    window,
    commands,
    lm,

    // Classes
    Uri: MockUri,
    Position: MockPosition,
    Range: MockRange,
    Location: MockLocation,
    SourceBreakpoint: MockSourceBreakpoint,
    EventEmitter: MockEventEmitter,
    RelativePattern: MockRelativePattern,
    McpHttpServerDefinition: MockMcpHttpServerDefinition,

    // Enums
    ProgressLocation: {
      Notification: 15,
      SourceControl: 1,
      Window: 10,
    },
    FileType,
    SymbolKind,

    // Types
    Disposable: Object.assign(MockDisposable, {
      from: (...disposables: any[]) => ({
        dispose: () => disposables.forEach((d) => d.dispose()),
      }),
    }),
  };
}

export const Disposable = MockDisposable;

/**
 * Helper to reset all mocks in the VS Code API
 */
export function resetVSCodeMocks(vscode: ReturnType<typeof createVSCodeMock>) {
  vi.clearAllMocks();
  vscode.debug.breakpoints = [];
  vscode.debug.activeDebugSession = undefined;
}
