export interface App {
  appName: string;
  api: string;
  enableClipboard: boolean;
  enableSaveFile: boolean;
  saveFileExt: string;
  outputRule: string;
}

export interface Attribute {
  attr: string;
  color: string;
  colorInherit: boolean;
}

export interface Character {
  characterName: string;
  appName: string;
  color: string;
  description: string;
  attributes: Attribute[];
}

export interface AssistantSettings {
  maxLine: number;
  conversationPrompt: string;
}

export interface ExtenstionSettings {
  metaAlpha: number;
  nameLength: number;
  separateCopy: boolean;
}

export interface Settings {
  assistant: AssistantSettings;
  extension: ExtenstionSettings;
  apps: App[];
  characters: Character[];
}

