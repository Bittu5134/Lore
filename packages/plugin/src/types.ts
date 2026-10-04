/**
 * @fileoverview Type Definitions for the Lore Cline Integration Plugin.
 *
 * @description
 * Defines lightweight types and hook interfaces for intercepting Cline AgentRuntimeEvents
 * and interacting with the Cline Plugin API without imposing heavy dependencies.
 */

/**
 * Lightweight subset of Lore configuration accessed inside the plugin.
 */
export interface LoreConfigLite {
  /** Absolute filepath where the Lore monorepo resides. */
  loreHome?: string;
  /** Glob ignore patterns for excluded paths. */
  ignore?: string[];
  /** Autonomy setting: "auto", "draft", or "off". */
  autonomy?: "auto" | "draft" | "off";
}

/**
 * Structural duck-typed representation of an AgentRuntimeEvent emitted by the Cline SDK.
 */
export interface RuntimeEventLike {
  /** Event discriminator type (e.g. "assistant-reasoning-delta", "run-finished"). */
  type: string;
  /** Step / loop iteration index. */
  iteration?: number;
  /** Incremental reasoning or text delta. */
  text?: string;
  /** Cumulative text accumulated over the turn. */
  accumulatedText?: string;
  /** Tool execution metadata. */
  toolCall?: { toolName?: string; input?: unknown; toolCallId?: string };
  /** Execution message or status note. */
  message?: unknown;
  /** Output or data payload returned by the tool. */
  result?: unknown;
  /** Terminal execution status of the run (e.g. "completed", "failed"). */
  status?: string;
  /** Final output text delivered to the user. */
  outputText?: string;
  /** Error information if the run or tool failed. */
  error?: { message?: string };
}

/**
 * Host API interface provided by Cline to plugins during `setup()`.
 */
export interface LorePluginApi {
  /** Registers a system prompt rule or dynamic prompt injector. */
  registerRule?: (rule: {
    id: string;
    content: string | (() => string | Promise<string>);
    source?: string;
  }) => void;
  /** Programmatically registers an MCP server with the host agent. */
  registerMcpServer?: (server: {
    name: string;
    transport: {
      type: "stdio";
      command: string;
      args?: string[];
      cwd?: string;
      env?: Record<string, string>;
    };
  }) => void;
}
