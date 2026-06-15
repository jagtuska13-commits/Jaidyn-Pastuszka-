import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Cpu, Eye } from 'lucide-react';

interface IntroAnimationProps {
  onComplete: () => void;
}

export default function IntroAnimation({ onComplete }: IntroAnimationProps) {
  const [stage, setStage] = useState(0); // 0: Init, 1: Live, 2: Fadeout to dashboard
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  
  useEffect(() => {
    const timeline = async () => {
      // Phase 0 -> 1: Intro stage triggered
      await new Promise(r => setTimeout(r, 200));
      setStage(1);

      // Lengthen animation to 3.8 seconds so user can experience the breathtaking neural eye fluctuations
      await new Promise(r => setTimeout(r, 3400));
      setStage(2);

      // Trigger completion transition
      await new Promise(r => setTimeout(r, 500));
      onComplete();
    };

    timeline();
  }, [onComplete]);

  // Animated Eye Iris Simulation Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = 450;
    let height = 450;

    // High DPI Support for crisp organic lines
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      width = canvas.parentElement?.clientWidth ? Math.min(canvas.parentElement.clientWidth, 480) : 450;
      height = width;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.scale(dpr, dpr);
    };

    resize();
    window.addEventListener('resize', resize);

    // Initialize 45 organic particles orbiting around the eye corona
    const particles: Array<{
      angle: number;
      radius: number;
      speed: number;
      size: number;
      color: string;
      alpha: number;
      alphaSpeed: number;
    }> = [];

    for (let i = 0; i < 45; i++) {
      particles.push({
        angle: Math.random() * Math.PI * 2,
        radius: 70 + Math.random() * 80,
        speed: 0.008 + Math.random() * 0.012,
        size: 1 + Math.random() * 2.8,
        color: Math.random() > 0.5 ? 'rgba(6, 182, 212, 0.8)' : Math.random() > 0.3 ? 'rgba(16, 185, 129, 0.8)' : 'rgba(251, 146, 60, 0.8)',
        alpha: 0.1 + Math.random() * 0.8,
        alphaSpeed: 0.015 + Math.random() * 0.02
      });
    }

    let time = 0;

    const render = () => {
      ctx.clearRect(0, 0, width, height);
      time += 0.012;

      const cx = width / 2;
      const cy = height / 2;

      // Base sizes with life-like rhythmic pulse / breath cycle
      const breath = Math.sin(time * 1.5) * 0.04; 
      const pupilRadius = 45 * (1 + breath * 0.6);
      const irisRadius = 115 * (1 + breath);

      // --- 1. AMBIENT GLOW CHANNELS (Underlays) ---
      const outerGlow = ctx.createRadialGradient(cx, cy, pupilRadius * 0.9, cx, cy, irisRadius * 1.4);
      outerGlow.addColorStop(0, 'rgba(168, 85, 247, 0.18)');
      outerGlow.addColorStop(0.3, 'rgba(6, 182, 212, 0.12)');
      outerGlow.addColorStop(0.7, 'rgba(244, 63, 94, 0.06)');
      outerGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = outerGlow;
      ctx.beginPath();
      ctx.arc(cx, cy, irisRadius * 1.5, 0, Math.PI * 2);
      ctx.fill();

      // --- 2. THE IRIS FIBRES / FILAMENTS (480 densely packed radial streams) ---
      const fiberCount = 480;
      for (let i = 0; i < fiberCount; i++) {
        const offsetAngle = (i / fiberCount) * Math.PI * 2;
        // Natural rotation drift combining continuous movement and sine waves
        const angle = offsetAngle + time * 0.08 + Math.sin(time * 0.4 + offsetAngle * 3) * 0.015;

        const sinA = Math.sin(angle);
        const cosA = Math.cos(angle);

        // Intricate start and end nodes of our fiber
        // Noise is added to make the border look organic, fibrous, fuzzy and beautiful like the original video
        const startNoise = Math.sin(i * 12 + time * 4.5) * 3.5;
        const endNoise = Math.cos(i * 9 - time * 3) * 12 * (1 + Math.sin(offsetAngle * 4) * 0.3);

        const rStart = pupilRadius + Math.max(-5, startNoise);
        const rEnd = irisRadius + endNoise;

        const xStart = cx + cosA * rStart;
        const yStart = cy + sinA * rStart;

        const xEnd = cx + cosA * rEnd;
        const yEnd = cy + sinA * rEnd;

        // Creating wavy bezier curvature pointing outward
        const curveness = 12 * Math.sin(time * 0.5 + i * 0.1);
        const cpX = cx + cosA * (rStart + (rEnd - rStart) * 0.45) - sinA * curveness;
        const cpY = cy + sinA * (rStart + (rEnd - rStart) * 0.45) + cosA * curveness;

        ctx.beginPath();
        ctx.moveTo(xStart, yStart);
        ctx.quadraticCurveTo(cpX, cpY, xEnd, yEnd);

        // Elegant Dynamic multi-color iris mapping (sunset orange, cyan, gold, emerald)
        let strokeColor = '';
        const pct = i / fiberCount;
        if (pct < 0.25) {
          strokeColor = `rgba(16, 185, 129, ${0.4 + Math.sin(time * 2 + i) * 0.2})`; // Emerald Green
        } else if (pct < 0.5) {
          strokeColor = `rgba(6, 182, 212, ${0.45 + Math.cos(time * 1.8 - i) * 0.2})`; // Cyan Blue
        } else if (pct < 0.75) {
          strokeColor = `rgba(251, 146, 60, ${0.38 + Math.sin(time * 2.2 + i) * 0.18})`; // Amber / Fire Orange
        } else {
          strokeColor = `rgba(168, 85, 247, ${0.42 + Math.cos(time * 1.5 + i) * 0.22})`; // Amethyst Violet
        }

        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 0.8 + (Math.sin(i + time) > 0.5 ? 0.6 : 0);
        ctx.stroke();

        // Beautiful concentric tiny golden crown inner highlights for 3D depth
        if (i % 6 === 0) {
          ctx.beginPath();
          ctx.arc(cx + cosA * (rStart + 12), cy + sinA * (rStart + 12), 1, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(234, 179, 8, ${0.3 + Math.sin(time * 3 + i) * 0.3})`;
          ctx.fill();
        }
      }

      // --- 3. CORONA SPARK PARTICLES (Sparkling magical dust around eye) ---
      particles.forEach((p) => {
        p.angle += p.speed;
        p.alpha += p.alphaSpeed;
        if (p.alpha > 0.95 || p.alpha < 0.05) {
          p.alphaSpeed = -p.alphaSpeed;
        }

        // Slight breathing scale on particle radius
        const currentRadius = p.radius * (1 + breath * 0.4);

        const px = cx + Math.cos(p.angle) * currentRadius;
        const py = cy + Math.sin(p.angle) * currentRadius;

        ctx.beginPath();
        ctx.arc(px, py, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.shadowBlur = 4;
        ctx.shadowColor = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.fill();
        ctx.shadowBlur = 0; // reset
        ctx.globalAlpha = 1.0; // reset
      });

      // --- 4. THE PULSATING PUPIL CORE (Center deep velvet void) ---
      ctx.beginPath();
      ctx.arc(cx, cy, pupilRadius, 0, Math.PI * 2);
      ctx.fillStyle = '#08080c'; // Near pure black slate depth
      ctx.fill();

      // Pupil luxury 3D outer metallic reflection border rim
      ctx.beginPath();
      ctx.arc(cx, cy, pupilRadius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Pupil dynamic cyber-reflection glints (adds immense realism and 3D glass look)
      const glintX = cx - pupilRadius * 0.35 + Math.sin(time * 0.5) * 1.5;
      const glintY = cy - pupilRadius * 0.35 + Math.cos(time * 0.4) * 1.5;
      const pupilReflection = ctx.createRadialGradient(glintX, glintY, 1, glintX, glintY, pupilRadius * 0.7);
      pupilReflection.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
      pupilReflection.addColorStop(0.2, 'rgba(255, 255, 255, 0.15)');
      pupilReflection.addColorStop(0.6, 'rgba(6, 182, 212, 0.03)');
      pupilReflection.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = pupilReflection;
      ctx.beginPath();
      ctx.arc(cx, cy, pupilRadius * 0.9, 0, Math.PI * 2);
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
    <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col items-center justify-center overflow-hidden px-4 select-none">
      
      {/* Abstract Cyber Starfield Deep Space Backdrop */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(147,51,234,0.06),transparent_80%)] pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.02)_1.5px,transparent_1.5px)] [background-size:28px_28px] opacity-70" />

      <AnimatePresence mode="wait">
        {stage < 2 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05, transition: { duration: 0.45, ease: "easeInOut" } }}
            className="relative w-full max-w-lg flex flex-col items-center justify-center"
          >
            {/* Embedded Luxury AI Eye Canvas Container */}
            <div className="relative w-full flex flex-col items-center justify-center">
              
              {/* Backlight halo behind the eye */}
              <div 
                className="absolute w-[360px] h-[360px] rounded-full filter blur-[120px] pointer-events-none opacity-40 mix-blend-screen bg-gradient-to-r from-emerald-500 via-cyan-500 to-purple-600 animate-pulse"
                style={{ animationDuration: '4s' }}
              />

              <div className="relative z-10 w-[420px] h-[360px] flex items-center justify-center">
                <canvas 
                  ref={canvasRef} 
                  className="mx-auto select-none pointer-events-none"
                />
              </div>

              {/* Secure Scanning HUD Overlays */}
              <motion.div 
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.6 }}
                className="mt-6 flex flex-col items-center gap-2 text-center"
              >
                <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/5 border border-white/10 shadow-[0_4px_24px_rgba(0,0,0,0.3)] backdrop-blur-md">
                  <Cpu className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
                  <span className="font-orbitron text-[10px] font-black tracking-[0.25em] text-zinc-300 uppercase pl-1">
                    Jagged intelligence
                  </span>
                </div>
                
                <p className="text-[10px] text-zinc-500 tracking-widest font-mono uppercase mt-1">
                  Neural stream connection established
                </p>
              </motion.div>

            </div>

          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

