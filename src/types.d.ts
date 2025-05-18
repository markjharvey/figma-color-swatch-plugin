/// <reference types="@figma/plugin-typings" />

interface PluginMessage {
  type: string;
  collections?: Array<{
    id: string;
    name: string;
    variablesCount: number;
  }>;
  collectionId?: string;
}

interface Window {
  onmessage: (event: MessageEvent) => void;
} 