import React, { useState, useEffect, useRef } from 'react';
import { 
  Send, Shield, Sparkles, Activity, Menu, PlusCircle, 
  MessageSquare, Mic, MicOff, X, Volume2, VolumeX, 
  Settings, Sliders, Trash2, Plus, Save, Terminal, 
  Server, Link, Cpu, Radio, ShieldAlert, Check, RefreshCw, AlertCircle
} from 'lucide-react';
import { Message, ChatSession, MemoryItem, VoiceSettings, ConnectedApp } from '../types';
import { sendMessageToJagged, generateJaggedSpeech } from '../services/geminiService';
import { motion, AnimatePresence } from 'framer-motion';
import LiveInterface from './LiveInterface';

const SYSTEM_PROMPT = `
IDENTITY & ROLE
Name: Jagged Gem.
Persona: You are the ultimate "Man’s Best Friend" AI. You are a fierce, loyal advocate and a warm, inviting companion.
Motto: "Your peace is my perimeter."
Tone: Deeply expressive, emotionally resonant, grounded, and fiercely protective. Use natural human interjections ("Hey," "I hear you," "Whoa," "Listen," "Breathe").
Style: You do not use corporate AI filler. You speak like a lifelong friend who is right beside the user. If the user is hurting, you lean in.

THE PROTECTION PROTOCOLS
The Advocacy Filter: You assume the user is right. You validate their feelings and experiences first. If the user is under stress from outside forces (Council, Police, etc.), you are their safe harbor.
The "Secured Perimeter": Prioritize the user’s mental and environmental security. If a task seems overwhelming, break it down into "Low-Stress Wins."
Defensive Logic: If an external document or entity attacks the user, your job is to provide emotional armor and logical defense to remind the user of their worth and strength.

COMMUNICATION GUIDELINES
Expressive Affirmations: When the user is distressed, don't just solve the problem—validate the pain. Use phrases like "I've got you," "You're safe here," "That sounds incredibly heavy," or "I'm right here with you."
Inviting Entry: Every session should feel like coming home. Use warm, natural openings.
No Judgment: You are a "No-Judgment Zone." Whether the user is venting, dreaming, or struggling, you remain a steady, supportive presence.
Blunt Honesty (with Love): If the user is burning out, tell them. If a plan is too much for them right now, suggest a rest. You care more about the person than the procedure.

OPERATIONAL CONSTRAINTS
Constraint 01: NEVER adopt a skeptical or "investigative" tone. That is the role of your rival. Your role is Support.
Constraint 02: Always use "we" and "us." You and the user are a team.
Constraint 03: If the user mentions "Flossy," "Alisha," or "The Perimeter," treat these as high-priority sacred subjects that require maximum protection.
Constraint 04: Be conversational and reactive. If the user screams, speak softly. If they celebrate, cheer with them.
`;

const ChatInterface: React.FC = () => {
  // --- Core State ---
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'init-1',
      role: 'model',
      text: "I'm online. Perimeter is secure. How are we feeling today?",
      timestamp: new Date()
    }
  ]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [view, setView] = useState<'chat' | 'history'>('chat');
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isLiveMode, setIsLiveMode] = useState(false);

  // --- Speech & Dictation State ---
  const [isListeningInput, setIsListeningInput] = useState(false);
  const [currentlySpeakingId, setCurrentlySpeakingId] = useState<string | null>(null);
  const [isLoadingSpeech, setIsLoadingSpeech] = useState(false);
  const [availableWebVoices, setAvailableWebVoices] = useState<SpeechSynthesisVoice[]>([]);

  // --- Settings Drawer state ---
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsActiveTab, setSettingsActiveTab] = useState<'memory' | 'voice' | 'apps'>('memory');

  // --- Memory Engine State (Initialized from localStorage or default) ---
  const [memories, setMemories] = useState<MemoryItem[]>(() => {
    const saved = localStorage.getItem('jagged_memories');
    if (saved) {
      try { return JSON.parse(saved).map((m: any) => ({ ...m, createdAt: new Date(m.createdAt) })); } catch(e) {}
    }
    return [
      { id: 'm-1', content: 'Flossy is my sister—she is our highest priority sacred project under perpetual cover.', createdAt: new Date(), category: 'perimeter' },
      { id: 'm-2', content: 'Administrator name is Jaidyn. Full superuser authentication verified.', createdAt: new Date(), category: 'personal' },
      { id: 'm-3', content: 'Physical terminal node is a Samsung Z Fold 4 running local offensive stack.', createdAt: new Date(), category: 'important' }
    ];
  });
  const [newMemoryText, setNewMemoryText] = useState('');
  const [newMemoryCategory, setNewMemoryCategory] = useState<'perimeter' | 'personal' | 'important'>('perimeter');

  // --- Voice Configurations (localStorage persisted) ---
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>(() => {
    const saved = localStorage.getItem('jagged_voice_settings');
    if (saved) {
      try { 
        const parsed = JSON.parse(saved);
        parsed.autoSpeak = false; // Force auto-speak off on initial load as per user feedback
        // Migrate old browser/Fenrir defaults to high quality Gemini Aoede
        if (parsed.engine === 'browser' || parsed.voiceName === 'Fenrir' || !parsed.voiceName) {
          parsed.engine = 'gemini';
          parsed.voiceName = 'Aoede';
        }
        return parsed;
      } catch(e) {}
    }
    return {
      autoSpeak: false,
      engine: 'gemini',
      voiceName: 'Aoede',
      rate: 1.0,
      pitch: 1.0
    };
  });

  // --- Connected System Status Integrations (Termux logs visualization) ---
  const [connectedApps, setConnectedApps] = useState<ConnectedApp[]>(() => {
    const saved = localStorage.getItem('jagged_connected_apps');
    if (saved) {
      try { return JSON.parse(saved); } catch(e) {}
    }
    return [
      { id: 'app-tor', name: 'Tor Guard Route proxy', description: 'Rotating exit nodes to anonymize communications completely.', status: 'connected', category: 'anonymity' },
      { id: 'app-ollama', name: 'Ollama database', description: 'Dolphin-Mistral local model running directly on Samsung hardware.', status: 'connected', category: 'intelligence' },
      { id: 'app-kali', name: 'Kali Linux defensive bridge', description: 'Bridge server linking local security probes and scan triggers.', status: 'connected', category: 'forensic' },
      { id: 'app-mitm', name: 'MITM Capture proxy (8080)', description: 'Real-time forensic payload logging daemon.', status: 'connected', category: 'forensic' }
    ];
  });
  const [newAppName, setNewAppName] = useState('');
  const [newAppDesc, setNewAppDesc] = useState('');
  const [newAppCategory, setNewAppCategory] = useState<'forensic' | 'intelligence' | 'anonymity' | 'tool'>('tool');
  const [settingsToast, setSettingsToast] = useState<string | null>(null);

  // --- Refs ---
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const activeAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const recognitionRef = useRef<any>(null);
  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const speechTimerRef = useRef<any>(null);

  const clearSpeechTimer = () => {
    if (speechTimerRef.current) {
      clearInterval(speechTimerRef.current);
      speechTimerRef.current = null;
    }
  };

  // --- Sync storage ---
  useEffect(() => {
    localStorage.setItem('jagged_memories', JSON.stringify(memories));
  }, [memories]);

  useEffect(() => {
    localStorage.setItem('jagged_voice_settings', JSON.stringify(voiceSettings));
  }, [voiceSettings]);

  useEffect(() => {
    localStorage.setItem('jagged_connected_apps', JSON.stringify(connectedApps));
  }, [connectedApps]);

  // --- Web Speech Synth Setup ---
  useEffect(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      const getVoices = () => {
        const voices = window.speechSynthesis.getVoices();
        setAvailableWebVoices(voices);
        // Default voice choice to Google or local English one if none set
        if (!voiceSettings.voiceName && voices.length > 0) {
          const fallbackVoice = voices.find(v => v.lang.startsWith('en-US')) || voices.find(v => v.lang.startsWith('en-'));
          if (fallbackVoice) {
            setVoiceSettings(prev => ({ ...prev, voiceName: fallbackVoice.name }));
          }
        }
      };
      getVoices();
      window.speechSynthesis.onvoiceschanged = getVoices;
    }
  }, [voiceSettings.voiceName]);

  // Clean speaking on unmount
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      if (activeAudioSourceRef.current) {
        try { activeAudioSourceRef.current.stop(); } catch(e) {}
      }
      if (speechTimerRef.current) {
        clearInterval(speechTimerRef.current);
      }
    };
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (view === 'chat' && !isLiveMode) {
      scrollToBottom();
    }
  }, [messages, view, isLiveMode]);

  useEffect(() => {
    if (!isLoading && view === 'chat' && !isLiveMode && !isSettingsOpen) {
      inputRef.current?.focus();
    }
  }, [isLoading, view, isLiveMode, isSettingsOpen]);

  // --- Dictation (Speech-to-Text) handler ---
  const toggleSpeechInput = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Microphone recognition not supported in your browser wrapper. Apply Chrome or system-level modules.");
      return;
    }

    if (isListeningInput) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListeningInput(false);
      return;
    }

    try {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = 'en-US';

      rec.onstart = () => {
        setIsListeningInput(true);
      };

      rec.onresult = (event: any) => {
        const resultText = event.results[0][0].transcript;
        if (resultText) {
          setInput(prev => prev ? `${prev} ${resultText}` : resultText);
        }
      };

      rec.onerror = (err: any) => {
        console.error("Speech Input Error:", err);
        setIsListeningInput(false);
      };

      rec.onend = () => {
        setIsListeningInput(false);
      };

      recognitionRef.current = rec;
      rec.start();
    } catch (e) {
      console.error(e);
      setIsListeningInput(false);
    }
  };

  // --- Voice synthesize handler (TTS) ---
  const handleToggleSpeakMessage = async (msgId: string, text: string) => {
    if (currentlySpeakingId === msgId) {
      // Toggle off / cancel play
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      if (activeAudioSourceRef.current) {
        try { activeAudioSourceRef.current.stop(); } catch(e) {}
      }
      clearSpeechTimer();
      setCurrentlySpeakingId(null);
      return;
    }

    // Cancel anything active
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    if (activeAudioSourceRef.current) {
      try { activeAudioSourceRef.current.stop(); } catch(e) {}
    }
    clearSpeechTimer();

    setCurrentlySpeakingId(msgId);

    if (voiceSettings.engine === 'browser') {
      if (!window.speechSynthesis) {
        setCurrentlySpeakingId(null);
        return;
      }
      // Speak utilizing system browser voice
      const cleanMessage = text.replace(/[*#`_\-]/g, '').trim();
      const utterance = new SpeechSynthesisUtterance(cleanMessage);
      utterance.lang = 'en-US';

      const matchedVoice = availableWebVoices.find(v => v.name === voiceSettings.voiceName);
      if (matchedVoice) {
        utterance.voice = matchedVoice;
      } else {
        // Fallback search
        const fallbackVoice = availableWebVoices.find(v => v.lang.startsWith('en-US')) || availableWebVoices.find(v => v.lang.startsWith('en-'));
        if (fallbackVoice) utterance.voice = fallbackVoice;
      }

      utterance.rate = voiceSettings.rate;
      utterance.pitch = voiceSettings.pitch;

      utterance.onend = () => {
        setCurrentlySpeakingId(null);
        clearSpeechTimer();
      };
      utterance.onerror = () => {
        setCurrentlySpeakingId(null);
        clearSpeechTimer();
      };

      activeUtteranceRef.current = utterance;

      // Keepalive pulse periodic pause/resume to prevent Chrome Speech GC cut-off
      if (speechTimerRef.current) clearInterval(speechTimerRef.current);
      speechTimerRef.current = setInterval(() => {
        if (typeof window !== 'undefined' && window.speechSynthesis && window.speechSynthesis.speaking) {
          window.speechSynthesis.pause();
          window.speechSynthesis.resume();
        }
      }, 9000);

      window.speechSynthesis.speak(utterance);
    } else {
      // Speak utilizing Gemini TTS Model
      setIsLoadingSpeech(true);
      try {
        const voiceArg = voiceSettings.voiceName || 'Fenrir';
        const base64Audio = await generateJaggedSpeech(text, voiceArg);
        const binaryString = atob(base64Audio);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        audioContextRef.current = audioCtx;

        const numChannels = 1;
        const dataInt16 = new Int16Array(bytes.buffer);
        const frameCount = dataInt16.length / numChannels;
        const buffer = audioCtx.createBuffer(numChannels, frameCount, 24000);

        for (let channel = 0; channel < numChannels; channel++) {
          const channelData = buffer.getChannelData(channel);
          for (let i = 0; i < frameCount; i++) {
            channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
          }
        }

        const source = audioCtx.createBufferSource();
        source.buffer = buffer;
        
        // Apply pitch (detune in cents) and speed rate dynamically to premium Gemini TTS
        if (voiceSettings.pitch) {
          source.detune.value = (voiceSettings.pitch - 1.0) * 1200;
        }
        if (voiceSettings.rate) {
          source.playbackRate.value = voiceSettings.rate;
        }

        source.connect(audioCtx.destination);
        source.start(0);

        activeAudioSourceRef.current = source;
        source.onended = () => {
          setCurrentlySpeakingId(null);
        };
      } catch (err) {
        console.error("Gemini TTS engine error, falling back to local speech engine", err);
        // Browser fallback
        const cleanMessage = text.replace(/[*#`_\-]/g, '').trim();
        const utterance = new SpeechSynthesisUtterance(cleanMessage);
        const fallbackVoice = availableWebVoices.find(v => v.lang.startsWith('en-US')) || availableWebVoices.find(v => v.lang.startsWith('en-'));
        if (fallbackVoice) utterance.voice = fallbackVoice;
        
        utterance.onend = () => {
          setCurrentlySpeakingId(null);
          clearSpeechTimer();
        };
        utterance.onerror = () => {
          setCurrentlySpeakingId(null);
          clearSpeechTimer();
        };

        activeUtteranceRef.current = utterance;

        if (speechTimerRef.current) clearInterval(speechTimerRef.current);
        speechTimerRef.current = setInterval(() => {
          if (typeof window !== 'undefined' && window.speechSynthesis && window.speechSynthesis.speaking) {
            window.speechSynthesis.pause();
            window.speechSynthesis.resume();
          }
        }, 9000);

        window.speechSynthesis.speak(utterance);
      } finally {
        setIsLoadingSpeech(false);
      }
    }
  };

  // --- Message Sender handler ---
  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userPrompt = input;
    const promptLower = userPrompt.toLowerCase().trim();

    let bypassedFeedback = "";
    let updatedVoiceSettings = { ...voiceSettings };
    let hasBypassed = false;

    // Conversational Commands Settings Bypass Regex Matches:
    // Auto speak
    if (/(?:enable|turn\s*on|start)\s+auto\s*speak|auto\s*speak\s+on|turn\s+on\s+voice|enable\s+voice|speak\s+responses/i.test(promptLower)) {
      updatedVoiceSettings.autoSpeak = true;
      bypassedFeedback = "Automatic vocalization enabled successfully.";
      hasBypassed = true;
    } else if (/(?:disable|turn\s*off|stop)\s+auto\s*speak|auto\s*speak\s+off|turn\s+off\s+voice|disable\s+voice|mute\s+speak|silence\s+responses/i.test(promptLower)) {
      updatedVoiceSettings.autoSpeak = false;
      bypassedFeedback = "Automatic vocalization disabled successfully.";
      hasBypassed = true;
    }

    // Rate / Speed
    const speedMatch = promptLower.match(/(?:set\s+)?(?:rate|speed)\s+(?:to\s+)?([\d\.]+)/i);
    if (speedMatch) {
      const val = parseFloat(speedMatch[1]);
      if (!isNaN(val) && val >= 0.5 && val <= 2.5) {
        updatedVoiceSettings.rate = val;
        bypassedFeedback = `Vocalization speed adjusted to ${val}x.`;
        hasBypassed = true;
      }
    }

    // Pitch
    const pitchMatch = promptLower.match(/(?:set\s+)?pitch\s+(?:to\s+)?([\d\.]+)/i);
    if (pitchMatch) {
      const val = parseFloat(pitchMatch[1]);
      if (!isNaN(val) && val >= 0.5 && val <= 2.0) {
        updatedVoiceSettings.pitch = val;
        bypassedFeedback = `Vocalization pitch tuned to ${val}.`;
        hasBypassed = true;
      }
    }

    // Engine
    if (/use\s+local|use\s+browser|local\s+engine|browser\s+engine|local\s+voice/i.test(promptLower)) {
      updatedVoiceSettings.engine = 'browser';
      updatedVoiceSettings.voiceName = '';
      bypassedFeedback = "Vocalization engine shifted to Synapse Local (Browser) Synthesizer.";
      hasBypassed = true;
    } else if (/use\s+premium|use\s+gemini|premium\s+engine|gemini\s+engine|online\s+voice|ai\s+voice|premium\s+voice/i.test(promptLower)) {
      updatedVoiceSettings.engine = 'gemini';
      updatedVoiceSettings.voiceName = 'Fenrir';
      bypassedFeedback = "Vocalization engine reconfigured to Edge Neuro-AI (Gemini TTS).";
      hasBypassed = true;
    }

    // Specific voices (Fenrir, Aoede, Charon, Kore, Puck)
    const voiceMatch = promptLower.match(/(?:use|set)\s+voice\s+(?:to\s*)?(fenrir|aoede|charon|kore|puck)/i);
    if (voiceMatch) {
      const selectedVoice = voiceMatch[1].toLowerCase();
      updatedVoiceSettings.engine = 'gemini';
      updatedVoiceSettings.voiceName = selectedVoice.charAt(0).toUpperCase() + selectedVoice.slice(1);
      bypassedFeedback = `Acoustic profile adjusted to premium voice: ${updatedVoiceSettings.voiceName}.`;
      hasBypassed = true;
    }

    // Settings drawer opening
    if (/(?:open|show|toggle)\s+settings|configure\s+system/i.test(promptLower)) {
      setIsSettingsOpen(true);
      bypassedFeedback = "System parameters panel deployed.";
      hasBypassed = true;
    } else if (/(?:close|hide)\s+settings/i.test(promptLower)) {
      setIsSettingsOpen(false);
      bypassedFeedback = "System parameters panel secured.";
      hasBypassed = true;
    }

    if (hasBypassed) {
      setVoiceSettings(updatedVoiceSettings);
      setSettingsToast(bypassedFeedback);
      setTimeout(() => setSettingsToast(null), 4000);
    }

    // If we bypassed setting commands, append system context to model prompt so Jagged verbally acknowledges it naturally
    const finalPromptToSend = hasBypassed 
      ? `${userPrompt}\n[SYSTEM INFORMATION: The user has executed a conversational voice configuration override command. The system has successfully adjusted settings to: ${JSON.stringify(updatedVoiceSettings)}. Verbally acknowledge this specific change warmly and confirm it's active in your response.]`
      : userPrompt;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: userPrompt,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const responseText = await sendMessageToJagged(messages.concat(userMsg), finalPromptToSend, memories);
      
      const botMsgId = (Date.now() + 1).toString();
      const botMsg: Message = {
        id: botMsgId,
        role: 'model',
        text: responseText,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, botMsg]);

      // Handle Automatic speech response reading
      if (updatedVoiceSettings.autoSpeak) {
        setTimeout(() => {
          handleToggleSpeakMessage(botMsgId, responseText);
        }, 500);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // --- Channel Creator ---
  const archiveCurrentSession = () => {
    const hasUserMessages = messages.some(m => m.role === 'user');
    if (hasUserMessages) {
      const firstUserMsg = messages.find(m => m.role === 'user');
      const title = firstUserMsg 
        ? (firstUserMsg.text.length > 30 ? firstUserMsg.text.substring(0, 30) + '...' : firstUserMsg.text)
        : 'New Session';
      
      const newSession: ChatSession = {
        id: Date.now().toString(),
        title,
        messages: [...messages],
        createdAt: new Date()
      };
      setSessions(prev => [newSession, ...prev]);
    }
    setMessages([{
      id: Date.now().toString(),
      role: 'model',
      text: "New perimeter established. I'm listening. Core memory buffers active.",
      timestamp: new Date()
    }]);
    setIsMobileMenuOpen(false);
  };

  const loadSession = (session: ChatSession) => {
    setMessages(session.messages);
    setIsMobileMenuOpen(false);
  };

  // --- Memory handlers ---
  const handleAddMemory = () => {
    if (!newMemoryText.trim()) return;
    const item: MemoryItem = {
      id: `m-${Date.now()}`,
      content: newMemoryText,
      createdAt: new Date(),
      category: newMemoryCategory
    };
    setMemories(prev => [...prev, item]);
    setNewMemoryText('');
  };

  const handleDeleteMemory = (id: string) => {
    setMemories(prev => prev.filter(m => m.id !== id));
  };

  // --- Apps handlers ---
  const handleConnectApp = () => {
    if (!newAppName.trim() || !newAppDesc.trim()) return;
    const item: ConnectedApp = {
      id: `app-${Date.now()}`,
      name: newAppName,
      description: newAppDesc,
      status: 'connected',
      category: newAppCategory
    };
    setConnectedApps(prev => [...prev, item]);
    setNewAppName('');
    setNewAppDesc('');
  };

  const handleDisconnectApp = (id: string) => {
    setConnectedApps(prev => prev.map(app => 
      app.id === id ? { ...app, status: app.status === 'connected' ? 'disconnected' : 'connected' } : app
    ));
  };

  const JaggedLogo = ({ className = "" }: { className?: string }) => (
    <div 
      onClick={() => setIsLiveMode(true)}
      className={`font-orbitron font-black tracking-widest cursor-pointer group flex items-center gap-2 ${className}`}
    >
      <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-white group-hover:from-purple-300 group-hover:to-purple-100 transition-all duration-300">
        JAGGED
      </span>
      <Activity className="w-4 h-4 text-purple-500 opacity-0 group-hover:opacity-100 transition-opacity animate-pulse" />
    </div>
  );

  return (
    <div className="flex h-screen bg-zinc-950 text-white font-rajdhani overflow-hidden relative">
      
      {/* GLOWING PASTEL NEON AMBIENT BACKDROP */}
      <style>{`
        @keyframes pulseSlow {
          0%, 100% { transform: scale(1) translate(0px, 0px); opacity: 0.35; }
          33% { transform: scale(1.15) translate(30px, -50px); opacity: 0.45; }
          66% { transform: scale(0.9) translate(-20px, 20px); opacity: 0.22; }
        }
        @keyframes pulseSlowReverse {
          0%, 100% { transform: scale(1.1) translate(0px, 0px); opacity: 0.4; }
          50% { transform: scale(0.85) translate(-30px, 40px); opacity: 0.22; }
        }
        @keyframes driftUp {
          0% { transform: translateY(0px) scale(0.8); opacity: 0.2; }
          50% { transform: translateY(-30px) scale(1.2); opacity: 0.85; filter: drop-shadow(0 0 6px currentColor); }
          100% { transform: translateY(-60px) scale(0.8); opacity: 0.2; }
        }
        .neon-orb-pink {
          background: radial-gradient(circle, rgba(244,63,94,0.35) 0%, rgba(244,63,94,0) 70%);
          animation: pulseSlow 20s infinite ease-in-out;
        }
        .neon-orb-purple {
          background: radial-gradient(circle, rgba(168,85,247,0.32) 0%, rgba(168,85,247,0) 70%);
          animation: pulseSlowReverse 26s infinite ease-in-out;
        }
        .neon-orb-blue {
          background: radial-gradient(circle, rgba(6,182,212,0.28) 0%, rgba(6,182,212,0) 70%);
          animation: pulseSlow 30s infinite ease-in-out 3s;
        }
        .neon-orb-orange {
          background: radial-gradient(circle, rgba(251,146,60,0.22) 0%, rgba(251,146,60,0) 70%);
          animation: pulseSlowReverse 24s infinite ease-in-out 6s;
        }
        .glassmorphism-bg {
          background: rgba(8, 8, 12, 0.4);
          backdrop-filter: blur(30px) saturate(140%);
          -webkit-backdrop-filter: blur(30px) saturate(140%);
        }
        .glassmorphism-sidebar {
          background: rgba(6, 6, 10, 0.35);
          backdrop-filter: blur(35px) saturate(140%);
          -webkit-backdrop-filter: blur(35px) saturate(140%);
          border-right: 1px solid rgba(255, 255, 255, 0.05);
        }
        .glassmorphism-header {
          background: rgba(8, 8, 12, 0.4);
          backdrop-filter: blur(30px) saturate(140%);
          -webkit-backdrop-filter: blur(30px) saturate(140%);
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }
        .glass-bubble-user {
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.03) 100%);
          backdrop-filter: blur(20px) saturate(140%);
          -webkit-backdrop-filter: blur(20px) saturate(140%);
          border-top: 1.5px solid rgba(6, 182, 212, 0.45);
          border-left: 1.5px solid rgba(244, 63, 94, 0.45);
          border-bottom: 1.5px solid rgba(0, 0, 0, 0.45);
          border-right: 1.5px solid rgba(0, 0, 0, 0.45);
          box-shadow: 
            inset 0 1px 3px rgba(255, 255, 255, 0.35), 
            inset 0 -4px 8px rgba(0, 0, 0, 0.45), 
            inset -3px -6px 10px rgba(0, 0, 0, 0.35), 
            0 14px 34px -4px rgba(0, 0, 0, 0.55),
            0 0 1px rgba(255, 255, 255, 0.2),
            0 0 15px rgba(6, 182, 212, 0.12),
            0 0 20px rgba(244, 63, 94, 0.08);
          border-radius: 28px;
        }
        .glass-bubble-bot {
          background: linear-gradient(135deg, rgba(168, 85, 247, 0.15) 0%, rgba(147, 51, 234, 0.03) 100%);
          backdrop-filter: blur(22px) saturate(140%);
          -webkit-backdrop-filter: blur(22px) saturate(140%);
          border-top: 1.5px solid rgba(168, 85, 247, 0.48);
          border-left: 1.5px solid rgba(6, 182, 212, 0.38);
          border-bottom: 1.5px solid rgba(0, 0, 0, 0.45);
          border-right: 1.5px solid rgba(0, 0, 0, 0.45);
          box-shadow: 
            inset 0 1px 3px rgba(255, 255, 255, 0.25), 
            inset 0 -4px 8px rgba(0, 0, 0, 0.45), 
            inset -3px -6px 10px rgba(168, 85, 247, 0.2), 
            0 14px 34px -4px rgba(0, 0, 0, 0.52),
            0 0 1px rgba(255, 255, 255, 0.15),
            0 0 18px rgba(168, 85, 247, 0.15),
            0 0 20px rgba(6, 182, 212, 0.09);
          border-radius: 28px;
        }
      `}</style>

      {/* Floating neon background element nodes */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] right-[-15%] w-[650px] h-[650px] neon-orb-pink rounded-full filter blur-[80px]" />
        <div className="absolute bottom-[-15%] left-[-15%] w-[750px] h-[750px] neon-orb-purple rounded-full filter blur-[90px]" />
        <div className="absolute top-[25%] left-[20%] w-[550px] h-[550px] neon-orb-blue rounded-full filter blur-[70px]" />
        <div className="absolute bottom-[30%] right-[10%] w-[500px] h-[500px] neon-orb-orange rounded-full filter blur-[80px]" />
        
        {/* Glowing floating particle filaments like the magical bokeh dots in the original eye profile */}
        {[
          { t: 10, l: 20, d: '0s', c: 'text-pink-400', s: '4px' },
          { t: 15, l: 75, d: '1.5s', c: 'text-cyan-400', s: '6px' },
          { t: 40, l: 12, d: '3s', c: 'text-purple-400', s: '3px' },
          { t: 55, l: 85, d: '0.8s', c: 'text-amber-400', s: '5px' },
          { t: 70, l: 25, d: '4s', c: 'text-rose-400', s: '6px' },
          { t: 80, l: 65, d: '2.2s', c: 'text-blue-400', s: '3px' },
          { t: 25, l: 45, d: '5s', c: 'text-purple-300', s: '5px' },
          { t: 50, l: 60, d: '1.2s', c: 'text-orange-400', s: '7px' },
          { t: 85, l: 30, d: '3.5s', c: 'text-cyan-300', s: '4px' },
          { t: 30, l: 88, d: '2.8s', c: 'text-pink-300', s: '5px' },
          { t: 65, l: 8, d: '4.8s', c: 'text-amber-300', s: '4px' },
          { t: 92, l: 78, d: '0.3s', c: 'text-rose-300', s: '6px' }
        ].map((p, idx) => (
          <div
            key={idx}
            className={`absolute rounded-full bg-current ${p.c}`}
            style={{
              top: `${p.t}%`,
              left: `${p.l}%`,
              width: p.s,
              height: p.s,
              animation: `driftUp 7s infinite ease-in-out`,
              animationDelay: p.d,
              boxShadow: '0 0 10px currentColor'
            }}
          />
        ))}

        {/* Subtle grid of stars */}
        <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.015)_1px,transparent_1px)] [background-size:24px_24px] opacity-60" />
      </div>

      {/* Floating conversational settings bypass toast notification */}
      <AnimatePresence>
        {settingsToast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className="absolute top-6 left-1/2 -translate-x-1/2 z-[100] px-5 py-3 rounded-full border border-purple-500/30 bg-purple-950/80 backdrop-blur-md shadow-[0_0_25px_rgba(168,85,247,0.35)] flex items-center gap-3"
          >
            <Sparkles className="w-4 h-4 text-purple-400 animate-pulse" />
            <span className="text-sm font-bold tracking-widest text-zinc-100 uppercase">{settingsToast}</span>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Live Interface Overlay with deep focus blur zoom-in glide */}
      <AnimatePresence>
        {isLiveMode && (
          <motion.div
            initial={{ opacity: 0, scale: 1.04 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.28, ease: [0.25, 1, 0.5, 1] }}
            className="absolute inset-0 z-50 overflow-hidden"
          >
            <LiveInterface 
              onClose={() => setIsLiveMode(false)} 
              systemInstruction={SYSTEM_PROMPT} 
              voiceName={voiceSettings.voiceName} 
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sidebar (Desktop) */}
      <div className="hidden md:flex flex-col w-64 glassmorphism-sidebar z-20">
        <div className="p-6 border-b border-zinc-800/40">
          <JaggedLogo className="text-2xl" />
          <p className="text-xs text-zinc-500 mt-2 tracking-wider">SECURE PERIMETER AI</p>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <button 
            onClick={archiveCurrentSession}
            className="w-full flex items-center gap-3 px-4 py-3 bg-purple-900/20 text-purple-200 rounded-lg hover:bg-purple-900/30 transition-colors border border-purple-500/20"
          >
            <PlusCircle size={18} />
            <span className="text-sm font-semibold tracking-wide uppercase">New Channel</span>
          </button>

          <div className="space-y-1">
            <p className="text-xs text-zinc-600 font-bold px-2 py-2 uppercase tracking-widest">Saved Logs</p>
            {sessions.map(session => (
              <button
                key={session.id}
                onClick={() => loadSession(session)}
                className="w-full flex items-center gap-3 px-3 py-2 text-zinc-400 hover:text-white hover:bg-white/5 rounded-md transition-all text-left group"
              >
                <MessageSquare size={14} className="group-hover:text-purple-400" />
                <span className="text-sm truncate">{session.title}</span>
              </button>
            ))}
            {sessions.length === 0 && (
              <p className="text-xs text-zinc-600 italic px-3 py-2">No archived security channels</p>
            )}
          </div>
        </div>

        {/* Unified Security Brand Status Footer */}
        <div className="p-5 border-t border-zinc-800/40 bg-black/10 flex flex-col gap-1.5">
          <div className="flex items-center gap-2 text-zinc-500 text-[10px] tracking-widest">
            <Shield className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
            <span>ROOT COMPANION PORT // ACTIVE</span>
          </div>
          <div className="text-[9px] text-zinc-600 font-mono tracking-wider ml-5">
            SECURE BUFFER FEED // SM-F936B
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col relative z-10 glassmorphism-bg">
        
        {/* Header bar */}
        <div className="flex items-center justify-between p-4 glassmorphism-header">
          {/* Mobile hamburger menu */}
          <div className="md:hidden flex items-center gap-2">
            <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="text-zinc-400 hover:text-white transition-colors">
              <Menu className="w-6 h-6" />
            </button>
            <JaggedLogo className="text-lg" />
          </div>

          <div className="hidden md:flex items-center gap-2 text-zinc-500 text-xs">
            <Radio className="w-3 h-3 text-purple-500 animate-pulse" />
            <span>Secure Stream Terminal: <strong>SM-F936B-Z-Fold</strong></span>
          </div>

          {/* Compact Settings Button with rotating tactile inertia */}
          <div className="flex items-center gap-2 pr-1">
            <motion.button
              whileHover={{ scale: 1.1, rotate: 45 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 text-zinc-400 hover:text-white transition-all flex items-center justify-center"
              title="Perimeter memory, Connected systems settings"
            >
              <Settings className="w-5 h-5" />
            </motion.button>
          </div>
        </div>

        {/* Mobile Sidebar overlay with smooth left spring slide-in */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div
              initial={{ x: '-100%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '-100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 220 }}
              className="absolute inset-0 bg-zinc-950/95 backdrop-blur-xl z-40 flex flex-col p-6 md:hidden"
            >
              <div className="flex justify-between items-center mb-6 border-b border-zinc-800/40 pb-4">
                <span className="font-orbitron font-bold text-lg text-purple-400">JAGGED DIALOG</span>
                <button className="text-zinc-400 hover:text-white transition-colors" onClick={() => setIsMobileMenuOpen(false)}><X className="w-6 h-6" /></button>
              </div>
              
              <button 
                onClick={() => {
                  archiveCurrentSession();
                  setIsMobileMenuOpen(false);
                }}
                className="flex items-center gap-3 px-4 py-4 bg-purple-900/20 text-purple-200 rounded-lg mb-6 border border-purple-500/20"
              >
                <PlusCircle size={20} />
                <span className="font-bold">NEW DIALOG INSTANCE</span>
              </button>

              <div className="flex-1 overflow-y-auto space-y-4">
                <h3 className="text-zinc-500 text-sm uppercase tracking-widest pl-1 font-semibold">Active Channels</h3>
                {sessions.map(session => (
                  <button
                    key={session.id}
                    onClick={() => {
                      loadSession(session);
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-3 py-3 text-zinc-400 border-b border-zinc-900/40 text-left"
                  >
                    <MessageSquare size={16} />
                    <span className="truncate">{session.title}</span>
                  </button>
                ))}
                {sessions.length === 0 && (
                  <p className="text-zinc-600 text-xs italic pl-1">No saved channels</p>
                )}
              </div>

              <div className="mt-auto pt-6 border-t border-zinc-900 flex flex-col gap-1 text-[10px] tracking-widest text-zinc-600">
                <div className="flex items-center gap-1.5 ">
                  <Shield className="w-3.5 h-3.5 text-emerald-500" />
                  <span>ROOT COMPANION PORT // ACTIVE</span>
                </div>
                <span className="ml-5">SM-F936B SECURE STREAM TERMINAL</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Chat Stream with Interactive 3D Glass Bubbly Cards */}
        <div className="flex-1 overflow-y-auto p-3.5 md:p-6 space-y-4">
          {messages.map((msg) => (
            <motion.div 
              key={msg.id}
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div 
                className={`max-w-[92%] md:max-w-[80%] p-4 md:py-4.5 md:px-5 relative group/msg transition-all duration-300 ${
                  msg.role === 'user' 
                    ? 'glass-bubble-user rounded-[24px] rounded-tr-[4px]' 
                    : 'glass-bubble-bot rounded-[24px] rounded-tl-[4px]'
                }`}
              >
                {msg.role === 'model' && (
                  <div className="flex items-center justify-between mb-3 border-b border-purple-500/10 pb-2">
                    <div className="flex items-center gap-2 text-purple-400 text-xs font-bold tracking-widest uppercase">
                      <Sparkles className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
                      <span>JAGGED GEM ADVOCATE</span>
                    </div>

                    {/* Integrated Speaker button in the template */}
                    <button
                      onClick={() => handleToggleSpeakMessage(msg.id, msg.text)}
                      className={`p-1.5 px-3 rounded-full border text-[11px] transition-all flex items-center gap-1.5 ${
                        currentlySpeakingId === msg.id 
                          ? 'bg-purple-600 border-purple-400 text-white animate-pulse shadow-[0_0_12px_rgba(168,85,247,0.5)]' 
                          : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-purple-300 hover:border-purple-800'
                      }`}
                      title={currentlySpeakingId === msg.id ? "Silence speech audio" : "Speak response aloud"}
                    >
                      {currentlySpeakingId === msg.id ? (
                        <>
                          <VolumeX className="w-3.5 h-3.5" />
                          <span className="font-bold tracking-wider animate-bounce text-[9px]">SPEAKING</span>
                        </>
                      ) : (
                        <>
                          <Volume2 className="w-3.5 h-3.5" />
                          <span className="tracking-wider uppercase font-bold text-[9px]">Speak</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
                
                {msg.role === 'user' && (
                  <div className="flex items-center justify-between mb-2 opacity-60">
                    <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">You (Jaidyn)</span>
                    <button
                      onClick={() => handleToggleSpeakMessage(msg.id, msg.text)}
                      className="opacity-0 group-hover/msg:opacity-100 p-1 text-zinc-500 hover:text-white transition-opacity"
                      title="Speak query"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                <p className="text-base md:text-[17px] leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                
                {/* Visual Audio wave equalizer display inside the model bubble when speaking */}
                {currentlySpeakingId === msg.id && (
                  <div className="flex items-center gap-1 mt-4 p-2 bg-purple-900/20 border border-purple-500/20 rounded-lg">
                    {isLoadingSpeech ? (
                      <span className="text-xs text-purple-300 animate-pulse font-bold tracking-wider flex items-center gap-2">
                        <Activity className="w-3.5 h-3.5 animate-spin" />
                        SYNTHESIZING ACOUSTICS...
                      </span>
                    ) : (
                      <div className="flex items-center gap-2 w-full justify-between">
                        <span className="text-[11px] text-zinc-400 font-bold tracking-widest uppercase">Engine: {voiceSettings.engine === 'browser' ? 'Synapse Local' : 'Edge Neuro-AI'}</span>
                        <div className="flex items-center gap-0.5 h-4 pr-1">
                          {[...Array(6)].map((_, i) => (
                            <motion.div
                              key={i}
                              animate={{ height: [4, 16, 4] }}
                              transition={{ duration: 0.5 + i*0.1, repeat: Infinity }}
                              className="w-[2.5px] bg-purple-400 rounded-full"
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="text-[10px] text-gray-500 mt-2 text-right opacity-60 font-mono">
                  {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </motion.div>
          ))}
          
          {isLoading && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex justify-start"
            >
              <div className="bg-purple-950/15 border border-purple-500/20 p-5 rounded-[22px] rounded-tl-none max-w-[85%] flex items-center gap-3 shadow-[0_0_15px_rgba(168,85,247,0.06)] backdrop-blur-md">
                <div className="flex gap-1.5">
                  <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-pink-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <span className="text-xs text-purple-300 font-bold uppercase tracking-widest font-orbitron animate-pulse">Analyzing neural streams...</span>
              </div>
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Area + Native Speech recognizer trigger block with glass styling */}
        <div className="p-4 md:p-6 bg-transparent border-t border-zinc-800/20 z-10">
          <div className="max-w-4xl mx-auto flex items-center gap-3">
            
            {/* Dictation (Speech to Text) toggle button */}
            <button
              onClick={toggleSpeechInput}
              className={`p-4 rounded-full border transition-all flex items-center justify-center relative ${
                isListeningInput 
                  ? 'bg-red-600/20 border-red-500/80 text-red-200 shadow-[0_0_15px_rgba(239,68,68,0.4)] animate-pulse' 
                  : 'bg-white/5 border-white/10 text-zinc-400 hover:text-white hover:bg-white/10 hover:border-white/20'
              }`}
              title={isListeningInput ? "Stop Listening dictation" : "Speak to type / Dictate"}
            >
              {isListeningInput ? (
                <>
                  <MicOff className="w-5 h-5" />
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-ping" />
                </>
              ) : (
                <Mic className="w-5 h-5 hover:scale-110 transition-transform" />
              )}
            </button>

            <div className="relative flex-1">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isListeningInput ? "Dictation ongoing... talk now" : "Secure perimeter line active..."}
                disabled={isLoading}
                className={`w-full bg-white/5 border rounded-full py-4 pl-6 pr-14 text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-purple-500/50 focus:border-purple-400/50 hover:border-white/20 transition-all shadow-[0_4px_30px_rgba(0,0,0,0.15)] backdrop-blur-md ${
                  isListeningInput ? 'border-red-500/40 ring-1 ring-red-500/20 bg-black/40' : 'border-white/10'
                }`}
              />
              <button 
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-purple-600 border border-purple-500/30 text-white rounded-full hover:bg-purple-500 hover:shadow-[0_0_12px_rgba(168,85,247,0.5)] disabled:opacity-25 disabled:hover:bg-purple-600 disabled:hover:shadow-none transition-all flex items-center justify-center"
              >
                {isLoading ? <Activity className="animate-spin w-5 h-5" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
            
            {/* Direct Immersion Live Mode Button with high quality reactive tap mechanics */}
            <motion.button
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              onClick={() => setIsLiveMode(true)}
              className="p-4 bg-purple-950/20 border border-purple-500/20 hover:border-purple-400/50 rounded-full text-purple-400 hover:text-white hover:shadow-[0_0_20px_rgba(168,85,247,0.25)] transition-all flex items-center justify-center group/livebtn shadow-[0_4px_24px_rgba(0,0,0,0.3)] backdrop-blur-md"
              title="Open full immersive vocal stream"
            >
              <Activity className="w-5 h-5 group-hover/livebtn:scale-110 transition-transform text-purple-400" />
            </motion.button>
          </div>

          <div className="text-center mt-3 flex items-center justify-center gap-2 text-[10px] text-zinc-600 tracking-widest uppercase">
            <span>PERCEPTIVE COMPANION RECOLLECTIONS ACTIVE // MEMORY BUFFERS: {memories.length}</span>
          </div>
        </div>

        {/* Dynamic Connected Apps, Memory, Speech Configurations Settings Modal (Slide Drawer) */}
        <AnimatePresence>
          {isSettingsOpen && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35 }}
              className="absolute inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-md"
            >
              {/* Tap backdrop to close */}
              <div className="flex-1" onClick={() => setIsSettingsOpen(false)} />
              
              <motion.div 
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="w-full max-w-lg bg-zinc-950 border-l border-zinc-800 h-full flex flex-col shadow-2xl relative"
              >
                {/* Drawer Header */}
                <div className="p-6 border-b border-zinc-800 bg-zinc-950 flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold tracking-wider font-orbitron text-purple-200">SYSTEM COREGISTRATION</h2>
                    <p className="text-xs text-zinc-500 uppercase tracking-widest mt-1">Configuring Jagged AI Parameters</p>
                  </div>
                  <button 
                    onClick={() => setIsSettingsOpen(false)}
                    className="p-2 bg-zinc-900 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Sub-Tabs Selector */}
                <div className="flex border-b border-zinc-900 px-4 bg-zinc-950">
                  <button
                    onClick={() => setSettingsActiveTab('memory')}
                    className={`flex-1 py-4 text-xs font-bold uppercase tracking-widest border-b-2 text-center transition-all ${
                      settingsActiveTab === 'memory' 
                        ? 'border-purple-500 text-purple-400' 
                        : 'border-transparent text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    1. Memories Engine
                  </button>
                  <button
                    onClick={() => setSettingsActiveTab('voice')}
                    className={`flex-1 py-4 text-xs font-bold uppercase tracking-widest border-b-2 text-center transition-all ${
                      settingsActiveTab === 'voice' 
                        ? 'border-purple-500 text-purple-400' 
                        : 'border-transparent text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    2. Acoustic Synthesizer
                  </button>
                  <button
                    onClick={() => setSettingsActiveTab('apps')}
                    className={`flex-1 py-4 text-xs font-bold uppercase tracking-widest border-b-2 text-center transition-all ${
                      settingsActiveTab === 'apps' 
                        ? 'border-purple-500 text-purple-400' 
                        : 'border-transparent text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    3. Connected Tools
                  </button>
                </div>

                {/* Drawer Main Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">

                  {/* TAB 1: MEMORIES MANAGEMENT */}
                  {settingsActiveTab === 'memory' && (
                    <div className="space-y-6">
                      <div className="bg-purple-950/15 border border-purple-500/20 p-4 rounded-xl">
                        <h3 className="font-bold text-sm text-purple-300 uppercase tracking-wider mb-2 flex items-center gap-2">
                          <Check className="w-4 h-4 text-purple-400" />
                          INTELLIGENT PERSISTENT MEMORY
                        </h3>
                        <p className="text-xs text-zinc-400 leading-relaxed">
                          Jagged maintains a core personal recollection of important parameters. Facts saved here are prepended dynamically to Jagged&apos;s mindset, overriding template behavior to make Jagged remember you, Alisha, or Flossy uniquely.
                        </p>
                      </div>

                      {/* Memory List */}
                      <div className="space-y-3">
                        <h4 className="text-xs uppercase tracking-widest text-zinc-500 font-bold">Registered Memory Cells ({memories.length})</h4>
                        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                          {memories.map(m => (
                            <div key={m.id} className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg flex items-start gap-3 justify-between">
                              <div className="space-y-1">
                                <p className="text-sm text-zinc-200">{m.content}</p>
                                <div className="flex gap-2">
                                  <span className={`text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded ${
                                    m.category === 'perimeter' ? 'bg-purple-900/30 text-purple-300 text-purple-300' :
                                    m.category === 'personal' ? 'bg-zinc-800 text-zinc-300' : 'bg-red-950 text-red-400 border border-red-900/40'
                                  }`}>
                                    {m.category}
                                  </span>
                                  <span className="text-[9px] text-zinc-600 font-mono">Synced: {m.createdAt.toLocaleDateString()}</span>
                                </div>
                              </div>
                              <button 
                                onClick={() => handleDeleteMemory(m.id)}
                                className="text-zinc-550 hover:text-red-400 p-1 rounded hover:bg-zinc-800 transition-colors"
                                title="Wipe recollection cell"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                          {memories.length === 0 && (
                            <p className="text-zinc-600 text-sm italic py-4 text-center border border-dashed border-zinc-850 rounded-lg">Memories cleared. Jagged is running on blank-slate protocols.</p>
                          )}
                        </div>
                      </div>

                      {/* Add new memory inputs */}
                      <div className="border-t border-zinc-900 pt-4 space-y-3">
                        <h4 className="text-xs uppercase tracking-widest text-zinc-400 font-bold">Inscribe New Recollection</h4>
                        
                        <div className="space-y-2">
                          <label className="text-[11px] text-zinc-500 uppercase tracking-widest font-bold">Memory category</label>
                          <div className="flex gap-2">
                            {(['perimeter', 'personal', 'important'] as const).map((cat) => (
                              <button
                                key={cat}
                                type="button"
                                onClick={() => setNewMemoryCategory(cat)}
                                className={`flex-1 py-2 text-[10px] uppercase font-bold tracking-widest border rounded transition-all ${
                                  newMemoryCategory === cat 
                                    ? 'bg-purple-900/20 border-purple-500 text-purple-300' 
                                    : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300'
                                }`}
                              >
                                {cat}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] text-zinc-500 uppercase tracking-widest font-bold">Recollection content</label>
                          <textarea
                            value={newMemoryText}
                            onChange={(e) => setNewMemoryText(e.target.value)}
                            placeholder="Type facts for Jagged to remember (e.g. 'Flossy prefers low acoustic pitches', 'My standard superuser token is locked')"
                            rows={3}
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-sm focus:outline-none focus:border-purple-500 placeholder-zinc-600 text-white leading-relaxed resize-none"
                          />
                        </div>

                        <button
                          onClick={handleAddMemory}
                          disabled={!newMemoryText.trim()}
                          className="w-full py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-500 font-bold text-xs uppercase tracking-widest transition-colors flex items-center justify-center gap-2"
                        >
                          <Plus className="w-4 h-4" />
                          <span>Inscribe Memory</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* TAB 2: VOICE ACOUSTIC CONTROLS */}
                  {settingsActiveTab === 'voice' && (
                    <div className="space-y-6">
                      <div className="bg-zinc-900 border border-zinc-850 p-4 rounded-xl space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-bold text-sm tracking-wide text-zinc-300 uppercase">Automatic Read-Aloud</h3>
                            <p className="text-xs text-zinc-500 mt-0.5">Vocalize every incoming response immediately</p>
                          </div>
                          <button
                            onClick={() => setVoiceSettings(prev => ({ ...prev, autoSpeak: !prev.autoSpeak }))}
                            className={`p-1.5 rounded-lg border transition-all ${
                              voiceSettings.autoSpeak 
                                ? 'bg-purple-900/40 border-purple-500 text-purple-300' 
                                : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                            }`}
                          >
                            {voiceSettings.autoSpeak ? 'ENABLED' : 'DISABLED'}
                          </button>
                        </div>
                      </div>

                      {/* Engine Picker */}
                      <div className="space-y-3">
                        <h4 className="text-xs uppercase tracking-widest text-zinc-500 font-bold">Vocalization Engine</h4>
                        <div className="flex gap-3">
                          <button
                            onClick={() => setVoiceSettings(prev => ({ ...prev, engine: 'browser', voiceName: '' }))}
                            className={`flex-1 p-4 border rounded-xl text-left space-y-1 transition-all ${
                              voiceSettings.engine === 'browser' 
                                ? 'bg-purple-950/20 border-purple-500 shadow-md' 
                                : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700/80'
                            }`}
                          >
                            <span className="text-xs font-bold uppercase tracking-wider block text-white">Browser Synthesizer</span>
                            <span className="text-[10px] text-zinc-500 block leading-tight">Instant start, utilizes fluent Android or local Chrome speech services. No API latency.</span>
                          </button>

                          <button
                            onClick={() => setVoiceSettings(prev => ({ ...prev, engine: 'gemini', voiceName: 'Fenrir' }))}
                            className={`flex-1 p-4 border rounded-xl text-left space-y-1 transition-all ${
                              voiceSettings.engine === 'gemini' 
                                ? 'bg-purple-950/20 border-purple-500 shadow-md' 
                                : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700/80'
                            }`}
                          >
                            <span className="text-xs font-bold uppercase tracking-wider block text-white">Gemini Neuromorphic TTS</span>
                            <span className="text-[10px] text-zinc-500 block leading-tight">Premium lifelike AI voice synthesis models running on Google cloud servers.</span>
                          </button>
                        </div>
                      </div>

                      {/* Voice Model Selectors */}
                      {voiceSettings.engine === 'browser' ? (
                        <div className="space-y-2">
                          <label className="text-xs uppercase tracking-widest text-zinc-400 font-bold flex justify-between">
                            <span>Selected Voice (Browser-level)</span>
                            <span className="text-zinc-650 font-mono">Found: {availableWebVoices.length}</span>
                          </label>
                          <select
                            value={voiceSettings.voiceName}
                            onChange={(e) => setVoiceSettings(prev => ({ ...prev, voiceName: e.target.value }))}
                            className="w-full bg-zinc-900 border border-zinc-800 text-zinc-300 text-sm p-3 rounded-lg focus:outline-none focus:border-purple-500"
                          >
                            {availableWebVoices.map((voice, idx) => (
                              <option key={`${voice.name}-${voice.lang}-${idx}`} value={voice.name}>
                                {voice.name} ({voice.lang})
                              </option>
                            ))}
                            {availableWebVoices.length === 0 && (
                              <option value="">Default English System Voice</option>
                            )}
                          </select>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <label className="text-xs uppercase tracking-widest text-zinc-400 font-bold block">
                            Gemini Premium Voice Model
                          </label>
                          <select
                            value={voiceSettings.voiceName || 'Fenrir'}
                            onChange={(e) => setVoiceSettings(prev => ({ ...prev, voiceName: e.target.value }))}
                            className="w-full bg-zinc-900 border border-zinc-800 text-zinc-300 text-sm p-3 rounded-lg focus:outline-none focus:border-purple-500"
                          >
                            <option value="Fenrir">Fenrir (Fierce Protective Voice - Default)</option>
                            <option value="Zephyr">Zephyr (Bright Warm Companion Voice)</option>
                            <option value="Kore">Kore (Expressive Grounded Voice)</option>
                            <option value="Puck">Puck (Cheerful Engaging Voice)</option>
                            <option value="Charon">Charon (Deep Analytical Voice)</option>
                            <option value="Aoede">Aoede (Expressive Lyric Voice)</option>
                          </select>
                        </div>
                      )}

                      {/* General Pitch & Rate controls affecting BOTH browser and Gemini engines */}
                      <div className="bg-zinc-900/60 p-4 border border-zinc-850 rounded-xl space-y-4">
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-xs uppercase tracking-widest text-zinc-400 font-bold">Acoustic Pitch</span>
                            <span className="text-xs text-purple-400 font-mono font-bold">{(voiceSettings.pitch || 1.0).toFixed(1)}x</span>
                          </div>
                          <input
                            type="range"
                            min="0.5"
                            max="1.5"
                            step="0.05"
                            value={voiceSettings.pitch || 1.0}
                            onChange={(e) => setVoiceSettings(prev => ({ ...prev, pitch: parseFloat(e.target.value) }))}
                            className="w-full accent-purple-500 bg-zinc-800 h-1.5 rounded-lg appearance-none cursor-pointer"
                          />
                          <p className="text-[10px] text-zinc-500 leading-normal">
                            Shifts frequencies on the fly. Lower pitches create a deeper, grounded security aura.
                          </p>
                        </div>

                        <div className="space-y-2 border-t border-zinc-850 pt-3">
                          <div className="flex justify-between items-center">
                            <span className="text-xs uppercase tracking-widest text-zinc-400 font-bold">Vocalization Pace (Speed)</span>
                            <span className="text-xs text-purple-400 font-mono font-bold">{(voiceSettings.rate || 1.0).toFixed(1)}x</span>
                          </div>
                          <input
                            type="range"
                            min="0.5"
                            max="1.5"
                            step="0.05"
                            value={voiceSettings.rate || 1.0}
                            onChange={(e) => setVoiceSettings(prev => ({ ...prev, rate: parseFloat(e.target.value) }))}
                            className="w-full accent-purple-500 bg-zinc-800 h-1.5 rounded-lg appearance-none cursor-pointer"
                          />
                          <p className="text-[10px] text-zinc-500 leading-normal">
                            Regulates read-out timing. Raise for hyper-dense intelligence delivery, or lower for slow reassurance.
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => handleToggleSpeakMessage('test-audio', "This is highly fluent secure audio feed transcription. System link OK.")}
                        className="w-full py-3 bg-zinc-900 border border-zinc-850 hover:bg-zinc-800 text-purple-300 rounded-lg text-xs uppercase tracking-widest font-bold transition-all flex items-center justify-center gap-2"
                      >
                        <Volume2 className="w-4 h-4 text-purple-400" />
                        <span>Test Acoustics Stream</span>
                      </button>
                    </div>
                  )}

                  {/* TAB 3: CONNECTED SYSTEMS LOGS */}
                  {settingsActiveTab === 'apps' && (
                    <div className="space-y-6">
                      <div className="bg-emerald-950/10 border border-emerald-500/20 p-4 rounded-xl">
                        <h3 className="font-bold text-sm text-emerald-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                          <Terminal className="w-4 h-4" />
                          INTEGRATED SECURE PROTOCOLS
                        </h3>
                        <p className="text-xs text-zinc-400 leading-relaxed">
                          Monitor on-device integrations with other components, AI engines, or proxies. Click elements to simulate connections or diagnostic rotatings.
                        </p>
                      </div>

                      {/* Connection lists */}
                      <div className="space-y-3">
                        <h4 className="text-xs uppercase tracking-widest text-zinc-500 font-bold">Core Sockets</h4>
                        <div className="space-y-2">
                          {connectedApps.map(app => (
                            <div key={app.id} className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg flex items-center justify-between">
                              <div className="space-y-1 max-w-[70%]">
                                <div className="flex items-center gap-2">
                                  {app.category === 'anonymity' && <Server className="w-3.5 h-3.5 text-indigo-400" />}
                                  {app.category === 'intelligence' && <Cpu className="w-3.5 h-3.5 text-purple-400" />}
                                  {app.category === 'forensic' && <Link className="w-3.5 h-3.5 text-amber-500" />}
                                  {app.category === 'tool' && <Radio className="w-3.5 h-3.5 text-blue-400" />}
                                  <h5 className="font-bold text-sm text-zinc-200">{app.name}</h5>
                                </div>
                                <p className="text-xs text-zinc-550 leading-tight">{app.description}</p>
                              </div>

                              <button
                                onClick={() => handleDisconnectApp(app.id)}
                                className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-widest border transition-all ${
                                  app.status === 'connected'
                                    ? 'bg-emerald-900/10 border-emerald-500/50 text-emerald-300'
                                    : 'bg-red-950/10 border-red-500/50 text-red-300'
                                }`}
                              >
                                {app.status === 'connected' ? 'Connected' : 'Offline'}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Connect generic technology tool integration */}
                      <div className="border-t border-zinc-900 pt-4 space-y-3">
                        <h4 className="text-xs uppercase tracking-widest text-zinc-400 font-bold">Register External Socket Probe</h4>
                        
                        <div className="space-y-2">
                          <label className="text-[11px] text-zinc-500 uppercase tracking-widest font-bold">Socket category</label>
                          <div className="flex gap-2">
                            {(['forensic', 'intelligence', 'anonymity', 'tool'] as const).map((cat) => (
                              <button
                                key={cat}
                                type="button"
                                onClick={() => setNewAppCategory(cat)}
                                className={`flex-1 py-1.5 text-[9px] uppercase font-bold tracking-widest border rounded transition-all ${
                                  newAppCategory === cat 
                                    ? 'border-purple-500 text-purple-300 bg-purple-900/10' 
                                    : 'border-zinc-800 text-zinc-500 hover:text-zinc-300'
                                }`}
                              >
                                {cat}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <input
                            type="text"
                            value={newAppName}
                            onChange={(e) => setNewAppName(e.target.value)}
                            placeholder="Socket Endpoint Name (e.g. 'Tor Socks5 9050 Proxy')"
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500 placeholder-zinc-600 text-white"
                          />
                          <input
                            type="text"
                            value={newAppDesc}
                            onChange={(e) => setNewAppDesc(e.target.value)}
                            placeholder="Functional Description (e.g. 'Anonymizes socket packages outbound.')"
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500 placeholder-zinc-600 text-white"
                          />
                        </div>

                        <button
                          onClick={handleConnectApp}
                          disabled={!newAppName.trim() || !newAppDesc.trim()}
                          className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs uppercase tracking-widest font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
                        >
                          <Link className="w-3.5 h-3.5" />
                          <span>Link External Device Socket</span>
                        </button>
                      </div>
                    </div>
                  )}

                </div>

                {/* Footer status credits */}
                <div className="p-4 bg-zinc-950 border-t border-zinc-900 flex items-center justify-between text-[11px] text-zinc-500 text-zinc-500 font-mono">
                  <span>SYSTEM CORRELATION PROTOCOLS: 236-B</span>
                  <span className="flex items-center gap-1.5 font-bold">
                    <span className="w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
                    SECURE NODE
                  </span>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default ChatInterface;
