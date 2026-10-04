export interface LoreConfigLite {
  loreHome?: string;
  ignore?: string[];
  autonomy?: "auto" | "draft" | "off";
}

export interface RuntimeEventLike {
  type: string;
  iteration?: number;
  text?: string;
  accumulatedText?: string;
  toolCall?: { toolName?: string; input?: unknown; toolCallId?: string };
  message?: unknown;
  result?: unknown;
  status?: string;
  outputText?: string;
  error?: { message?: string };
}

export interface LorePluginApi {
  registerRule?: (rule: {
    id: string;
    content: string | (() => string | Promise<string>);
    source?: string;
  }) => void;
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
