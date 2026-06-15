import { GoogleGenAI, Modality } from "@google/genai";
import { Message, MemoryItem } from "../types";

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

let ai: GoogleGenAI | null = null;

export const initializeGemini = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.error("API_KEY not found in environment variables.");
    return;
  }
  ai = new GoogleGenAI({ apiKey });
};

export const sendMessageToJagged = async (
  history: Message[],
  newMessage: string,
  memories?: MemoryItem[]
): Promise<string> => {
  if (!ai) initializeGemini();
  if (!ai) throw new Error("AI not initialized");

  try {
    let memoryPrompt = "";
    if (memories && memories.length > 0) {
      memoryPrompt = `\n\nCORE MEMORIES (Things you know and always remember about the user, Flossy, Alisha, or other perimeter coordinates):\n` +
        memories.map((m, idx) => `- [Category: ${m.category}] ${m.content}`).join("\n") +
        `\nIntegrate these memories into your personality and responses naturally; never forget them.`;
    }

    const systemInstructionWithMemories = SYSTEM_PROMPT + memoryPrompt;

    const chat = ai.chats.create({
        model: 'gemini-3.5-flash',
        config: {
            systemInstruction: systemInstructionWithMemories,
        },
        history: history.filter(h => h.role !== 'system').map(h => ({
            role: h.role,
            parts: [{ text: h.text }]
        }))
    });

    const result = await chat.sendMessage({ message: newMessage });
    return result.text || "...";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "I'm having trouble connecting to the perimeter network. Let's try that again in a moment.";
  }
};

export const generateJaggedSpeech = async (
  text: string,
  voiceName: string = 'Aoede'
): Promise<string> => {
  if (!ai) initializeGemini();
  if (!ai) throw new Error("AI not initialized");

  try {
    const cleanText = text.replace(/[*#`_\-]/g, '').slice(0, 1800); // Strip markdown, restrict size for speed
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-tts-preview",
      contents: [{ parts: [{ text: cleanText }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voiceName },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      throw new Error("No audio content returned");
    }
    return base64Audio;
  } catch (error) {
    console.error("Gemini TTS Error:", error);
    throw error;
  }
};
