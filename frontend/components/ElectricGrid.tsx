'use client';

import { useRef, useEffect } from 'react';

/* ─── Brand colors ──────────────────────────────────── */
const COLORS = ['#00FFD1', '#00C2FF', '#A78BFA'];
const BG = '#030711';

/* ─── Types ──────────────────────────────────────────── */
interface Pulse {
  x: number;
  y: number;
  dx: number;
  dy: number;
  color: string;
  speed: number;
  life: number;
  maxLife: number;
  tailLen: number;
}

interface GridNode {
  x: number;
  y: number;
  flash: number;
}

interface ElectricGridProps {
  /** 0-1, controls brightness and pulse density. Default 1 (full). Use ~0.3 for subtle background. */
  intensity?: number;
  className?: string;
}

/* ─── Helpers ───────────────────────────────────────── */
function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

export default function ElectricGrid({ intensity = 1, className = '' }: ElectricGridProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ── Responsive config scaled by intensity ── */
    const isMobile = window.innerWidth < 768;
    const SPACING = isMobile ? 120 : 80;
    const MAX_PULSES = Math.round((isMobile ? 10 : 22) * intensity);
    const SPAWN_INTERVAL = Math.round((isMobile ? 800 : 450) / intensity);
    const NODE_CHANCE = 0.15 * intensity;
    const GRID_ALPHA = 0.035 * intensity;
    const NODE_ALPHA = 0.12 * intensity;
    const DPR = Math.min(window.devicePixelRatio || 1, isMobile ? 1 : 2);

    /* ── Sizing ───────────────────────────────── */
    let w = 0, h = 0;
    let cols = 0, rows = 0;
    let nodes: GridNode[] = [];
    let offscreen: OffscreenCanvas | null = null;

    function resize() {
      const rect = canvas!.parentElement!.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas!.width = w * DPR;
      canvas!.height = h * DPR;
      canvas!.style.width = `${w}px`;
      canvas!.style.height = `${h}px`;
      ctx!.setTransform(DPR, 0, 0, DPR, 0, 0);

      cols = Math.ceil(w / SPACING) + 1;
      rows = Math.ceil(h / SPACING) + 1;

      nodes = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (Math.random() < NODE_CHANCE) {
            nodes.push({ x: c * SPACING, y: r * SPACING, flash: 0 });
          }
        }
      }

      offscreen = new OffscreenCanvas(w * DPR, h * DPR);
      const octx = offscreen.getContext('2d')!;
      octx.setTransform(DPR, 0, 0, DPR, 0, 0);

      octx.strokeStyle = `rgba(0,255,209,${GRID_ALPHA})`;
      octx.lineWidth = 0.5;
      octx.beginPath();
      for (let c = 0; c < cols; c++) {
        const x = c * SPACING;
        octx.moveTo(x, 0);
        octx.lineTo(x, h);
      }
      for (let r = 0; r < rows; r++) {
        const y = r * SPACING;
        octx.moveTo(0, y);
        octx.lineTo(w, y);
      }
      octx.stroke();

      for (const node of nodes) {
        octx.beginPath();
        octx.arc(node.x, node.y, 1.5, 0, Math.PI * 2);
        octx.fillStyle = `rgba(0,255,209,${NODE_ALPHA})`;
        octx.fill();
      }
    }

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement!);

    /* ── Pulses ───────────────────────────────── */
    const pulses: Pulse[] = [];
    let lastSpawn = 0;

    function spawnPulse() {
      const horizontal = Math.random() > 0.5;
      const color = COLORS[Math.floor(Math.random() * COLORS.length)];
      const speed = 60 + Math.random() * 80;

      let x: number, y: number, dx: number, dy: number;

      if (horizontal) {
        const row = Math.floor(Math.random() * rows);
        y = row * SPACING;
        const goRight = Math.random() > 0.5;
        x = goRight ? -20 : w + 20;
        dx = goRight ? 1 : -1;
        dy = 0;
      } else {
        const col = Math.floor(Math.random() * cols);
        x = col * SPACING;
        const goDown = Math.random() > 0.5;
        y = goDown ? -20 : h + 20;
        dx = 0;
        dy = goDown ? 1 : -1;
      }

      const maxLife = Math.max(w, h) / speed + 1;
      pulses.push({ x, y, dx, dy, color, speed, life: 0, maxLife, tailLen: 40 + Math.random() * 20 });
    }

    /* ── Render loop ──────────────────────────── */
    let raf = 0;
    let prev = performance.now();
    const pulseAlpha = Math.min(intensity * 1.2, 1); // slightly boost pulse visibility

    function frame(now: number) {
      const dt = Math.min((now - prev) / 1000, 0.05);
      prev = now;

      ctx!.clearRect(0, 0, w, h);

      if (offscreen) {
        ctx!.drawImage(offscreen, 0, 0, w, h);
      }

      if (!prefersReduced && MAX_PULSES > 0) {
        if (now - lastSpawn > SPAWN_INTERVAL && pulses.length < MAX_PULSES) {
          spawnPulse();
          lastSpawn = now;
        }

        ctx!.save();
        ctx!.globalCompositeOperation = 'lighter';

        for (let i = pulses.length - 1; i >= 0; i--) {
          const p = pulses[i];
          p.life += dt;
          p.x += p.dx * p.speed * dt;
          p.y += p.dy * p.speed * dt;

          if (p.x < -60 || p.x > w + 60 || p.y < -60 || p.y > h + 60 || p.life > p.maxLife) {
            pulses.splice(i, 1);
            continue;
          }

          const { r, g, b } = hexToRgb(p.color);

          // Tail
          const tailX = p.x - p.dx * p.tailLen;
          const tailY = p.y - p.dy * p.tailLen;
          const grad = ctx!.createLinearGradient(tailX, tailY, p.x, p.y);
          grad.addColorStop(0, `rgba(${r},${g},${b},0)`);
          grad.addColorStop(1, `rgba(${r},${g},${b},${0.5 * pulseAlpha})`);

          ctx!.strokeStyle = grad;
          ctx!.lineWidth = 1.5;
          ctx!.beginPath();
          ctx!.moveTo(tailX, tailY);
          ctx!.lineTo(p.x, p.y);
          ctx!.stroke();

          // Head glow
          const headGrad = ctx!.createRadialGradient(p.x, p.y, 0, p.x, p.y, 8);
          headGrad.addColorStop(0, `rgba(${r},${g},${b},${0.8 * pulseAlpha})`);
          headGrad.addColorStop(0.4, `rgba(${r},${g},${b},${0.2 * pulseAlpha})`);
          headGrad.addColorStop(1, `rgba(${r},${g},${b},0)`);
          ctx!.fillStyle = headGrad;
          ctx!.beginPath();
          ctx!.arc(p.x, p.y, 8, 0, Math.PI * 2);
          ctx!.fill();

          // Intersection flash
          for (const node of nodes) {
            const dist = Math.abs(p.x - node.x) + Math.abs(p.y - node.y);
            if (dist < 6) {
              node.flash = 1;
            }
          }
        }

        // Flashing nodes
        for (const node of nodes) {
          if (node.flash > 0.01) {
            const glow = ctx!.createRadialGradient(node.x, node.y, 0, node.x, node.y, 12 * node.flash);
            glow.addColorStop(0, `rgba(0,255,209,${0.6 * node.flash * pulseAlpha})`);
            glow.addColorStop(1, 'rgba(0,255,209,0)');
            ctx!.fillStyle = glow;
            ctx!.beginPath();
            ctx!.arc(node.x, node.y, 12, 0, Math.PI * 2);
            ctx!.fill();
            node.flash *= 0.92;
          }
        }

        ctx!.restore();
      }

      // Vignette
      const vignette = ctx!.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.7);
      vignette.addColorStop(0, 'rgba(3,7,17,0)');
      vignette.addColorStop(1, BG);
      ctx!.fillStyle = vignette;
      ctx!.fillRect(0, 0, w, h);

      raf = requestAnimationFrame(frame);
    }

    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [intensity]);

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 pointer-events-none ${className}`}
      style={{ width: '100%', height: '100%' }}
    />
  );
}
