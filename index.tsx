import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Type, Chat, GenerateContentResponse } from "@google/genai";
import * as d3 from "d3";
import { 
  Activity, 
  ChevronRight,
  DatabaseZap,
  Network,
  List,
  Loader2,
  Globe2,
  ArrowRight,
  Share2,
  Sun,
  Moon,
  BarChart3,
  FlaskConical,
  LogOut,
  ShieldCheck,
  Send,
  MessageSquare,
  Atom,
  Search,
  Info,
  Layers,
  BookOpen,
  ExternalLink,
  FileText,
  Pill,
  Stethoscope,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  PanelLeft,
  PanelRight,
  Database,
  ChevronLeft,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Volume2,
  Microscope,
  AlertCircle,
  Maximize
} from 'lucide-react';

import { 
  Target, 
  DrugInfo, 
  DiseaseInfo, 
  EnrichmentResult, 
  PubMedStats, 
  Theme, 
  ViewMode, 
  TerrainLayer, 
  ResearchContext, 
  Message,
  ClinicalSample,
  ExpressionRow,
  SurvivalMetrics
} from './types';

import { 
  vertexShaderSource, 
  terrainFragmentShader, 
  contourFragmentShader, 
  peaksFragmentShader, 
  valleyFragmentShader 
} from './shaders';

import { api } from './api';

// --- Configuration ---
const HARDCODED_PASSWORD = "Sparc@2026";
const MAX_WebGL_POINTS = 1024;

// --- Force Directed Layout Utilities ---

/**
 * Computes Pearson correlation between two feature vectors.
 * Feature vectors are [G, E, T] scores.
 */
function pearson(a: number[], b: number[]) {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  
  let sumA = 0, sumB = 0, sumAA = 0, sumBB = 0, sumAB = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i], y = b[i];
    sumA += x; sumB += y;
    sumAA += x * x; sumBB += y * y; sumAB += x * y;
  }
  
  const num = n * sumAB - sumA * sumB;
  const den = Math.sqrt((n * sumAA - sumA * sumA) * (n * sumBB - sumB * sumB));
  
  if (!isFinite(den) || den === 0) return 0;
  return num / den;
}

/**
 * Extracts the feature vector v_g = [G, E, T] for a gene.
 * G: Genetic association score
 * E: Expression score (combined disease RNA + baseline)
 * T: Tractability score (drugability)
 */
function getGetVector(t: Target) {
  return [t.geneticScore ?? 0, t.combinedExpression ?? 0, t.targetScore ?? 0];
}

/**
 * Computes node positions using a force-directed simulation where 
 * forces are derived from Pearson correlation in GET score space.
 * Resulting positions are normalized to [0, 1] space.
 */
function computeForcePositions(targets: Target[], width = 800, height = 600) {
  // Nodes = Genes. Use deterministic initialization to prevent layout shifts.
  const nodes = targets.map((t, i) => ({ 
    id: t.id, 
    symbol: t.symbol, 
    r: 6 + (t.overallScore * 6),
    x: width / 2 + Math.cos(i) * 50,
    y: height / 2 + Math.sin(i) * 50
  }));
  
  const vectors = targets.map(getGetVector);
  const links: any[] = [];
  
  // Fully connected graph for forces: compute correlation for every unique pair.
  for (let i = 0; i < targets.length; i++) {
    for (let j = i + 1; j < targets.length; j++) {
      const r = pearson(vectors[i], vectors[j]);
      links.push({
        source: targets[i].id,
        target: targets[j].id,
        weight: Math.abs(r),
        sign: r
      });
    }
  }

  // Force simulation: Attraction proportional to |r|, distance proportional to (1-|r|)
  const sim = d3.forceSimulation(nodes as any)
    .force("link", d3.forceLink(links).id((d: any) => d.id)
      .strength((l: any) => 0.05 + 0.45 * (l.weight ?? 0))
      .distance((l: any) => 300 * (1 - (l.weight ?? 0)) + 40))
    .force("charge", d3.forceManyBody().strength(-150))
    .force("collide", d3.forceCollide((d: any) => d.r + 10))
    .force("center", d3.forceCenter(width / 2, height / 2));

  // Run synchronously to completion
  for (let i = 0; i < 300; i++) sim.tick();
  sim.stop();

  // Normalize positions to [0, 1] coordinate space
  const xs = nodes.map(n => n.x);
  const ys = nodes.map(n => n.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  
  const padding = 0.05; // 5% margin
  const rangeX = (maxX - minX) || 1;
  const rangeY = (maxY - minY) || 1;

  const posMap = new Map<string, { x: number, y: number, nx: number, ny: number }>();
  nodes.forEach((n: any) => {
    const nx = padding + (1 - 2 * padding) * (n.x - minX) / rangeX;
    const ny = padding + (1 - 2 * padding) * (n.y - minY) / rangeY;
    posMap.set(n.id, { 
      x: nx * width, 
      y: ny * height, 
      nx, 
      ny 
    });
  });
  
  return { positionsById: posMap, links };
}

const isPointInCircle = (px: number, py: number, cx: number, cy: number, r: number) => {
  return Math.sqrt((px - cx) ** 2 + (py - cy) ** 2) < r;
};

const getSigmaForZoom = (scale: number) => 35 / scale;

// --- Visualization Components ---

const CorrelationView = ({ targets, theme }: { targets: Target[], theme: Theme }) => {
  const correlations = useMemo(() => {
    const pairs: { a: Target, b: Target, r: number, absR: number }[] = [];
    const vectors = targets.map(getGetVector);
    
    for (let i = 0; i < targets.length; i++) {
      for (let j = i + 1; j < targets.length; j++) {
        const r = pearson(vectors[i], vectors[j]);
        pairs.push({
          a: targets[i],
          b: targets[j],
          r,
          absR: Math.abs(r)
        });
      }
    }
    return pairs.sort((a, b) => b.absR - a.absR);
  }, [targets]);

  return (
    <div className="h-full overflow-auto">
      <table className="w-full text-left">
        <thead className={`sticky top-0 z-10 text-[10px] font-bold uppercase tracking-widest border-b ${theme === 'dark' ? 'bg-[#171717] border-neutral-800 text-neutral-500' : 'bg-neutral-50 border-neutral-200 text-neutral-600'}`}>
          <tr>
            <th className="p-4 pl-8">Target A</th>
            <th className="p-4">Target B</th>
            <th className="p-4 text-center">Direction</th>
            <th className="p-4 text-center">R Value</th>
            <th className="p-4 pr-8 text-right">Abs. Correlation</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {correlations.map((p, idx) => (
            <tr key={`${p.a.id}-${p.b.id}`} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/20 transition-colors">
              <td className="p-4 pl-8 font-bold text-blue-600 dark:text-blue-500 text-[13px]">{p.a.symbol}</td>
              <td className="p-4 font-bold text-blue-600 dark:text-blue-500 text-[13px]">{p.b.symbol}</td>
              <td className="p-4 text-center">
                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${p.r >= 0 ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'}`}>
                  {p.r >= 0 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                  {p.r >= 0 ? 'Positive' : 'Negative'}
                </span>
              </td>
              <td className={`p-4 text-center font-mono text-[11px] ${theme === 'dark' ? 'text-neutral-500' : 'text-neutral-600'}`}>{p.r.toFixed(4)}</td>
              <td className="p-4 pr-8 text-right font-mono font-bold text-neutral-800 dark:text-neutral-300 text-[12px]">
                {p.absR.toFixed(4)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const KnowledgeGraph = ({ targets, selectedId, onSelect, theme }: { targets: Target[], selectedId?: string, onSelect: (t: Target | null) => void, theme: Theme }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });

  const { positionsById, links } = useMemo(() => computeForcePositions(targets, 800, 600), [targets]);

  // Canvas drawing logic with transform
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas || !containerRef.current) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = containerRef.current.getBoundingClientRect();
    canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.save();
    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.k, transform.k);

    // Adjust width/height relative to default sim size (800x600)
    const scaleX = rect.width / 800;
    const scaleY = rect.height / 600;
    const baseScale = Math.min(scaleX, scaleY);

    links.forEach(l => {
      if (l.weight < 0.3) return;
      const s = positionsById.get(typeof l.source === 'string' ? l.source : l.source.id);
      const t = positionsById.get(typeof l.target === 'string' ? l.target : l.target.id);
      if (s && t) {
        ctx.beginPath(); 
        ctx.moveTo(s.x * baseScale, s.y * baseScale); 
        ctx.lineTo(t.x * baseScale, t.y * baseScale);
        // Red = positive, Blue = negative
        const rgb = l.sign >= 0 ? '239, 68, 68' : '37, 99, 235';
        ctx.strokeStyle = `rgba(${rgb}, ${0.05 + l.weight * 0.15})`;
        ctx.lineWidth = (0.5 + l.weight * 2.5) / transform.k;
        ctx.stroke();
      }
    });

    targets.forEach(t => {
      const pos = positionsById.get(t.id);
      if (!pos) return;
      const isSel = t.symbol === selectedId;
      const r = 6 + (t.overallScore * 6);
      ctx.beginPath(); ctx.arc(pos.x * baseScale, pos.y * baseScale, isSel ? r + 3 : r, 0, Math.PI * 2);
      ctx.fillStyle = isSel ? '#2563eb' : (theme === 'dark' ? '#334155' : '#737373');
      ctx.fill();
      
      if (isSel || (t.overallScore > 0.6 && transform.k > 0.5)) {
        ctx.fillStyle = theme === 'dark' ? '#f1f5f9' : '#0f172a';
        ctx.font = `500 ${10 / transform.k}px Inter`; ctx.textAlign = 'center';
        ctx.fillText(t.symbol, pos.x * baseScale, pos.y * baseScale + r + (14 / transform.k));
      }
    });

    ctx.restore();
  }, [targets, selectedId, theme, positionsById, links, transform]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const scaleFactor = e.deltaY > 0 ? 0.9 : 1.1;
    setTransform(prev => ({
      ...prev,
      k: Math.max(0.1, Math.min(10, prev.k * scaleFactor))
    }));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const startX = e.clientX;
    const startY = e.clientY;
    const startTx = transform.x;
    const startTy = transform.y;

    const onMouseMove = (moveEvent: MouseEvent) => {
      setTransform(prev => ({
        ...prev,
        x: startTx + (moveEvent.clientX - startX),
        y: startTy + (moveEvent.clientY - startY),
      }));
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [transform]);

  const resetGraph = () => setTransform({ x: 0, y: 0, k: 1 });

  return (
    <div ref={containerRef} className="w-full h-full relative bg-transparent overflow-hidden" onWheel={handleWheel} onMouseDown={handleMouseDown}>
      <canvas 
        ref={canvasRef} 
        className="w-full h-full cursor-grab active:cursor-grabbing" 
        onClick={(e) => {
          const rect = canvasRef.current!.getBoundingClientRect();
          const mx = (e.clientX - rect.left - transform.x) / transform.k;
          const my = (e.clientY - rect.top - transform.y) / transform.k;
          
          const scaleX = rect.width / 800;
          const scaleY = rect.height / 600;
          const baseScale = Math.min(scaleX, scaleY);

          const hit = targets.find(t => {
            const pos = positionsById.get(t.id);
            return pos && isPointInCircle(mx, my, pos.x * baseScale, pos.y * baseScale, 20 / transform.k);
          });
          onSelect(hit || null);
        }}
      />
      <div className="absolute top-6 right-6 flex flex-col gap-2">
        <button onClick={() => setTransform(prev => ({ ...prev, k: prev.k * 1.2 }))} className={`p-2 rounded-md border shadow-sm ${theme === 'dark' ? 'bg-[#171717] border-neutral-800 text-neutral-400' : 'bg-white border-neutral-200 text-neutral-500'} hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors`}>
          <ZoomIn className="w-4 h-4" />
        </button>
        <button onClick={() => setTransform(prev => ({ ...prev, k: prev.k * 0.8 }))} className={`p-2 rounded-md border shadow-sm ${theme === 'dark' ? 'bg-[#171717] border-neutral-800 text-neutral-400' : 'bg-white border-neutral-200 text-neutral-500'} hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors`}>
          <ZoomOut className="w-4 h-4" />
        </button>
        <button onClick={resetGraph} title="Reset View" className={`p-2 rounded-md border shadow-sm ${theme === 'dark' ? 'bg-[#171717] border-neutral-800 text-neutral-400' : 'bg-white border-neutral-200 text-neutral-500'} hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors`}>
          <Maximize className="w-4 h-4" />
        </button>
      </div>
      <div className={`absolute bottom-6 left-6 p-4 rounded-lg border shadow-sm ${theme === 'dark' ? 'bg-[#171717] border-neutral-800' : 'bg-white border-neutral-200'} space-y-2`}>
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-rose-500" />
          <span className={`text-[11px] font-bold ${theme === 'dark' ? 'text-neutral-500' : 'text-neutral-600'}`}>Positive Correlation</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-blue-600" />
          <span className={`text-[11px] font-bold ${theme === 'dark' ? 'text-neutral-500' : 'text-neutral-600'}`}>Negative Correlation</span>
        </div>
      </div>
    </div>
  );
};

/**
 * Calculates a point color corresponding to its position in the terrain.
 * For survival mode, matches the amplification Red/Blue logic.
 */
const getSpectralColorJS = (value: number, isSurvival: boolean) => {
  if (isSurvival) {
    if (value > 0) return 'rgba(239, 68, 68, 0.95)'; // Matching Red hill
    if (value < 0) return 'rgba(37, 99, 235, 0.95)'; // Matching Blue hill
    return 'rgba(115, 115, 115, 0.4)';
  }

  const t = Math.max(0, Math.min(1, (value + 1) / 2));
  let r, g, b;
  if (t <= 0.2) {
    r = 0; g = 0.1 + (0.4 - 0.1) * (t / 0.2); b = 0.3 + (0.8 - 0.3) * (t / 0.2);
  } else if (t <= 0.4) {
    const p = (t - 0.2) / 0.2;
    r = 0.1 * p; g = 0.4 + 0.4 * p; b = 0.8 + 0.1 * p;
  } else if (t <= 0.6) {
    const p = (t - 0.4) / 0.2;
    r = 0.1 + 0.1 * p; g = 0.8 + 0.1 * p; b = 0.9 - 0.5 * p;
  } else if (t <= 0.8) {
    const p = (t - 0.6) / 0.2;
    r = 0.2 + 0.8 * p; g = 0.9; b = 0.4 - 0.2 * p;
  } else {
    const p = (t - 0.8) / 0.2;
    r = 1.0; g = 0.9 - 0.7 * p; b = 0.2 - 0.2 * p;
  }
  return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
};

const GeneTerrain = ({ 
  targets, 
  onSelect, 
  selectedId, 
  theme, 
  mode = 'default' 
}: { 
  targets: Target[], 
  onSelect: (t: Target | null) => void, 
  selectedId: string | undefined, 
  theme: Theme,
  mode?: 'default' | 'survival'
}) => {
  const glCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const shadersRef = useRef<{ [key: string]: WebGLProgram }>({});
  
  // Persistent WebGL resources
  const pointsTexRef = useRef<WebGLTexture | null>(null);
  const valuesTexRef = useRef<WebGLTexture | null>(null);
  const bufferRef = useRef<WebGLBuffer | null>(null);

  const [viewport, setViewport] = useState({ scale: 1.0, offset: { x: 0, y: 0 } });
  const [currentLayer, setCurrentLayer] = useState<TerrainLayer>('gaussian');
  const [terrainGain, setTerrainGain] = useState(1.5);
  const [dragging, setDragging] = useState(false);
  const [lastMouse, setLastMouse] = useState<{x:number, y:number} | null>(null);

  const { positionsById } = useMemo(() => computeForcePositions(targets, 800, 600), [targets]);

  const mappedTargets = useMemo(() => {
    const raw = targets.map((t) => {
      const pos = positionsById.get(t.id);
      const x = pos?.x ?? 400;
      const y = pos?.y ?? 300;

      let delta = 0;
      if (mode !== 'default') {
        delta = t.value || 0;
      } else {
        const e_star = t.combinedExpression || 0;
        delta = (0.45 * (t.geneticScore || 0)) + (0.25 * e_star) + (0.30 * (t.targetScore || 0)) - 0.5;
      }
      return { ...t, x, y, delta };
    });

    const absVals = raw.map(t => Math.abs(t.delta)).filter(v => v > 0);
    const maxAbs = absVals.length ? Math.max(...absVals) : 1.0;

    return raw.map(t => {
      let displayValue = 0;
      if (mode === 'survival') {
        displayValue = maxAbs > 0 ? t.delta / maxAbs : 0;
      } else {
        displayValue = (t.delta + 0.5); 
      }
      return { ...t, value: displayValue };
    });
  }, [targets, mode, positionsById]);

  const initShader = (gl: WebGLRenderingContext, vs: string, fs: string) => {
    const vShader = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vShader, vs);
    gl.compileShader(vShader);
    const fShader = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fShader, fs);
    gl.compileShader(fShader);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vShader);
    gl.attachShader(prog, fShader);
    gl.linkProgram(prog);
    return prog;
  };

  const draw = useCallback(() => {
    const gl = glRef.current;
    if (!gl || !glCanvasRef.current) return;

    if (!shadersRef.current[currentLayer]) {
      let fsSource = terrainFragmentShader;
      if (currentLayer === 'discrete') fsSource = contourFragmentShader;
      else if (currentLayer === 'water') fsSource = peaksFragmentShader;
      else if (currentLayer === 'sky') fsSource = valleyFragmentShader;
      shadersRef.current[currentLayer] = initShader(gl, vertexShaderSource, fsSource);
    }

    const prog = shadersRef.current[currentLayer];
    gl.useProgram(prog);

    if (!pointsTexRef.current) pointsTexRef.current = gl.createTexture();
    const pointsData = new Float32Array(MAX_WebGL_POINTS * 4);
    const valuesData = new Float32Array(MAX_WebGL_POINTS * 4);
    
    const count = Math.min(mappedTargets.length, MAX_WebGL_POINTS);
    mappedTargets.slice(0, count).forEach((t, i) => {
      pointsData[i*4] = t.x!;
      pointsData[i*4+1] = t.y!;
      valuesData[i*4] = t.value! * terrainGain;
    });

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, pointsTexRef.current);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, MAX_WebGL_POINTS, 1, 0, gl.RGBA, gl.FLOAT, pointsData);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    if (!valuesTexRef.current) valuesTexRef.current = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, valuesTexRef.current);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, MAX_WebGL_POINTS, 1, 0, gl.RGBA, gl.FLOAT, valuesData);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    gl.uniform1i(gl.getUniformLocation(prog, "pointsTexture"), 0);
    gl.uniform1i(gl.getUniformLocation(prog, "valuesTexture"), 1);
    gl.uniform1i(gl.getUniformLocation(prog, "pointCount"), count);
    gl.uniform1f(gl.getUniformLocation(prog, "sigma"), getSigmaForZoom(viewport.scale));
    gl.uniform2f(gl.getUniformLocation(prog, "resolution"), 800, 600);
    gl.uniform2f(gl.getUniformLocation(prog, "offset"), viewport.offset.x, viewport.offset.y);
    gl.uniform1f(gl.getUniformLocation(prog, "scale"), viewport.scale);
    gl.uniform1i(gl.getUniformLocation(prog, "isSurvival"), mode === 'survival' ? 1 : 0);
    
    if (currentLayer === 'discrete') {
      gl.uniform1f(gl.getUniformLocation(prog, "lineThickness"), 0.015);
      gl.uniform1f(gl.getUniformLocation(prog, "isolineSpacing"), 0.25);
    }

    if (!bufferRef.current) {
      bufferRef.current = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, bufferRef.current);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    } else {
      gl.bindBuffer(gl.ARRAY_BUFFER, bufferRef.current);
    }

    const posAttrib = gl.getAttribLocation(prog, "position");
    gl.enableVertexAttribArray(posAttrib);
    gl.vertexAttribPointer(posAttrib, 2, gl.FLOAT, false, 0, 0);

    gl.viewport(0, 0, 800, 600);
    gl.clearColor(0,0,0,0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    const ctx = overlayCanvasRef.current?.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, 800, 600);
      ctx.save();
      ctx.setTransform(viewport.scale, 0, 0, viewport.scale, viewport.offset.x, viewport.offset.y);

      mappedTargets.forEach(t => {
        const isSelected = t.id === selectedId;
        ctx.beginPath(); ctx.arc(t.x!, t.y!, (isSelected ? 5 : 2.5) / viewport.scale, 0, Math.PI * 2);
        
        let pointColor = theme === 'dark' ? 'rgba(115, 115, 115, 0.4)' : 'rgba(38, 38, 38, 0.8)';
        if (isSelected) {
          pointColor = '#2563eb';
        } else {
          // Point color matches terrain hill color logic (Red/Blue amplification)
          pointColor = getSpectralColorJS(t.value!, mode === 'survival');
        }

        ctx.fillStyle = pointColor;
        ctx.fill();
        if (viewport.scale > 3.5) {
          ctx.font = `bold ${9 / viewport.scale}px Inter`;
          ctx.fillStyle = theme === 'dark' ? '#737373' : '#111827';
          ctx.textAlign = 'center'; ctx.fillText(t.symbol, t.x!, t.y! + 10 / viewport.scale);
        }
      });
      ctx.restore();
    }
  }, [mappedTargets, viewport, currentLayer, terrainGain, selectedId, theme, mode]);

  useEffect(() => {
    const canvas = glCanvasRef.current;
    if (canvas) {
      glRef.current = canvas.getContext('webgl', { preserveDrawingBuffer: true, antialias: true });
      glRef.current?.getExtension('OES_texture_float');
    }
    return () => {
      const gl = glRef.current;
      if (gl) {
        if (pointsTexRef.current) gl.deleteTexture(pointsTexRef.current);
        if (valuesTexRef.current) gl.deleteTexture(valuesTexRef.current);
        if (bufferRef.current) gl.deleteBuffer(bufferRef.current);
        Object.values(shadersRef.current).forEach(p => gl.deleteProgram(p));
      }
    };
  }, []);

  useEffect(() => {
    let frameId: number;
    const loop = () => { draw(); frameId = requestAnimationFrame(loop); };
    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, [draw]);

  return (
    <div className={`relative w-full h-full rounded-xl overflow-hidden border ${theme === 'dark' ? 'bg-[#0a0a0a] border-neutral-800' : 'bg-white border-neutral-200'}`}>
      <canvas ref={glCanvasRef} width={800} height={600} className="absolute inset-0 w-full h-full" />
      <canvas 
        ref={overlayCanvasRef} 
        width={800} height={600} 
        className={`absolute inset-0 w-full h-full cursor-default`}
        onMouseDown={e => {
          setDragging(true); setLastMouse({ x: e.clientX, y: e.clientY });
          const rect = overlayCanvasRef.current!.getBoundingClientRect();
          const x = (e.clientX - rect.left - viewport.offset.x) / viewport.scale;
          const y = (e.clientY - rect.top - viewport.offset.y) / viewport.scale;
          const hit = mappedTargets.find(t => isPointInCircle(x, y, t.x!, t.y!, 10 / viewport.scale));
          if (hit) onSelect(hit);
        }} 
        onMouseMove={e => {
          if (dragging && lastMouse) {
            setViewport(prev => ({ 
              ...prev, 
              offset: { x: prev.offset.x + (e.clientX - lastMouse.x), y: prev.offset.y + (e.clientY - lastMouse.y) } 
            }));
            setLastMouse({ x: e.clientX, y: e.clientY });
          }
        }} 
        onMouseUp={() => setDragging(false)}
        onWheel={e => setViewport(prev => ({ ...prev, scale: Math.max(0.5, Math.min(6, prev.scale * (e.deltaY > 0 ? 0.95 : 1.05))) }))}
      />
      
      <div className="absolute top-6 left-6 flex flex-col gap-3">
        <div className={`p-1 rounded-lg border flex flex-col gap-1 shadow-sm ${theme === 'dark' ? 'bg-[#171717] border-neutral-800' : 'bg-white border-neutral-200'}`}>
          {[ 
            { id: 'gaussian', icon: Globe2, name: 'Evidence Intensity' }, 
            { id: 'discrete', icon: Layers, name: 'Confidence Contours' }, 
            { id: 'water', icon: FlaskConical, name: 'Drugability Peaks' }, 
            { id: 'sky', icon: Microscope, name: 'Genetic Valleys' } 
          ].map(l => (
            <button 
              key={l.id} title={l.name}
              onClick={() => setCurrentLayer(l.id as TerrainLayer)} 
              className={`p-2 rounded-md transition-colors ${currentLayer === l.id ? 'bg-blue-600 text-white' : 'text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800'}`}
            >
              <l.icon className="w-4 h-4" />
            </button>
          ))}
        </div>
        
        <div className={`p-3 rounded-lg border flex flex-col gap-2 shadow-sm ${theme === 'dark' ? 'bg-[#171717] border-neutral-800' : 'bg-white border-neutral-200'}`}>
           <div className="flex items-center gap-2">
              <Volume2 className="w-3.5 h-3.5 text-neutral-400" />
              <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Amplification</span>
           </div>
           <input 
              type="range" min="0.5" max="3.5" step="0.1" 
              value={terrainGain} onChange={(e) => setTerrainGain(parseFloat(e.target.value))} 
              className="w-20 h-1 bg-neutral-200 dark:bg-neutral-700 rounded-full appearance-none cursor-pointer accent-blue-600"
           />
        </div>
      </div>

      <div className="absolute bottom-6 right-6 flex gap-2">
        <button onClick={() => setViewport({ scale: 1.0, offset: { x: 0, y: 0 } })} className={`p-2 rounded-md border shadow-sm ${theme === 'dark' ? 'bg-[#171717] border-neutral-800 text-neutral-400' : 'bg-white border-neutral-200 text-neutral-600'} hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors`}>
          <RotateCcw className="w-4 h-4" />
        </button>
        <div className="flex rounded-md border shadow-sm overflow-hidden bg-white border-neutral-200 dark:bg-[#171717] dark:border-neutral-800">
          <button onClick={() => setViewport(v => ({ ...v, scale: Math.min(6, v.scale * 1.2) }))} className="p-2 border-r border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800"><ZoomIn className="w-4 h-4 text-neutral-500" /></button>
          <button onClick={() => setViewport(v => ({ ...v, scale: Math.max(0.5, v.scale * 0.8) }))} className="p-2 hover:bg-neutral-50 dark:hover:bg-neutral-800"><ZoomOut className="w-4 h-4 text-neutral-500" /></button>
        </div>
      </div>
    </div>
  );
};

const RawDataView = ({ targets, theme }: { targets: Target[], theme: Theme }) => {
  const [clinicalData, setClinicalData] = useState<ClinicalSample[]>([]);
  const [selectedSample, setSelectedSample] = useState<ClinicalSample | null>(null);
  const [expressionData, setExpressionData] = useState<ExpressionRow[]>([]);
  const [loadingClinical, setLoadingClinical] = useState(false);
  const [loadingExpression, setLoadingExpression] = useState(false);
  const [showOnlyGetGenes, setShowOnlyGetGenes] = useState(true);
  const [offset, setOffset] = useState(0);

  const getTargetSymbols = useMemo(() => new Set(targets.map(t => t.symbol)), [targets]);

  useEffect(() => {
    const fetchClinical = async () => {
      setLoadingClinical(true);
      const data = await api.getBrcaClinical(offset);
      setClinicalData(data);
      setLoadingClinical(false);
    };
    fetchClinical();
  }, [offset]);

  const handleSelectSample = async (sample: ClinicalSample) => {
    setSelectedSample(sample);
    setLoadingExpression(true);
    const data = await api.getBrcaExpression(sample.sampleid);
    setExpressionData(data);
    setLoadingExpression(false);
  };

  const filteredExpression = useMemo(() => {
    if (!showOnlyGetGenes) return expressionData;
    return expressionData.filter(row => getTargetSymbols.has(row.gene_symbol));
  }, [expressionData, getTargetSymbols, showOnlyGetGenes]);

  return (
    <div className="h-full flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-neutral-100 dark:divide-neutral-800">
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Stethoscope className="w-4 h-4 text-neutral-400" />
            <span className="text-[12px] font-semibold text-neutral-600 dark:text-neutral-400">BRCA Clinical Cohort</span>
          </div>
          <div className="flex items-center gap-2">
             <button onClick={() => setOffset(Math.max(0, offset - 10))} disabled={offset === 0} className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-20 transition-colors"><ChevronLeft className="w-4 h-4" /></button>
             <span className="text-[10px] font-mono text-neutral-400">P. {offset/10 + 1}</span>
             <button onClick={() => setOffset(offset + 10)} className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          {loadingClinical ? (
            <div className="h-full flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>
          ) : (
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-neutral-50 dark:bg-neutral-900 border-b border-neutral-100 dark:border-neutral-800 z-10">
                <tr>
                  <th className="p-4 text-[10px] font-bold text-neutral-500 uppercase tracking-widest pl-6">Sample ID</th>
                  <th className="p-4 text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Type</th>
                  <th className="p-4 text-[10px] font-bold text-neutral-500 uppercase tracking-widest pr-6 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-50 dark:divide-neutral-800">
                {clinicalData.map(sample => (
                  <tr 
                    key={sample.sampleid} 
                    onClick={() => handleSelectSample(sample)}
                    className={`cursor-pointer transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/50 ${selectedSample?.sampleid === sample.sampleid ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}
                  >
                    <td className="p-4 pl-6 font-mono text-[11px] text-blue-600 dark:text-blue-400">{sample.sampleid}</td>
                    <td className="p-4 text-[11px] text-neutral-600 dark:text-neutral-400">{sample.sample_type}</td>
                    <td className={`p-4 pr-6 text-right text-[11px] font-medium ${sample.vital_status === 'Alive' ? 'text-emerald-600' : 'text-rose-600'}`}>{sample.vital_status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-neutral-400" />
            <span className="text-[12px] font-semibold text-neutral-600 dark:text-neutral-400">Sample Expression</span>
          </div>
          <button 
            onClick={() => setShowOnlyGetGenes(!showOnlyGetGenes)}
            className={`text-[10px] font-bold px-3 py-1 rounded border transition-colors ${showOnlyGetGenes ? 'bg-blue-600 text-white border-blue-600' : 'bg-transparent text-neutral-500 border-neutral-200 dark:border-neutral-700'}`}
          >
            {showOnlyGetGenes ? 'FILTERED' : 'ALL'}
          </button>
        </div>
        <div className="flex-1 overflow-auto">
          {!selectedSample ? (
            <div className="h-full flex flex-col items-center justify-center p-12 text-center text-neutral-400">
              <DatabaseZap className="w-8 h-8 mb-4 opacity-10" />
              <p className="text-sm font-medium">Select a patient sample to view molecular profile</p>
            </div>
          ) : loadingExpression ? (
            <div className="h-full flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>
          ) : (
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-neutral-50 dark:bg-neutral-900 border-b border-neutral-100 dark:border-neutral-800 z-10">
                <tr>
                  <th className="p-4 text-[10px] font-bold text-neutral-500 uppercase tracking-widest pl-6">Gene</th>
                  <th className="p-4 text-[10px] font-bold text-neutral-500 uppercase tracking-widest text-center">In List</th>
                  <th className="p-4 text-[10px] font-bold text-neutral-500 uppercase tracking-widest pr-6 text-right">TPM Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-50 dark:divide-neutral-800">
                {filteredExpression.map(row => {
                  const isGetGene = getTargetSymbols.has(row.gene_symbol);
                  return (
                    <tr key={row.gene_symbol} className={isGetGene ? 'bg-blue-50/20 dark:bg-blue-900/5' : ''}>
                      <td className={`p-4 pl-6 font-semibold text-[11px] ${isGetGene ? 'text-blue-600 dark:text-blue-400' : 'text-neutral-500'}`}>{row.gene_symbol}</td>
                      <td className="p-4 text-center">
                        {isGetGene && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mx-auto" />}
                      </td>
                      <td className="p-4 pr-6 text-right font-mono text-[11px] text-neutral-500">
                        {parseFloat(row.value).toFixed(4)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

const DrugLandscape = ({ targetId, theme }: { targetId: string, theme: Theme }) => {
  const [drugs, setDrugs] = useState<DrugInfo[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    const fetch = async () => {
      setLoading(true);
      const res = await api.getTargetDrugs(targetId);
      if (active) { setDrugs(res); setLoading(false); }
    };
    fetch();
    return () => { active = false; };
  }, [targetId]);

  if (loading) return <div className="flex items-center gap-3 py-4"><Loader2 className="w-4 h-4 animate-spin text-blue-500" /><span className="text-[11px] font-medium text-neutral-400">Mapping clinical pipeline...</span></div>;
  if (drugs.length === 0) return null;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Pill className="w-4 h-4 text-neutral-400" />
        <h4 className="text-[11px] font-bold uppercase tracking-widest text-neutral-500">Pipeline Evidence</h4>
      </div>
      <div className="space-y-2">
        {drugs.slice(0, 4).map(d => (
          <div key={d.id} className={`p-4 rounded-lg border ${theme === 'dark' ? 'bg-[#171717] border-neutral-800' : 'bg-neutral-50 border-neutral-200'}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-blue-600 dark:text-blue-500 uppercase tracking-wider">{d.name}</span>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400">PHASE {d.phase}</span>
            </div>
            <p className={`text-[11px] leading-relaxed italic ${theme === 'dark' ? 'text-neutral-400' : 'text-neutral-600'}`}>{d.mechanism}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

const LiteratureStats = ({ symbol, diseaseName, theme }: { symbol: string, diseaseName: string, theme: Theme }) => {
  const [stats, setStats] = useState<PubMedStats | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let active = true;
    const fetch = async () => {
      setLoading(true);
      const res = await api.getPubMedStats(symbol, diseaseName);
      if (active) { setStats(res); setLoading(false); }
    };
    fetch(); return () => { active = false; };
  }, [symbol, diseaseName]);
  if (loading) return <div className="flex items-center gap-3 py-6"><Loader2 className="w-4 h-4 animate-spin text-blue-500" /><span className="text-[11px] font-medium text-neutral-400">Retrieving PubMed analytics...</span></div>;
  if (!stats) return null;
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          < BookOpen className="w-4 h-4 text-neutral-400" />
          <h4 className="text-[11px] font-bold uppercase tracking-widest text-neutral-500">Clinical Publications</h4>
        </div>
        <a href={stats.searchLink} target="_blank" rel="noopener noreferrer" className="text-[10px] font-bold text-blue-600 hover:underline flex items-center gap-1">
          ANALYSIS <ExternalLink className="w-3 h-3" />
        </a>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className={`p-4 rounded-lg border ${theme === 'dark' ? 'bg-[#171717] border-neutral-800' : 'bg-neutral-50 border-neutral-200'}`}>
          <div className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest mb-1">Total Signals</div>
          <div className={`text-lg font-bold ${theme === 'dark' ? 'text-white' : 'text-neutral-900'}`}>{stats.total.toLocaleString()}</div>
        </div>
        <a 
          href={stats.primarySearchLink} 
          target="_blank" 
          rel="noopener noreferrer" 
          className={`p-4 rounded-lg border block hover:bg-blue-100/50 dark:hover:bg-blue-900/10 transition-colors ${theme === 'dark' ? 'bg-blue-900/5 border-blue-500/20' : 'bg-blue-50 border-blue-100'}`}
        >
          <div className="flex items-center justify-between mb-1">
            <div className="text-[9px] font-bold text-blue-600 uppercase tracking-widest">Recent (2024-25)</div>
            <ExternalLink className="w-2.5 h-2.5 text-blue-400" />
          </div>
          <div className="text-lg font-bold text-blue-700">{stats.recent.toLocaleString()}</div>
        </a>
      </div>
      <div className="space-y-3">
        {stats.topPapers.map(p => (
          <a key={p.id} href={`https://pubmed.ncbi.nlm.nih.gov/${p.id}/`} target="_blank" rel="noopener noreferrer" className={`block p-4 rounded-lg border transition-all hover:bg-neutral-100 dark:hover:bg-neutral-800 ${theme === 'dark' ? 'bg-[#171717] border-neutral-800' : 'bg-white border-neutral-200 shadow-sm'}`}>
            <p className={`text-[11px] font-medium leading-relaxed mb-2 line-clamp-2 ${theme === 'dark' ? 'text-neutral-300' : 'text-neutral-800'}`}>{p.title}</p>
            <div className="text-[9px] font-mono text-neutral-400 uppercase tracking-wider">PMID {p.id}</div>
          </a>
        ))}
      </div>
    </div>
  );
};

// --- App Shell ---

const App = () => {
  const [theme, setTheme] = useState<Theme>('light');
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('pharm_user'));
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [loading, setLoading] = useState(false);
  const [researchState, setResearchState] = useState<ResearchContext>({ 
    activeDisease: null, targets: [], enrichment: [], limit: 30, currentPage: 0, focusSymbol: null 
  });
  const [messages, setMessages] = useState<Message[]>([ { role: 'assistant', content: "Evidence Portal Ready. Please input a disease focus or clinical query to begin synthesis.", timestamp: new Date() } ]);
  const [chatInput, setChatInput] = useState("");
  const [isChatting, setIsChatting] = useState(false);
  
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);

  const chatScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight; }, [messages]);

  const isBrcaActive = useMemo(() => {
    if (!researchState.activeDisease) return false;
    const name = researchState.activeDisease.name.toLowerCase();
    return name.includes('breast') || name.includes('brca');
  }, [researchState.activeDisease]);

  const analyzeBrcaSurvival = useCallback(async () => {
    if (researchState.survivalMetrics || researchState.isAnalyzingSurvival) return;
    setResearchState(prev => ({ ...prev, isAnalyzingSurvival: true }));
    try {
      const clinical = await api.getBrcaClinical(0); 
      const highSurvivalIds = clinical.filter(c => c.vital_status === 'Alive').map(c => c.sampleid).slice(0, 15);
      const lowSurvivalIds = clinical.filter(c => c.vital_status === 'Dead').map(c => c.sampleid).slice(0, 15);
      const getSymbols = new Set(researchState.targets.map(t => t.symbol));
      const highExpAgg: { [sym: string]: number[] } = {};
      const lowExpAgg: { [sym: string]: number[] } = {};

      const fetchExpBatch = async (ids: string[], agg: { [sym: string]: number[] }) => {
        for (const id of ids) {
          try {
             const rows = await api.getBrcaExpression(id);
             rows.forEach(r => {
               if (getSymbols.has(r.gene_symbol)) {
                 if (!agg[r.gene_symbol]) agg[r.gene_symbol] = [];
                 agg[r.gene_symbol].push(parseFloat(r.value));
               }
             });
          } catch(e) {}
        }
      };

      await Promise.all([fetchExpBatch(highSurvivalIds, highExpAgg), fetchExpBatch(lowSurvivalIds, lowExpAgg)]);
      const metrics: SurvivalMetrics = {};
      researchState.targets.forEach(t => {
        const highVals = highExpAgg[t.symbol] || [0];
        const lowVals = lowExpAgg[t.symbol] || [0];
        const meanHigh = highVals.reduce((a,b)=>a+b, 0) / Math.max(1, highVals.length);
        const meanLow = lowVals.reduce((a,b)=>a+b, 0) / Math.max(1, lowVals.length);
        metrics[t.symbol] = { meanHigh, meanLow, delta: meanHigh - meanLow };
      });
      setResearchState(prev => ({ ...prev, survivalMetrics: metrics, isAnalyzingSurvival: false }));
    } catch (e) {
      setResearchState(prev => ({ ...prev, isAnalyzingSurvival: false }));
    }
  }, [researchState.targets, researchState.survivalMetrics, researchState.isAnalyzingSurvival]);

  useEffect(() => {
    if (isBrcaActive && viewMode === 'survival' && !researchState.survivalMetrics) {
      analyzeBrcaSurvival();
    }
  }, [viewMode, researchState.survivalMetrics, analyzeBrcaSurvival, isBrcaActive]);

  const handleToolExecution = useCallback(async (name: string, args: any) => {
    setLoading(true);
    try {
      switch (name) {
        case 'search_diseases': {
          const options = await api.searchDiseases(args.query);
          if (options.length === 0) return `No clinical records found for "${args.query}".`;
          if (options.length === 1) {
            const opt = options[0];
            const genes = await api.getGenes(opt.id, 30, 0);
            const enrichment = await api.getEnrichment(genes.map(g => g.symbol));
            setResearchState(prev => ({ ...prev, targets: genes, enrichment, activeDisease: opt, focusSymbol: genes[0]?.symbol || null, currentPage: 0 }));
            return `Project set to ${opt.name}. Molecular evidence mapped across ${genes.length} primary targets.`;
          }
          return { content: `Search returned multiple clinical categories. Please refine your focus area:`, options };
        }
        case 'get_genes': {
          const genes = await api.getGenes(args.id, 30, 0);
          const enrichment = await api.getEnrichment(genes.map(g => g.symbol));
          setResearchState(prev => ({ ...prev, targets: genes, enrichment, activeDisease: { id: args.id, name: args.name }, focusSymbol: genes[0]?.symbol || null, currentPage: 0 }));
          return `Target prioritization complete for ${args.name}. Evidence weights finalized.`;
        }
        case 'update_view': {
          setViewMode(args.mode);
          return `Shifting visualization focus to ${args.mode}.`;
        }
        default: return "Acknowledged.";
      }
    } catch (err) { return "Operation error."; } finally { setLoading(false); }
  }, []);

  const handleSelectOption = useCallback(async (o: DiseaseInfo) => {
    const res = await handleToolExecution('get_genes', { id: o.id, name: o.name });
    setMessages(prev => [...prev, { role: 'assistant', content: typeof res === 'string' ? res : res.content, timestamp: new Date() }]);
  }, [handleToolExecution]);

  const handleChat = async (e: React.FormEvent) => {
    e.preventDefault(); if (!chatInput.trim() || isChatting) return;
    const userMsg: Message = { role: 'user', content: chatInput, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]); setChatInput(""); setIsChatting(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const tools = [
        { name: 'search_diseases', parameters: { type: Type.OBJECT, properties: { query: { type: Type.STRING } }, required: ['query'] } },
        { name: 'get_genes', parameters: { type: Type.OBJECT, properties: { id: { type: Type.STRING }, name: { type: Type.STRING } }, required: ['id', 'name'] } },
        { name: 'update_view', parameters: { type: Type.OBJECT, properties: { mode: { type: Type.STRING, enum: ['list', 'correlation', 'enrichment', 'graph', 'terrain', 'raw', 'survival'] } }, required: ['mode'] } }
      ];
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: [...messages, userMsg].map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] })),
        config: { tools: [{ functionDeclarations: tools as any }], systemInstruction: "Scientific Analysis Agent. Maintain professional, concise tone. Provide evidence-based summaries." }
      });
      if (response.functionCalls?.length) {
        for (const fc of response.functionCalls) {
          const res = await handleToolExecution(fc.name, fc.args);
          setMessages(prev => [...prev, { role: 'assistant', content: typeof res === 'string' ? res : res.content, options: typeof res === 'string' ? undefined : res.options, timestamp: new Date() }]);
        }
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: response.text || "Synthesizing response...", timestamp: new Date() }]);
      }
    } catch (e) { setMessages(prev => [...prev, { role: 'assistant', content: "Protocol error.", timestamp: new Date() }]); } finally { setIsChatting(false); }
  };

  if (!isAuthenticated) return <SignInPage theme={theme} toggleTheme={() => setTheme(t=>t==='dark'?'light':'dark')} onSignIn={e => { localStorage.setItem('pharm_user', e); setIsAuthenticated(true); }} />;

  return (
    <div className={`h-screen flex flex-col transition-colors duration-200 ${theme === 'dark' ? 'bg-[#0a0a0a] text-neutral-200' : 'bg-neutral-50 text-neutral-900'}`}>
      <header className={`px-6 py-3.5 flex items-center justify-between border-b transition-colors ${theme === 'dark' ? 'bg-[#171717] border-neutral-800' : 'bg-white border-neutral-100 shadow-sm'}`}>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2.5">
            <FlaskConical className="w-5 h-5 text-blue-600" />
            <h1 className="text-base font-bold tracking-tight">Get<span className="text-blue-600">Gene</span></h1>
          </div>
          {researchState.activeDisease && (
            <div className="flex items-center gap-2 px-3 py-1 rounded bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
              <span className={`text-[10px] font-bold uppercase tracking-widest ${theme === 'dark' ? 'text-neutral-500' : 'text-neutral-600'}`}>ANALYSIS: {researchState.activeDisease.name}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setTheme(t=>t==='dark'?'light':'dark')} className="p-2 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors">
            {theme === 'dark' ? <Sun className="w-4 h-4 text-neutral-400" /> : <Moon className="w-4 h-4 text-neutral-500" />}
          </button>
          <div className="w-px h-4 bg-neutral-200 dark:bg-neutral-800 mx-1" />
          <button onClick={() => { localStorage.removeItem('pharm_user'); setIsAuthenticated(false); }} className="p-2 rounded hover:text-rose-600 text-neutral-400 transition-colors">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden relative">
        <aside className={`border-r flex flex-col shrink-0 transition-all duration-300 ease-in-out ${isLeftSidebarOpen ? 'w-[360px]' : 'w-0 opacity-0 pointer-events-none border-r-0'} ${theme === 'dark' ? 'bg-[#0d0d0d] border-neutral-800' : 'bg-white border-neutral-100'}`}>
           <div className="p-4 border-b border-neutral-100 dark:border-neutral-800 text-[10px] font-bold uppercase tracking-widest text-neutral-400 flex items-center justify-between">
              Evidence Terminal
              <button onClick={() => setIsLeftSidebarOpen(false)} className="p-1 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded transition-colors"><PanelLeft className="w-3.5 h-3.5" /></button>
           </div>
           <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-5 space-y-6">
              {messages.map((m, i) => (
                <div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className={`max-w-[95%] p-4 rounded-lg text-[14px] leading-relaxed shadow-sm ${m.role === 'user' ? 'bg-blue-600 text-white' : (theme === 'dark' ? 'bg-[#171717] border border-neutral-800' : 'bg-neutral-100 border border-neutral-200 text-neutral-800')}`}>
                    {m.content}
                    {m.options && (
                      <div className="mt-4 space-y-2">
                        {m.options.map(o => (
                          <button key={o.id} onClick={() => handleSelectOption(o)} className="w-full p-3 rounded bg-blue-500/10 border border-blue-500/20 text-left text-[11px] font-semibold uppercase hover:bg-blue-600 hover:text-white transition-all">{o.name}</button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {isChatting && (
                <div className="flex items-center gap-2 text-blue-500 px-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span className="text-[10px] font-bold tracking-widest uppercase">Processing...</span>
                </div>
              )}
           </div>
           <form onSubmit={handleChat} className="p-4 border-t border-neutral-100 dark:border-neutral-800">
              <div className="relative">
                <input type="text" value={chatInput} onChange={e=>setChatInput(e.target.value)} placeholder="Condition analysis..." className={`w-full p-3 pr-10 text-sm rounded-lg border outline-none focus:border-blue-500/50 transition-all ${theme === 'dark' ? 'bg-[#171717] border-neutral-800' : 'bg-neutral-50 border-neutral-200'}`} />
                <button type="submit" className="absolute right-2 top-2 p-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-sm"><Send className="w-4 h-4" /></button>
              </div>
           </form>
        </aside>

        {!isLeftSidebarOpen && (
          <button onClick={() => setIsLeftSidebarOpen(true)} className="absolute left-4 bottom-4 z-20 p-2.5 rounded-full bg-blue-600 text-white shadow-lg hover:scale-105 transition-transform"><MessageSquare className="w-5 h-5" /></button>
        )}

        <section className="flex-1 flex flex-col p-6 overflow-hidden">
           <div className="flex items-center mb-5 shrink-0">
              <div className={`flex p-1 rounded-lg border shrink-0 overflow-x-auto max-w-full scrollbar-hide ${theme === 'dark' ? 'bg-[#171717] border-neutral-800' : 'bg-white border-neutral-200 shadow-sm'}`}>
                {[ 
                   {id:'list',i:List,l:'GET LIST'}, 
                   {id:'correlation',i:Network,l:'Correlation'},
                   {id:'enrichment',i:BarChart3,l:'Enrichment'}, 
                   {id:'graph',i:Share2,l:'Graph'}, 
                   {id:'terrain',i:Globe2,l:'Terrain'},
                   {id:'survival',i:Activity,l:'Survival Focused'},
                   {id:'raw',i:Database,l:'Cohort Data'}
                ].map(t => (
                  <button key={t.id} onClick={() => setViewMode(t.id as any)} className={`px-4 py-2 rounded text-[11px] font-semibold uppercase tracking-wider flex items-center gap-2 transition-all whitespace-nowrap ${viewMode === t.id ? 'bg-blue-600 text-white' : 'text-neutral-500 hover:text-blue-600'}`}><t.i className="w-3.5 h-3.5" /> {t.l}</button>
                ))}
              </div>
           </div>

           <div className={`flex-1 rounded-xl border overflow-hidden relative transition-colors duration-300 ${theme === 'dark' ? 'bg-[#121212] border-neutral-800' : 'bg-white border-neutral-100 shadow-sm'}`}>
              {(loading || researchState.isAnalyzingSurvival) && (
                <div className="absolute inset-0 bg-neutral-900/40 backdrop-blur-[2px] z-50 flex flex-col items-center justify-center gap-4 text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                  <p className="text-[11px] font-bold uppercase tracking-widest text-white">Aggregating Evidence...</p>
                </div>
              )}

              {researchState.targets.length === 0 && viewMode !== 'raw' ? (
                <div className="h-full flex flex-col items-center justify-center p-20 text-center opacity-30">
                  <Search className="w-12 h-12 text-neutral-400 mb-6" />
                  <h2 className="text-lg font-bold mb-1">Awaiting Research Focus</h2>
                  <p className="text-sm max-w-sm text-neutral-500">Provide a clinical condition to synthesize cross-omics data and identify high-priority therapeutic targets.</p>
                </div>
              ) : (viewMode === 'raw' || viewMode === 'survival') && !isBrcaActive ? (
                <div className="h-full flex flex-col items-center justify-center p-12 text-center">
                  <div className="p-4 rounded-full bg-blue-50 dark:bg-blue-900/10 mb-6">
                    <AlertCircle className="w-10 h-10 text-blue-600" />
                  </div>
                  <h3 className="text-lg font-bold mb-2">Restricted Context</h3>
                  <p className="text-sm max-w-md text-neutral-500 leading-relaxed">
                    These clinical outcome analytics are only available for BRCA (Breast Cancer) studies in the current institutional release. 
                    Please focus your research on BRCA to enable cohort-level survival synthesis.
                  </p>
                </div>
              ) : (
                <>
                  {viewMode === 'list' && (
                    <div className="h-full overflow-auto">
                      <table className="w-full text-left">
                        <thead className={`sticky top-0 z-10 text-[10px] font-bold uppercase tracking-widest border-b ${theme === 'dark' ? 'bg-[#171717] border-neutral-800 text-neutral-500' : 'bg-neutral-50 border-neutral-200 text-neutral-600'}`}>
                          <tr>
                            <th className="p-4 pl-8">Gene</th>
                            <th className="p-4 hidden md:table-cell">Gene Name</th>
                            <th className="p-4 text-center">Genetic</th>
                            <th className="p-4 text-center">Expression</th>
                            <th className="p-4 text-center">Target</th>
                            <th className="p-4 pr-8 text-right">Score</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                          {researchState.targets.map(t => (
                            <tr key={t.id} onClick={()=>setResearchState(p=>({...p, focusSymbol: t.symbol}))} className={`cursor-pointer transition-colors hover:bg-neutral-50/50 dark:hover:bg-neutral-800/20 ${researchState.focusSymbol === t.symbol ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}>
                              <td className="p-4 pl-8 font-bold text-blue-600 dark:text-blue-500 text-[13px]">{t.symbol}</td>
                              <td className={`p-4 text-[12px] hidden md:table-cell ${theme === 'dark' ? 'text-neutral-500' : 'text-neutral-700'}`}>{t.name}</td>
                              <td className={`p-4 text-center font-mono text-[11px] ${theme === 'dark' ? 'text-neutral-500' : 'text-neutral-600'}`}>{t.geneticScore.toFixed(3)}</td>
                              <td className={`p-4 text-center font-mono text-[11px] ${theme === 'dark' ? 'text-neutral-500' : 'text-neutral-600'}`}>{Math.max(t.expressionScore || 0, t.baselineExpression || 0).toFixed(3)}</td>
                              <td className={`p-4 text-center font-mono text-[11px] ${theme === 'dark' ? 'text-neutral-500' : 'text-neutral-600'}`}>{t.targetScore.toFixed(3)}</td>
                              <td className={`p-4 pr-8 text-right font-mono font-bold text-[12px] ${theme === 'dark' ? 'text-neutral-300' : 'text-neutral-800'}`}>{t.overallScore.toFixed(4)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {viewMode === 'correlation' && <CorrelationView targets={researchState.targets} theme={theme} />}
                  {viewMode === 'enrichment' && (
                    <div className="p-10 h-full overflow-auto space-y-6">
                      <div className={`flex items-center justify-between border-b pb-4 ${theme === 'dark' ? 'border-neutral-800' : 'border-neutral-200'}`}>
                        <h4 className={`text-[12px] font-bold uppercase tracking-widest ${theme === 'dark' ? 'text-neutral-500' : 'text-neutral-600'}`}>KEGG Pathway Analytics</h4>
                        <div className={`flex items-center gap-2 px-2.5 py-1 rounded-full text-[10px] font-bold ${theme === 'dark' ? 'bg-neutral-800 text-neutral-500' : 'bg-neutral-100 text-neutral-600'}`}>
                           {researchState.enrichment.length} SIGNALS
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-4">
                        {researchState.enrichment.map((e, i) => {
                          const nCoCo = Math.min(0.95, (Math.log10(e.combinedScore + 1) / 3) + (Math.random() * 0.05));
                          return (
                            <div key={i} className={`p-5 rounded-lg border shadow-sm ${theme === 'dark' ? 'bg-[#171717] border-neutral-800' : 'bg-white border-neutral-200'}`}>
                              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                                <div className="space-y-3 flex-1">
                                  <div className="flex items-center gap-3">
                                    <span className={`text-[14px] font-bold ${theme === 'dark' ? 'text-neutral-100' : 'text-neutral-900'}`}>{e.term}</span>
                                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold tracking-tighter ${theme === 'dark' ? 'bg-neutral-700 text-neutral-500' : 'bg-neutral-100 text-neutral-500'}`}>KEGG:2021</span>
                                  </div>
                                  <div className="flex flex-wrap gap-1.5">
                                    {e.genes.slice(0, 12).map(g => (
                                      <span key={g} className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-colors ${theme === 'dark' ? 'bg-neutral-800 text-neutral-500 border-neutral-700' : 'bg-blue-50/50 text-blue-700 border-blue-100'}`}>{g}</span>
                                    ))}
                                    {e.genes.length > 12 && <span className={`text-[10px] font-bold ${theme === 'dark' ? 'text-neutral-500' : 'text-neutral-500'}`}>+{e.genes.length - 12}</span>}
                                  </div>
                                </div>
                                <div className={`flex items-center gap-10 shrink-0 lg:border-l lg:pl-10 ${theme === 'dark' ? 'border-neutral-800' : 'border-neutral-100'}`}>
                                  <div className="text-right">
                                    <div className={`text-[10px] font-bold uppercase mb-0.5 ${theme === 'dark' ? 'text-neutral-400' : 'text-neutral-600'}`}>p-Value</div>
                                    <div className="text-sm font-mono font-bold text-blue-600 dark:text-blue-500">{e.pValue.toExponential(2)}</div>
                                  </div>
                                  <div className="w-32 space-y-2">
                                    <div className="flex justify-between items-end">
                                      <span className={`text-[10px] font-bold uppercase ${theme === 'dark' ? 'text-neutral-400' : 'text-neutral-600'}`}>Magnitude</span>
                                      <span className={`text-[11px] font-bold font-mono ${theme === 'dark' ? 'text-neutral-300' : 'text-neutral-700'}`}>{nCoCo.toFixed(3)}</span>
                                    </div>
                                    <div className={`h-1.5 rounded-full overflow-hidden ${theme === 'dark' ? 'bg-neutral-800' : 'bg-neutral-100'}`}>
                                      <div className="h-full bg-blue-600" style={{width: `${nCoCo*100}%`}} />
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {viewMode === 'graph' && <KnowledgeGraph targets={researchState.targets} selectedId={researchState.focusSymbol || undefined} onSelect={(t)=>setResearchState(p=>({...p, focusSymbol: t?.symbol || null}))} theme={theme} />}
                  {viewMode === 'terrain' && <GeneTerrain targets={researchState.targets} selectedId={researchState.targets.find(t=>t.symbol===researchState.focusSymbol)?.id} onSelect={(t)=>setResearchState(p=>({...p, focusSymbol: t?.symbol || null}))} theme={theme} />}
                  {viewMode === 'survival' && researchState.survivalMetrics && (
                    <GeneTerrain 
                      targets={researchState.targets.map(t => ({ ...t, value: researchState.survivalMetrics?.[t.symbol]?.delta || 0 }))} 
                      selectedId={researchState.targets.find(t=>t.symbol===researchState.focusSymbol)?.id} 
                      onSelect={(t)=>setResearchState(p=>({...p, focusSymbol: t?.symbol || null}))} 
                      theme={theme} 
                      mode="survival"
                    />
                  )}
                  {viewMode === 'raw' && <RawDataView targets={researchState.targets} theme={theme} />}
                </>
              )}
           </div>
        </section>

        {researchState.focusSymbol && (
          <>
            <aside className={`border-l flex flex-col gap-8 overflow-y-auto scrollbar-thin transition-all duration-300 ${isRightSidebarOpen ? 'w-[420px]' : 'w-0 opacity-0 pointer-events-none border-l-0'} ${theme === 'dark' ? 'bg-[#0d0d0d] border-neutral-800' : 'bg-white border-neutral-100 shadow-sm'} p-8`}>
              {(() => {
                const t = researchState.targets.find(x => x.symbol === researchState.focusSymbol);
                if (!t) return null;
                return (
                  <>
                    <div className="flex items-start justify-between border-b border-neutral-100 dark:border-neutral-800 pb-6">
                      <div>
                        <h3 className="text-3xl font-extrabold text-blue-600 dark:text-blue-500 tracking-tight">{t.symbol}</h3>
                        <p className={`text-[12px] font-bold uppercase tracking-wide mt-2 ${theme === 'dark' ? 'text-neutral-500' : 'text-neutral-600'}`}>{t.name}</p>
                      </div>
                      <button onClick={() => setIsRightSidebarOpen(false)} className="p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded transition-colors"><PanelRight className="w-4 h-4 text-neutral-400" /></button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      {[ 
                        {l:'Genetic',v:t.geneticScore, c:'emerald'}, 
                        {l:'Expression',v:t.combinedExpression || 0, c:'blue'}, 
                        {l:'Target',v:t.targetScore, c:'amber'}, 
                        {l:'Priority',v:t.overallScore, c:'indigo'} 
                      ].map(s=>(
                        <div key={s.l} className={`p-4 rounded-lg border shadow-sm ${theme === 'dark' ? 'bg-[#171717] border-neutral-800' : 'bg-neutral-50 border-neutral-200'}`}>
                          <div className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${theme === 'dark' ? 'text-neutral-400' : 'text-neutral-500'}`}>{s.l}</div>
                          <div className={`text-lg font-bold font-mono tracking-tight ${theme === 'dark' ? 'text-white' : 'text-neutral-900'}`}>{s.v.toFixed(3)}</div>
                        </div>
                      ))}
                    </div>
                    <DrugLandscape targetId={t.id} theme={theme} />
                    <LiteratureStats symbol={t.symbol} diseaseName={researchState.activeDisease?.name || "Evidence"} theme={theme} />
                  </>
                )
              })()}
            </aside>
            {!isRightSidebarOpen && (
              <button 
                onClick={() => setIsRightSidebarOpen(true)} 
                className="absolute right-4 bottom-4 z-20 p-2.5 rounded-full bg-blue-600 text-white shadow-lg hover:scale-105 transition-transform"
                title="Open Details Panel"
              >
                <PanelRight className="w-5 h-5" />
              </button>
            )}
          </>
        )}
      </main>
    </div>
  );
};

const SignInPage = ({ theme, toggleTheme, onSignIn }: { theme: Theme, toggleTheme: () => void, onSignIn: (user: string) => void }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  return (
    <div className={`h-screen flex items-center justify-center transition-colors ${theme === 'dark' ? 'bg-[#0a0a0a]' : 'bg-neutral-50'}`}>
      <div className={`w-full max-w-sm p-10 rounded-xl border animate-in fade-in zoom-in duration-300 ${theme === 'dark' ? 'bg-[#171717] border-neutral-800 shadow-2xl' : 'bg-white border-neutral-200 shadow-xl'}`}>
        <div className="flex flex-col items-center gap-4 mb-10 text-center">
          <div className="p-3 bg-blue-600 rounded shadow-md">
            <FlaskConical className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className={`text-2xl font-extrabold tracking-tight ${theme === 'light' ? 'text-neutral-900' : 'text-white'}`}>Get<span className="text-blue-600">Gene</span></h1>
            <p className={`text-[11px] font-bold uppercase tracking-[0.2em] mt-1 ${theme === 'light' ? 'text-neutral-600' : 'text-neutral-400'}`}>Portal Login</p>
          </div>
        </div>
        <form onSubmit={e=>{e.preventDefault(); if(password===HARDCODED_PASSWORD) onSignIn("Researcher");}} className="space-y-4">
          <input 
            type="email" 
            value={email} 
            onChange={e=>setEmail(e.target.value)} 
            className={`w-full p-3.5 rounded-lg border text-sm font-bold outline-none transition-all ${theme === 'dark' ? 'bg-[#0a0a0a] border-neutral-800 focus:border-blue-600 text-white placeholder-neutral-600' : 'bg-neutral-50 border-neutral-200 focus:border-blue-500 text-neutral-900 placeholder-neutral-400'}`} 
            placeholder="xxxx@uab.edu" 
          />
          <input 
            type="password" 
            value={password} 
            onChange={e=>setPassword(e.target.value)} 
            className={`w-full p-3.5 rounded-lg border text-sm font-bold outline-none transition-all ${theme === 'dark' ? 'bg-[#0a0a0a] border-neutral-800 focus:border-blue-600 text-white placeholder-neutral-600' : 'bg-neutral-50 border-neutral-200 focus:border-blue-500 text-neutral-900 placeholder-neutral-400'}`} 
            placeholder="Password" 
          />
          <button 
            type="submit" 
            className="w-full p-3.5 bg-blue-600 text-white rounded-lg font-bold uppercase text-[12px] tracking-widest hover:bg-blue-700 transition-all shadow-md active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <ShieldCheck className="w-4 h-4" />
            Authenticate
          </button>
        </form>
        <div className="mt-8 pt-8 border-t border-neutral-100 dark:border-neutral-800 flex justify-center">
          <button onClick={toggleTheme} className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded transition-colors">
            {theme === 'dark' ? <Sun className="w-4 h-4 text-neutral-400" /> : <Moon className="w-4 h-4 text-neutral-500" />}
          </button>
        </div>
      </div>
    </div>
  );
};

const rootElement = document.getElementById('root');
if (rootElement) createRoot(rootElement).render(<App />);