import React, { useEffect, useRef, useState } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { motion } from 'framer-motion';
import { Mic, MicOff, X, Activity, Shield, Volume2 } from 'lucide-react';

interface LiveInterfaceProps {
  onClose: () => void;
  systemInstruction: string;
  voiceName?: string;
}

const LiveInterface: React.FC<LiveInterfaceProps> = ({ onClose, systemInstruction, voiceName = 'Aoede' }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isMicOn, setIsMicOn] = useState(true);
  const [currentVoice, setCurrentVoice] = useState(voiceName);
  const [error, setError] = useState<string | null>(null);
  const [volumeLevel, setVolumeLevel] = useState(0); // For visualization

  // Keep a persistent ref of the microphone toggle state to prevent closure trapping
  const isMicOnRef = useRef(isMicOn);
  useEffect(() => {
    isMicOnRef.current = isMicOn;
  }, [isMicOn]);

  // Eye and volume refs for zero-latency HTML5 canvas processing
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);
  const userVolumeRef = useRef<number>(0);
  const modelVolumeRef = useRef<number>(0);

  // Refs for audio handling to avoid re-renders
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sessionRef = useRef<any>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Linear resampling helper to safely map any browser hardware input rate down to standard 16kHz
  const resample = (data: Float32Array, fromRate: number, toRate: number): Float32Array => {
    if (fromRate === toRate) return data;
    const ratio = fromRate / toRate;
    const newLength = Math.round(data.length / ratio);
    const result = new Float32Array(newLength);
    for (let i = 0; i < newLength; i++) {
      const position = i * ratio;
      const index = Math.floor(position);
      const fraction = position - index;
      if (index + 1 < data.length) {
        result[i] = data[index] * (1 - fraction) + data[index + 1] * fraction;
      } else {
        result[i] = data[index];
      }
    }
    return result;
  };

  useEffect(() => {
    let isMounted = true;

    const startSession = async () => {
      try {
        const apiKey = process.env.API_KEY;
        if (!apiKey) throw new Error("API Key not found");

        const ai = new GoogleGenAI({ apiKey });

        // Input Audio Context (using native hardware rate so browser registers properly, downsampling happens on the fly)
        const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        inputContextRef.current = inputCtx;

        // Output Audio Context (24kHz for Gemini response)
        const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        audioContextRef.current = outputCtx;

        // Establish output analyser to track deep voice waves ( Fenrir voice )
        const analyser = outputCtx.createAnalyser();
        analyser.fftSize = 64;
        outputAnalyserRef.current = analyser;
        analyser.connect(outputCtx.destination);

        // Get Microphone Stream
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;

        // Connect to Gemini Live
        const sessionPromise = ai.live.connect({
          model: 'gemini-3.1-flash-live-preview',
          config: {
            responseModalities: [Modality.AUDIO],
            systemInstruction: systemInstruction,
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: currentVoice } },
            },
          },
          callbacks: {
            onopen: () => {
              if (!isMounted) return;
              setIsConnected(true);
              console.log("JAGGED LIVE: Connected");

              // Setup Input Processing
              const source = inputCtx.createMediaStreamSource(stream);
              sourceRef.current = source;
              
              // ScriptProcessor for raw PCM access (bufferSize, inputChannels, outputChannels)
              const processor = inputCtx.createScriptProcessor(4096, 1, 1);
              processorRef.current = processor;

              processor.onaudioprocess = (e) => {
                if (!isMicOnRef.current) return; // Mute logic
                
                const rawData = e.inputBuffer.getChannelData(0);
                
                // Perform dynamic downsampling from browser rate to 16000Hz (Vite wrapper friendly)
                const inputData = resample(rawData, inputCtx.sampleRate, 16000);
                
                // Simple volume meter logic from input raw data
                let sum = 0;
                for(let i=0; i<rawData.length; i++) sum += rawData[i] * rawData[i];
                const rms = Math.sqrt(sum / rawData.length);
                const computedVol = rms * 5;
                setVolumeLevel(v => Math.max(0.1, computedVol)); // Scaling for visual
                userVolumeRef.current = computedVol; // Store raw value to render in canvas
                
                // Create PCM Blob and Send
                const pcmBlob = createPcmBlob(inputData);
                sessionPromise.then((session) => {
                  session.sendRealtimeInput({ audio: pcmBlob });
                });
              };

              source.connect(processor);
              processor.connect(inputCtx.destination);
            },
            onmessage: async (msg: LiveServerMessage) => {
              if (!isMounted) return;

              // Handle Audio Output
              const base64Audio = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
              if (base64Audio && audioContextRef.current) {
                const ctx = audioContextRef.current;
                if (ctx.state === 'closed') return;
                
                try {
                  // Decode
                  const audioData = decodeBase64(base64Audio);
                  const audioBuffer = await decodeAudioData(audioData, ctx, 24000, 1);
                  
                  if (!isMounted || ctx.state === 'closed') return;

                  // Schedule Playback
                  nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
                  
                  const source = ctx.createBufferSource();
                  source.buffer = audioBuffer;
                  
                  // Route model voice signals into our premium ocular analyzer
                  if (outputAnalyserRef.current) {
                    source.connect(outputAnalyserRef.current);
                  } else {
                    source.connect(ctx.destination);
                  }
                  source.start(nextStartTimeRef.current);
                  
                  nextStartTimeRef.current += audioBuffer.duration;
                } catch (decodeErr) {
                  // Suppress decoding glitches or aborts when unmounting/shutting down contexts
                  if (isMounted && ctx.state !== 'closed') {
                    console.warn("Live audio chunk decode warning (ignored):", decodeErr);
                  }
                }
              }

              // Handle Interruption
              if (msg.serverContent?.interrupted) {
                nextStartTimeRef.current = 0;
              }
            },
            onclose: () => {
              console.log("JAGGED LIVE: Closed");
              if(isMounted) setIsConnected(false);
            },
            onerror: (err) => {
              if (!isMounted) return; // Suppress post-unmount connection termination noises
              const errMsg = err?.message || String(err);
              if (errMsg.includes("aborted") || errMsg.includes("abort") || errMsg.includes("closed")) {
                console.log("Live stream channel closed normally.");
                return;
              }
              console.error("JAGGED LIVE Error:", err);
              setError("Connection Perimeter Breached.");
            }
          }
        });

        sessionRef.current = sessionPromise;

      } catch (err) {
        if (isMounted) {
          console.error(err);
          setError("Audio System Failure. Check Permissions.");
        }
      }
    };

    startSession();

    return () => {
      isMounted = false;
      
      // 1. Teardown active live streaming session immediately to avoid hanging connection
      if (sessionRef.current) {
        sessionRef.current.then((session: any) => {
          try {
            session.close();
          } catch (_) {}
        });
      }

      // 2. Shut off active tracks
      if (streamRef.current) {
        try {
          streamRef.current.getTracks().forEach(t => t.stop());
        } catch (_) {}
      }

      // 3. Disconnect audio context nodes safely to prevent garbage collection leaks
      try {
        if (processorRef.current) processorRef.current.disconnect();
      } catch (_) {}
      try {
        if (sourceRef.current) sourceRef.current.disconnect();
      } catch (_) {}

      // 4. Terminate contexts
      try {
        if (inputContextRef.current) inputContextRef.current.close();
      } catch (_) {}
      try {
        if (audioContextRef.current) audioContextRef.current.close();
      } catch (_) {}
    };
  }, [systemInstruction, currentVoice]); // Depend on systemInstruction or currentVoice to restart if either changes

  // -- Helpers --

  // Convert Float32Array to 16-bit PCM Blob
  const createPcmBlob = (data: Float32Array) => {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
      int16[i] = data[i] * 32768;
    }
    const uint8 = new Uint8Array(int16.buffer);
    
    // Manual binary string construction for btoa (avoiding text encoder for binary)
    let binary = '';
    const len = uint8.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(uint8[i]);
    }
    const base64 = btoa(binary);

    return {
      data: base64,
      mimeType: 'audio/pcm;rate=16000',
    };
  };

  const decodeBase64 = (base64: string) => {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  };

  const decodeAudioData = async (
    data: Uint8Array,
    ctx: AudioContext,
    sampleRate: number,
    numChannels: number,
  ): Promise<AudioBuffer> => {
    // Correctly align bytes and avoid offset alignment errors
    const bufferLength = Math.floor(data.byteLength / 2);
    const dataInt16 = new Int16Array(data.buffer, data.byteOffset, bufferLength);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = buffer.getChannelData(channel);
      for (let i = 0; i < frameCount; i++) {
        channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
      }
    }
    return buffer;
  };

  // Live Interactive Eye loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = 310;
    let height = 310;

    const resize = () => {
      const parent = canvas.parentElement;
      const rect = parent ? parent.getBoundingClientRect() : null;
      width = rect ? Math.min(rect.width, 340) : 310;
      height = width;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener('resize', resize);

    // Setup 50 sparkling magical space particles
    const particles: Array<{
      angle: number;
      radius: number;
      speed: number;
      size: number;
      color: string;
      alpha: number;
      alphaSpeed: number;
    }> = [];

    for (let i = 0; i < 50; i++) {
      particles.push({
        angle: Math.random() * Math.PI * 2,
        radius: 60 + Math.random() * 85,
        speed: 0.003 + Math.random() * 0.008,
        size: 0.8 + Math.random() * 2.0,
        color: Math.random() > 0.6 ? 'rgba(52, 211, 153, 0.75)' : Math.random() > 0.3 ? 'rgba(6, 182, 212, 0.75)' : 'rgba(245, 158, 11, 0.75)', // Mint green, Turquoise, gold stars
        alpha: 0.2 + Math.random() * 0.7,
        alphaSpeed: 0.008 + Math.random() * 0.015
      });
    }

    let time = 0;

    // Gaze / Saccadic eye tracking to make the eye look incredibly alive
    let targetGazeX = 0;
    let targetGazeY = 0;
    let currentGazeX = 0;
    let currentGazeY = 0;
    let gazeTimer = 0;
    let smoothedVoiceAmp = 0;

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // Realtime model amplitude checking
      let currentModelVol = 0;
      if (outputAnalyserRef.current) {
        const dataArray = new Uint8Array(outputAnalyserRef.current.frequencyBinCount);
        outputAnalyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        currentModelVol = (sum / dataArray.length) / 255;
        // Boost factor slightly to make visual response high-impact but bounded
        modelVolumeRef.current = currentModelVol * 4.5;
      }

      // Combine voice parameters to scale pupil size & speed up fluctuations
      const rawVoiceAmp = Math.min(1.0, Math.max(userVolumeRef.current || 0, modelVolumeRef.current || 0));
      
      // Extremely smooth exponential filter to damp jumps and spikes
      smoothedVoiceAmp += (rawVoiceAmp - smoothedVoiceAmp) * 0.12;

      time += 0.012 + smoothedVoiceAmp * 0.04; // Sped up frame based on smoothed voice excitement

      // micro-saccadic look-around logic
      gazeTimer--;
      if (gazeTimer <= 0) {
        if (smoothedVoiceAmp > 0.15) {
          // Rapid excited tiny jitters when speaking (very subtle and localized)
          targetGazeX = (Math.random() - 0.5) * 8;
          targetGazeY = (Math.random() - 0.5) * 8;
          gazeTimer = 15 + Math.random() * 20;
        } else {
          // Slow organic looks when idle
          if (Math.random() < 0.35) {
            targetGazeX = (Math.random() - 0.5) * 16;
            targetGazeY = (Math.random() - 0.5) * 16;
            gazeTimer = 80 + Math.random() * 100;
          } else {
            targetGazeX = 0;
            targetGazeY = 0;
            gazeTimer = 120 + Math.random() * 160;
          }
        }
      }

      // Smooth gaze interpolation
      const lerpSpeed = smoothedVoiceAmp > 0.15 ? 0.14 : 0.05;
      currentGazeX += (targetGazeX - currentGazeX) * lerpSpeed;
      currentGazeY += (targetGazeY - currentGazeY) * lerpSpeed;

      const cx = width / 2;
      const cy = height / 2;

      // Realtime respiratory pupil breathing cycle
      const breath = Math.sin(time * 1.5) * 0.04;
      // Pupil expands excitedly with sound, or slowly breathes
      const pupilRadius = (width * 0.105) * (1 + breath + smoothedVoiceAmp * 0.38);
      const irisRadius = (width * 0.26) * (1 + breath * 0.5 + smoothedVoiceAmp * 0.15);

      // --- 1. DEEP OUTER SHADOW HALOS ---
      const outerGlow = ctx.createRadialGradient(
        cx + currentGazeX * 0.4, cy + currentGazeY * 0.4, pupilRadius * 0.9,
        cx + currentGazeX * 0.2, cy + currentGazeY * 0.2, irisRadius * 1.5
      );
      outerGlow.addColorStop(0, 'rgba(16, 185, 129, 0.22)'); // Emerald core glow
      outerGlow.addColorStop(0.3, 'rgba(6, 182, 212, 0.12)'); // Cyan rim glow
      outerGlow.addColorStop(0.7, 'rgba(245, 158, 11, 0.05)'); // Warm gold outer fringe
      outerGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      
      ctx.fillStyle = outerGlow;
      ctx.beginPath();
      ctx.arc(cx, cy, irisRadius * 1.6, 0, Math.PI * 2);
      ctx.fill();

      // --- 2. IRIS RADIAL FIBERS (380 filaments) ---
      const fiberCount = 380;
      for (let i = 0; i < fiberCount; i++) {
        const offsetAngle = (i / fiberCount) * Math.PI * 2;
        // Fibres drift around the gaze center organically
        const angle = offsetAngle + time * 0.03 + Math.sin(time * 0.2 + offsetAngle * 2) * 0.01;

        const sinA = Math.sin(angle);
        const cosA = Math.cos(angle);

        // Intricate fibrous boundaries with micro noise fluctuations
        const startNoise = Math.sin(i * 6 + time * 3) * 2.5;
        const endNoise = Math.cos(i * 5 - time * 2) * 6 * (1 + Math.sin(offsetAngle * 3) * 0.15);

        // Apply saccadic shift to start and end point parameters
        const rStart = pupilRadius + Math.max(-3, startNoise);
        const rEnd = irisRadius + endNoise;

        const xStart = cx + currentGazeX + cosA * rStart;
        const yStart = cy + currentGazeY + sinA * rStart;

        const xEnd = cx + currentGazeX * 0.8 + cosA * rEnd;
        const yEnd = cy + currentGazeY * 0.8 + sinA * rEnd;

        const rmid = rStart + (rEnd - rStart) * 0.5;
        const curveness = 5 * Math.sin(time * 0.3 + i * 0.12) + smoothedVoiceAmp * 8 * Math.cos(time * 1.8 + i * 0.04);
        const cpX = cx + currentGazeX * 0.9 + cosA * rmid - sinA * curveness;
        const cpY = cy + currentGazeY * 0.9 + sinA * rmid + cosA * curveness;

        ctx.beginPath();
        ctx.moveTo(xStart, yStart);
        ctx.quadraticCurveTo(cpX, cpY, xEnd, yEnd);

        // Continuous polar-phase color blending that never sections or cuts abruptly
        const hueShift = angle + time * 0.15;
        
        // Setup gorgeous integrated palette: Forest teals, Cosmic mint greens, with golden embers rotating
        const stripe = Math.cos(angle * 5 - time * 0.25); // Rotating gold-amber highlights
        const isStripe = stripe > 0.45;
        
        let rVal = 20;
        let gVal = 175;
        let bVal = 150;
        
        if (isStripe) {
          // Warm golden amber fiber overlay
          rVal = Math.floor(215 + 35 * Math.sin(time + i));
          gVal = Math.floor(145 + 30 * Math.cos(time - i));
          bVal = Math.floor(35 + 20 * Math.sin(time * 1.2));
        } else {
          // Cosmic emerald / green-cyan polar phase
          rVal = Math.floor(15 + 20 * Math.sin(hueShift));
          gVal = Math.floor(175 + 40 * Math.cos(hueShift));
          bVal = Math.floor(150 + 45 * Math.sin(hueShift * 2));
        }
        
        // Voice reaction sparkles the fibers continuously
        const voiceFlash = smoothedVoiceAmp * 40;
        rVal = Math.max(0, Math.min(255, rVal + voiceFlash * 0.4));
        gVal = Math.max(0, Math.min(255, gVal + voiceFlash * 1.0));
        bVal = Math.max(0, Math.min(255, bVal + voiceFlash * 0.8));

        const opacity = 0.40 + (smoothedVoiceAmp * 0.35) + Math.sin(time * 2.2 + i) * 0.14;
        ctx.strokeStyle = `rgba(${rVal}, ${gVal}, ${bVal}, ${opacity})`;
        ctx.lineWidth = 0.65 + (smoothedVoiceAmp > 0.2 ? 0.35 : 0);
        ctx.stroke();

        // 3D Inner gold crystal beads
        if (i % 10 === 0) {
          ctx.beginPath();
          ctx.arc(cx + currentGazeX + cosA * (rStart + 8), cy + currentGazeY + sinA * (rStart + 8), 0.8, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(245, 158, 11, ${0.25 + smoothedVoiceAmp * 0.35})`; // Soft Gold
          ctx.fill();
        }
      }

      // --- 3. FLOATING BOKEH CORONA PARTICLES ---
      particles.forEach((p) => {
        p.angle += p.speed * (1 + smoothedVoiceAmp * 1.1);
        p.alpha += p.alphaSpeed;
        if (p.alpha > 0.85 || p.alpha < 0.12) p.alphaSpeed = -p.alphaSpeed;

        const dist = p.radius * (1 + breath * 0.25 + smoothedVoiceAmp * 0.2);
        const px = cx + currentGazeX * 0.7 + Math.cos(p.angle) * dist;
        const py = cy + currentGazeY * 0.7 + Math.sin(p.angle) * dist;

        ctx.beginPath();
        ctx.arc(px, py, p.size * (1 + smoothedVoiceAmp * 0.35), 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.shadowBlur = 3 + smoothedVoiceAmp * 5;
        ctx.shadowColor = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1.0;
      });

      // --- 4. THE DEEP PULSATING INTELLECT PUPIL CORE ---
      ctx.beginPath();
      ctx.arc(cx + currentGazeX, cy + currentGazeY, pupilRadius, 0, Math.PI * 2);
      ctx.fillStyle = '#040406'; // Velvet absolute night void
      ctx.fill();

      // Pupil Metallic Cyan-Blue Glass Rim
      ctx.beginPath();
      ctx.arc(cx + currentGazeX, cy + currentGazeY, pupilRadius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(16, 185, 129, ${0.2 + smoothedVoiceAmp * 0.4})`; // Pulsing emerald rim
      ctx.lineWidth = 1.6;
      ctx.stroke();

      // Specular glare glints (gaze-slid for 3D curved crystal perspective)
      const glintX = cx + currentGazeX * 1.25 - pupilRadius * 0.32 + Math.sin(time) * 0.8;
      const glintY = cy + currentGazeY * 1.25 - pupilRadius * 0.32 + Math.cos(time * 0.8) * 0.8;
      
      const pupilReflection = ctx.createRadialGradient(glintX, glintY, 1, glintX, glintY, pupilRadius * 0.65);
      pupilReflection.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
      pupilReflection.addColorStop(0.2, 'rgba(255, 255, 255, 0.18)');
      pupilReflection.addColorStop(0.6, 'rgba(16, 185, 129, 0.04)');
      pupilReflection.addColorStop(1, 'rgba(0, 0, 0, 0)');
      
      ctx.fillStyle = pupilReflection;
      ctx.beginPath();
      ctx.arc(cx + currentGazeX, cy + currentGazeY, pupilRadius * 0.9, 0, Math.PI * 2);
      ctx.fill();

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <div className="absolute inset-0 z-50 bg-black/95 backdrop-blur-xl flex flex-col items-center justify-center overflow-hidden">
      
      {/* Background Ambience with glass look */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[850px] h-[850px] bg-emerald-950/15 rounded-full blur-3xl animate-pulse" />
        <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-cyan-900/10 rounded-full blur-3xl" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[600px] h-[600px] bg-emerald-900/10 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 flex flex-col items-center w-full max-w-md px-6">
        
        {/* Header bar styled dynamically */}
        <div className="flex items-center space-x-2.5 mb-8 px-4 py-2 rounded-full bg-white/5 border border-white/10 shadow-[0_4px_24px_rgba(0,0,0,0.3)] backdrop-blur-md">
          <Activity className="w-4 h-4 text-emerald-400 animate-pulse" />
          <span className="font-orbitron tracking-[0.2em] text-[10px] uppercase font-black text-zinc-300">LIVE PERIMETER ACTIVE</span>
        </div>

        {/* Central Eye Visualizer */}
        <div className="relative mb-12 flex items-center justify-center">
          
          {/* External pulsating halo synchronized with mic energy */}
          <motion.div 
            animate={{ 
              scale: isConnected ? [1, 1.05, 1] : 1, 
              opacity: isConnected ? [0.4, 0.6, 0.4] : 0.2 
            }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            className="absolute rounded-full border border-emerald-500/15 w-[330px] h-[330px] sm:w-[370px] sm:h-[370px] pointer-events-none"
          />

          {/* Ocular visualizer canvas wrapper with dynamic max bounds to avoid layout overflow */}
          <div className="relative z-15 w-[310px] h-[310px] sm:w-[340px] sm:h-[340px] flex items-center justify-center overflow-hidden">
            <canvas 
              ref={canvasRef} 
              className="mx-auto select-none pointer-events-none"
            />
          </div>
        </div>

        {/* Status Text HUD */}
        <div className="h-10 mb-8 text-center">
          {error ? (
             <span className="text-red-400 font-orbitron font-bold text-xs tracking-widest">{error}</span>
          ) : !isConnected ? (
             <span className="text-zinc-500 animate-pulse font-orbitron text-xs tracking-[0.25em] uppercase">Securing Neural Stream...</span>
          ) : (
             <span className="text-cyan-300 font-orbitron text-xs tracking-[0.2em] flex items-center gap-2 px-4 py-2 rounded-full border border-cyan-500/20 bg-cyan-950/20 shadow-[0_0_15px_rgba(6,182,212,0.1)] uppercase">
               <Volume2 className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
               Jagged is listening
             </span>
          )}
        </div>

        {/* Controls block in beautiful 3D Glass card */}
        <div className="glass-bubble-bot w-full p-6 flex flex-col items-center gap-5">
          <div className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">
            Perimeter Control parameters
          </div>
          <div className="flex items-center gap-6 w-full justify-center">
             <motion.button 
               whileHover={{ scale: 1.08 }}
               whileTap={{ scale: 0.92 }}
               onClick={() => setIsMicOn(!isMicOn)}
               className={`p-4 rounded-full border transition-all duration-300 ${isMicOn ? 'bg-white/5 border-white/15 text-zinc-300 hover:text-white hover:bg-white/15 hover:border-white/20' : 'bg-red-950/30 border-red-500/40 text-red-400 hover:bg-red-900/40'}`}
               title={isMicOn ? "Mute Microphone" : "Unmute Microphone"}
             >
               {isMicOn ? <Mic className="w-5 h-5 animate-pulse" /> : <MicOff className="w-5 h-5" />}
             </motion.button>

             <motion.button 
               whileHover={{ scale: 1.05 }}
               whileTap={{ scale: 0.95 }}
               onClick={onClose}
               className="px-6 py-4 bg-purple-600 border border-purple-500/40 hover:bg-purple-500 text-white rounded-full font-bold tracking-wider hover:shadow-[0_0_15px_rgba(168,85,247,0.5)] transition-all duration-300 flex items-center gap-2 text-xs uppercase"
             >
               <X className="w-4 h-4" />
               End protocol
             </motion.button>
          </div>

          {/* Premium Gemini voice actor pills */}
          <div className="w-full flex flex-col gap-2 pt-3 border-t border-white/5">
            <span className="text-[9px] font-bold text-zinc-400 font-mono uppercase text-center tracking-widest">
              Live Voice Profile: <span className="text-cyan-400 font-black">{currentVoice}</span>
            </span>
            <div className="flex flex-wrap justify-center gap-1.5">
              {[
                { id: 'Aoede', label: 'Aoede', desc: 'Fluent/Lyric female' },
                { id: 'Puck', label: 'Puck', desc: 'Humorous/Dynamic male' },
                { id: 'Kore', label: 'Kore', desc: 'Warm/Expressive female' },
                { id: 'Zephyr', label: 'Zephyr', desc: 'Bright/Intelligent male' },
                { id: 'Fenrir', label: 'Fenrir', desc: 'Deep/Gravelly male' },
              ].map(v => (
                <button
                  key={v.id}
                  onClick={() => {
                    if (v.id !== currentVoice) {
                      setIsConnected(false);
                      setCurrentVoice(v.id);
                    }
                  }}
                  className={`px-2.5 py-1 rounded-full text-[9px] font-bold font-mono transition-all duration-200 border ${
                    currentVoice === v.id
                      ? 'bg-cyan-500/10 border-cyan-400 text-cyan-300 shadow-[0_0_8px_rgba(6,182,212,0.15)]'
                      : 'bg-white/5 border-white/10 text-zinc-400 hover:text-zinc-200 hover:bg-white/10'
                  }`}
                  title={`${v.label} (${v.desc})`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default LiveInterface;
