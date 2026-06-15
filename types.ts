export interface Message {
  id: string;
  role: 'user' | 'model' | 'system';
  text: string;
  timestamp: Date;
  audioUrl?: string; // Optional field for pre-rendered TTS audio
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
}

export enum AppState {
  INTRO = 'INTRO',
  ACTIVE = 'ACTIVE',
}

export interface JaggedConfig {
  apiKey: string;
}

export interface MemoryItem {
  id: string;
  content: string;
  createdAt: Date;
  category: 'perimeter' | 'personal' | 'important';
}

export interface VoiceSettings {
  autoSpeak: boolean;
  engine: 'browser' | 'gemini';
  voiceName: string; // for browser (Web Speech voices) or gemini prebuilt (Fenrir / Zephyr etc.)
  rate: number;
  pitch: number;
}

export interface ConnectedApp {
  id: string;
  name: string;
  description: string;
  imageUrl?: string;
  status: 'connected' | 'disconnected' | 'restricted';
  category: 'forensic' | 'intelligence' | 'anonymity' | 'tool';
  secretKey?: string;
}
