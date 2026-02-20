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
  Maximize,
  TableProperties,
  Plus,
  ArrowUpDown,
  HelpCircle,
  X,
  FileDown,
  ChevronDown
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

// --- Helper Components for Visualization ---

const RadarChart = ({ target, theme }: { target: Target, theme: Theme }) => {
  const size = 200;
  const center = size / 2;
  const radius = size * 0.4;
  
  const axes = [
    { label: 'Genetic', val: target.geneticScore },
    { label: 'Clinical', val: target.combinedExpression || 0 },
    { label: 'Target', val: target.targetScore },
    { label: 'Priority', val: target.overallScore }
  ];

  const points = axes.map((a, i) => {
    const angle = (Math.PI * 2 * i) / axes.length - Math.PI / 2;
    const x = center + radius * a.val * Math.cos(angle);
    const y = center + radius * a.val * Math.sin(angle);
    return `${x},${y}`;
  }).join(' ');

  const gridLevels = [0.25, 0.5, 0.75, 1.0];

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} className="overflow-visible">
        {/* Grids */}
        {gridLevels.map(level => (
          <circle
            key={level}
            cx={center}
            cy={center}
            r={radius * level}
            fill="none"
            stroke={theme === 'dark' ? '#334155' : '#cbd5e1'}
            strokeDasharray="2,2"
          />
        ))}
        {/* Axes */}
        {axes.map((a, i) => {
          const angle = (Math.PI * 2 * i) / axes.length - Math.PI / 2;
          const x2 = center + radius * Math.cos(angle);
          const y2 = center + radius * Math.sin(angle);
          return (
            <g key={i}>
              <line x1={center} y1={center} x2={x2} y2={y2} stroke={theme === 'dark' ? '#334155' : '#cbd5e1'} />
              <text
                x={center + (radius + 20) * Math.cos(angle)}
                y={center + (radius + 15) * Math.sin(angle)}
                textAnchor="middle"
                fontSize="9"
                fontWeight="bold"
                className={theme === 'dark' ? 'fill-neutral-500' : 'fill-neutral-600'}
              >
                {a.label}
              </text>
            </g>
          );
        })}
        {/* Data Shape */}
        <polygon
          points={points}
          fill="rgba(59, 130, 246, 0.3)"
          stroke="#3b82f6"
          strokeWidth="2"
        />
      </svg>
    </div>
  );
};

const PipelineProgress = ({ phase }: { phase: number }) => {
  const steps = [1, 2, 3, 4];
  return (
    <div className="flex items-center gap-1 w-full max-w-[120px]">
      {steps.map(s => (
        <div 
          key={s} 
          className={`h-1.5 flex-1 rounded-full transition-all ${s <= phase ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.4)]' : 'bg-neutral-200 dark:bg-neutral-800'}`}
          title={`Phase ${s}`}
        />
      ))}
    </div>
  );
};

const PublicationSparkline = ({ recent, total, theme }: { recent: number, total: number, theme: Theme }) => {
  // Mock sparkline based on recent vs total
  const width = 140;
  const height = 30;
  const points = [5, 12, 8, 15, 10, 22, 14, recent > 0 ? 25 : 12];
  const step = width / (points.length - 1);
  const path = points.map((p, i) => `${i * step},${height - p}`).join(' L ');

  return (
    <div className="relative">
      <svg width={width} height={height} className="overflow-visible">
        <path
          d={`M 0,${height} L ${path} L ${width},${height} Z`}
          fill="url(#sparkline-grad)"
          opacity="0.2"
        />
        <path
          d={`M 0,${height - points[0]} L ${path}`}
          fill="none"
          stroke="#3b82f6"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <defs>
          <linearGradient id="sparkline-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="transparent" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
};

// --- Force Directed Layout Utilities ---

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

function getGetVector(t: Target) {
  return [t.geneticScore ?? 0, t.combinedExpression ?? 0, t.targetScore ?? 0];
}

function computeForcePositions(targets: Target[], width = 800, height = 600) {
  const nodes = targets.map((t, i) => ({ 
    id: t.id, 
    symbol: t.symbol, 
    r: 6 + (t.overallScore * 6),
    x: width / 2 + Math.cos(i) * 50,
    y: height / 2 + Math.sin(i) * 50
  }));
  const vectors = targets.map(getGetVector);
  const links: any[] = [];
  for (let i = 0; i < targets.length; i++) {
    for (let j = i + 1; j < targets.length; j++) {
      const r = pearson(vectors[i], vectors[j]);
      links.push({ source: targets[i].id, target: targets[j].id, weight: Math.abs(r), sign: r });
    }
  }
  const sim = (d3 as any).forceSimulation(nodes as any)
    .force("link", (d3 as any).forceLink(links).id((d: any) => d.id)
      .strength((l: any) => 0.05 + 0.45 * (l.weight ?? 0))
      .distance((l: any) => 300 * (1 - (l.weight ?? 0)) + 40))
    .force("charge", (d3 as any).forceManyBody().strength(-150))
    .force("collide", (d3 as any).forceCollide((d: any) => d.r + 10))
    .force("center", (d3 as any).forceCenter(width / 2, height / 2));
  for (let i = 0; i < 300; i++) sim.tick();
  sim.stop();
  const xs = nodes.map(n => n.x), ys = nodes.map(n => n.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const padding = 0.05, rangeX = (maxX - minX) || 1, rangeY = (maxY - minY) || 1;
  const posMap = new Map<string, { x: number, y: number, nx: number, ny: number }>();
  nodes.forEach((n: any) => {
    const nx = padding + (1 - 2 * padding) * (n.x - minX) / rangeX;
    const ny = padding + (1 - 2 * padding) * (n.y - minY) / rangeY;
    posMap.set(n.id, { x: nx * width, y: ny * height, nx, ny });
  });
  return { positionsById: posMap, links };
}

const isPointInCircle = (px: number, py: number, cx: number, cy: number, r: number) => {
  return Math.sqrt((px - cx) ** 2 + (py - cy) ** 2) < r;
};

const getSigmaForZoom = (scale: number) => 35 / scale;

const CorrelationView = ({ targets, theme }: { targets: Target[], theme: Theme }) => {
  const correlations = useMemo(() => {
    const pairs: { a: Target, b: Target, r: number, absR: number }[] = [];
    const vectors = targets.map(getGetVector);
    for (let i = 0; i < targets.length; i++) {
      for (let j = i + 1; j < targets.length; j++) {
        const r = pearson(vectors[i], vectors[j]);
        pairs.push({ a: targets[i], b: targets[j], r, absR: Math.abs(r) });
      }
    }
    return pairs.sort((a, b) => b.absR - a.absR);
  }, [targets]);
  return (
    <div className="h-full overflow-auto">
      <table className="w-full text-left">
        <thead className={`sticky top-0 z-10 text-[10px] font-bold uppercase tracking-widest border-b ${theme === 'dark' ? 'bg-[#171717] border-neutral-800 text-neutral-500' : 'bg-neutral-50 border-neutral-200 text-neutral-700'}`}>
          <tr><th className="p-4 pl-8">Target A</th><th className="p-4">Target B</th><th className="p-4 text-center">Direction</th><th className="p-4 text-center">R Value</th><th className="p-4 pr-8 text-right">Abs. Correlation</th></tr>
        </thead>
        <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {correlations.map((p, idx) => (
            <tr key={`${p.a.id}-${p.b.id}`} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/20 transition-colors">
              <td className="p-4 pl-8 font-bold text-blue-600 dark:text-blue-500 text-[13px]">{p.a.symbol}</td>
              <td className="p-4 font-bold text-blue-600 dark:text-blue-500 text-[13px]">{p.b.symbol}</td>
              <td className="p-4 text-center"><span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${p.r >= 0 ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'}`}>{p.r >= 0 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}{p.r >= 0 ? 'Positive' : 'Negative'}</span></td>
              <td className={`p-4 text-center font-mono text-[11px] ${theme === 'dark' ? 'text-neutral-500' : 'text-neutral-600'}`}>{p.r.toFixed(4)}</td>
              <td className="p-4 pr-8 text-right font-mono font-bold text-neutral-800 dark:text-neutral-300 text-[12px]">{p.absR.toFixed(4)}</td>
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
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas || !containerRef.current) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = containerRef.current.getBoundingClientRect();
    canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.save(); ctx.translate(transform.x, transform.y); ctx.scale(transform.k, transform.k);
    const scaleX = rect.width / 800, scaleY = rect.height / 600, baseScale = Math.min(scaleX, scaleY);
    links.forEach(l => {
      if (l.weight < 0.3) return;
      const s = positionsById.get(typeof l.source === 'string' ? l.source : l.source.id);
      const t = positionsById.get(typeof l.target === 'string' ? l.target : l.target.id);
      if (s && t) {
        ctx.beginPath(); ctx.moveTo(s.x * baseScale, s.y * baseScale); ctx.lineTo(t.x * baseScale, t.y * baseScale);
        const rgb = l.sign >= 0 ? '239, 68, 68' : '59, 130, 246';
        ctx.strokeStyle = `rgba(${rgb}, ${0.05 + l.weight * 0.15})`;
        ctx.lineWidth = (0.5 + l.weight * 2.5) / transform.k;
        ctx.stroke();
      }
    });
    targets.forEach(t => {
      const pos = positionsById.get(t.id); if (!pos) return;
      const isSel = t.symbol === selectedId;
      const r = 6 + (t.overallScore * 6);
      ctx.beginPath(); ctx.arc(pos.x * baseScale, pos.y * baseScale, isSel ? r + 3 : r, 0, Math.PI * 2);
      ctx.fillStyle = isSel ? '#3b82f6' : (theme === 'dark' ? '#334155' : '#94a3b8');
      ctx.fill();
      if (isSel || (t.overallScore > 0.6 && transform.k > 0.5)) {
        ctx.fillStyle = theme === 'dark' ? '#f1f5f9' : '#0f172a';
        ctx.font = `500 ${10 / transform.k}px Inter`; ctx.textAlign = 'center';
        ctx.fillText(t.symbol, pos.x * baseScale, pos.y * baseScale + r + (14 / transform.k));
      }
    });
    ctx.restore();
  }, [targets, selectedId, theme, positionsById, links, transform]);
  return (
    <div ref={containerRef} className="w-full h-full relative bg-transparent overflow-hidden" onWheel={e => { e.preventDefault(); setTransform(prev => ({ ...prev, k: Math.max(0.1, Math.min(10, prev.k * (e.deltaY > 0 ? 0.9 : 1.1))) })); }} onMouseDown={e => {
      const startX = e.clientX, startY = e.clientY, startTx = transform.x, startTy = transform.y;
      const onMouseMove = (me: MouseEvent) => setTransform(prev => ({ ...prev, x: startTx + (me.clientX - startX), y: startTy + (me.clientY - startY) }));
      const onMouseUp = () => { window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('mouseup', onMouseUp); };
      window.addEventListener('mousemove', onMouseMove); window.addEventListener('mouseup', onMouseUp);
    }}>
      <canvas ref={canvasRef} className="w-full h-full cursor-grab active:cursor-grabbing" onClick={(e) => {
          const rect = canvasRef.current!.getBoundingClientRect();
          const mx = (e.clientX - rect.left - transform.x) / transform.k, my = (e.clientY - rect.top - transform.y) / transform.k;
          const scaleX = rect.width / 800, scaleY = rect.height / 600, baseScale = Math.min(scaleX, scaleY);
          const hit = targets.find(t => { const pos = positionsById.get(t.id); return pos && isPointInCircle(mx, my, pos.x * baseScale, pos.y * baseScale, 20 / transform.k); });
          onSelect(hit || null);
      }}/>
      <div className="absolute top-6 right-6 flex flex-col gap-2">
        <button onClick={() => setTransform(prev => ({ ...prev, k: prev.k * 1.2 }))} className={`p-2 rounded-md border shadow-sm ${theme === 'dark' ? 'bg-[#171717] border-neutral-800 text-neutral-400' : 'bg-white border-neutral-200 text-neutral-600'} hover:bg-neutral-50 transition-colors`}><ZoomIn className="w-4 h-4" /></button>
        <button onClick={() => setTransform(prev => ({ ...prev, k: prev.k * 0.8 }))} className={`p-2 rounded-md border shadow-sm ${theme === 'dark' ? 'bg-[#171717] border-neutral-800 text-neutral-400' : 'bg-white border-neutral-200 text-neutral-600'} hover:bg-neutral-50 transition-colors`}><ZoomOut className="w-4 h-4" /></button>
        <button onClick={() => setTransform({ x: 0, y: 0, k: 1 })} className={`p-2 rounded-md border shadow-sm ${theme === 'dark' ? 'bg-[#171717] border-neutral-800 text-neutral-400' : 'bg-white border-neutral-200 text-neutral-600'} hover:bg-neutral-50 transition-colors`}><Maximize className="w-4 h-4" /></button>
      </div>
    </div>
  );
};

const GeneTerrain = ({ targets, onSelect, selectedId, theme, mode = 'default', survivalMetrics, medianOs }: { targets: Target[], onSelect: (t: Target | null) => void, selectedId: string | undefined, theme: Theme, mode?: 'default' | 'survival', survivalMetrics?: SurvivalMetrics, medianOs?: number }) => {
  const glCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const shadersRef = useRef<{ [key: string]: WebGLProgram }>({});
  const pointsTexRef = useRef<WebGLTexture | null>(null);
  const valuesTexRef = useRef<WebGLTexture | null>(null);
  const bufferRef = useRef<WebGLBuffer | null>(null);
  const [viewport, setViewport] = useState({ scale: 1.0, offset: { x: 0, y: 0 } });
  const [currentLayer, setCurrentLayer] = useState<TerrainLayer>('gaussian');
  const [survivalTab, setSurvivalTab] = useState<'default' | 'high' | 'low'>('default');
  const [terrainGain, setTerrainGain] = useState(1.5);
  const [dragging, setDragging] = useState(false);
  const [lastMouse, setLastMouse] = useState<{x:number, y:number} | null>(null);
  const { positionsById } = useMemo(() => computeForcePositions(targets, 800, 600), [targets]);

  const mappedTargets = useMemo(() => {
    return targets.map((t) => {
      const pos = positionsById.get(t.id);
      const x = pos?.x ?? 400, y = pos?.y ?? 300;
      let value = 0.45 * (t.geneticScore || 0) + 0.25 * (t.combinedExpression || 0) + 0.30 * (t.targetScore || 0);
      let status: 'up' | 'down' | 'neutral' = 'neutral';
      if (mode === 'survival' && survivalMetrics && survivalMetrics[t.symbol]) {
        const met = survivalMetrics[t.symbol];
        if (survivalTab === 'high') { value = met.highDiff; status = met.highStatus; }
        else if (survivalTab === 'low') { value = met.lowDiff; status = met.lowStatus; }
      }
      return { ...t, x, y, value, status };
    });
  }, [targets, positionsById, mode, survivalMetrics, survivalTab]);

  const initShader = (gl: WebGLRenderingContext, vs: string, fs: string) => {
    const vShader = gl.createShader(gl.VERTEX_SHADER)!; gl.shaderSource(vShader, vs); gl.compileShader(vShader);
    const fShader = gl.createShader(gl.FRAGMENT_SHADER)!; gl.shaderSource(fShader, fs); gl.compileShader(fShader);
    const prog = gl.createProgram()!; gl.attachShader(prog, vShader); gl.attachShader(prog, fShader); gl.linkProgram(prog);
    return prog;
  };

  const draw = useCallback(() => {
    const gl = glRef.current; if (!gl || !glCanvasRef.current) return;
    if (!shadersRef.current[currentLayer]) {
      let fsSource = terrainFragmentShader;
      if (currentLayer === 'discrete') fsSource = contourFragmentShader;
      else if (currentLayer === 'water') fsSource = peaksFragmentShader;
      else if (currentLayer === 'sky') fsSource = valleyFragmentShader;
      shadersRef.current[currentLayer] = initShader(gl, vertexShaderSource, fsSource);
    }
    const prog = shadersRef.current[currentLayer]; gl.useProgram(prog);
    if (!pointsTexRef.current) pointsTexRef.current = gl.createTexture();
    const pointsData = new Float32Array(MAX_WebGL_POINTS * 4), valuesData = new Float32Array(MAX_WebGL_POINTS * 4);
    const count = Math.min(mappedTargets.length, MAX_WebGL_POINTS);
    mappedTargets.slice(0, count).forEach((t, i) => { pointsData[i*4] = t.x!; pointsData[i*4+1] = t.y!; valuesData[i*4] = t.value! * terrainGain; });
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, pointsTexRef.current);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, MAX_WebGL_POINTS, 1, 0, gl.RGBA, gl.FLOAT, pointsData);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    if (!valuesTexRef.current) valuesTexRef.current = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, valuesTexRef.current);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, MAX_WebGL_POINTS, 1, 0, gl.RGBA, gl.FLOAT, valuesData);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.uniform1i(gl.getUniformLocation(prog, "pointsTexture"), 0); gl.uniform1i(gl.getUniformLocation(prog, "valuesTexture"), 1);
    gl.uniform1i(gl.getUniformLocation(prog, "pointCount"), count); gl.uniform1f(gl.getUniformLocation(prog, "sigma"), getSigmaForZoom(viewport.scale));
    gl.uniform2f(gl.getUniformLocation(prog, "resolution"), 800, 600); gl.uniform2f(gl.getUniformLocation(prog, "offset"), viewport.offset.x, viewport.offset.y);
    gl.uniform1f(gl.getUniformLocation(prog, "scale"), viewport.scale);
    let rMode = (mode === 'survival' && survivalTab !== 'default') ? 1 : 0;
    gl.uniform1i(gl.getUniformLocation(prog, "renderMode"), rMode);
    if (currentLayer === 'discrete') { gl.uniform1f(gl.getUniformLocation(prog, "lineThickness"), 0.015); gl.uniform1f(gl.getUniformLocation(prog, "isolineSpacing"), 0.25); }
    if (!bufferRef.current) { bufferRef.current = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bufferRef.current); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW); } else gl.bindBuffer(gl.ARRAY_BUFFER, bufferRef.current);
    const posAttrib = gl.getAttribLocation(prog, "position"); gl.enableVertexAttribArray(posAttrib); gl.vertexAttribPointer(posAttrib, 2, gl.FLOAT, false, 0, 0);
    gl.viewport(0, 0, 800, 600); gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    const ctx = overlayCanvasRef.current?.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, 800, 600); ctx.save(); ctx.setTransform(viewport.scale, 0, 0, viewport.scale, viewport.offset.x, viewport.offset.y);
      mappedTargets.forEach(t => {
        const isSelected = t.id === selectedId;
        if (isSelected) {
          ctx.beginPath(); ctx.arc(t.x!, t.y!, 8 / viewport.scale, 0, Math.PI * 2); ctx.fillStyle = 'rgba(59, 130, 246, 0.25)'; ctx.fill();
          ctx.beginPath(); ctx.arc(t.x!, t.y!, 5.5 / viewport.scale, 0, Math.PI * 2); ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 1.5 / viewport.scale; ctx.stroke();
        }
        let pointColor = isSelected ? '#3b82f6' : (theme === 'dark' ? '#475569' : '#94a3b8');
        let finalRadius = (isSelected ? 5 : 2.5) / viewport.scale;
        let strokeColor: string | null = null;
        let glowColor: string | null = null;
        if (mode === 'survival' && survivalTab !== 'default') {
          // Gene plots are forced to grey as requested
          pointColor = theme === 'dark' ? '#6b7280' : '#9ca3af'; 
          if (t.status === 'up' || t.status === 'down') {
            finalRadius *= 1.2;
          }
          strokeColor = theme === 'dark' ? '#111111' : '#ffffff';
          glowColor = null; 
        } else if (!isSelected) {
          const brightness = Math.min(1, Math.abs(t.value) || 0);
          pointColor = theme === 'dark' ? `rgba(${140 + brightness * 80}, ${140 + brightness * 80}, ${140 + brightness * 80}, ${0.45 + brightness * 0.45})` : `rgba(${60 - brightness * 30}, ${60 - brightness * 30}, ${60 - brightness * 30}, ${0.55 + brightness * 0.4})`;
        }
        if (glowColor) { ctx.shadowBlur = 10 / viewport.scale; ctx.shadowColor = glowColor; }
        ctx.beginPath(); ctx.arc(t.x!, t.y!, finalRadius, 0, Math.PI * 2); ctx.fillStyle = pointColor; ctx.fill();
        if (strokeColor) { ctx.strokeStyle = strokeColor; ctx.lineWidth = 1.2 / viewport.scale; ctx.stroke(); }
        ctx.shadowBlur = 0;
        if (viewport.scale > 1.2) { ctx.font = `bold ${10 / viewport.scale}px Inter`; ctx.fillStyle = theme === 'dark' ? '#f5f5f5' : '#1e293b'; ctx.textAlign = 'center'; ctx.fillText(t.symbol, t.x!, t.y! + (finalRadius + 8 / viewport.scale)); }
      });
      ctx.restore();
    }
  }, [mappedTargets, viewport, currentLayer, terrainGain, selectedId, theme, mode, survivalTab]);

  useEffect(() => {
    const canvas = glCanvasRef.current; if (canvas) { glRef.current = canvas.getContext('webgl', { preserveDrawingBuffer: true, antialias: true }); glRef.current?.getExtension('OES_texture_float'); }
    return () => { const gl = glRef.current; if (gl) { if (pointsTexRef.current) gl.deleteTexture(pointsTexRef.current); if (valuesTexRef.current) gl.deleteTexture(valuesTexRef.current); if (bufferRef.current) gl.deleteBuffer(bufferRef.current); Object.values(shadersRef.current).forEach(p => gl.deleteProgram(p)); } };
  }, []);

  useEffect(() => { let frameId: number; const loop = () => { draw(); frameId = requestAnimationFrame(loop); }; frameId = requestAnimationFrame(loop); return () => cancelAnimationFrame(frameId); }, [draw]);

  return (
    <div className={`relative w-full h-full rounded-xl overflow-hidden border flex flex-col ${theme === 'dark' ? 'bg-[#0a0a0a] border-neutral-800' : 'bg-white border-neutral-200 shadow-sm'}`}>
      {mode === 'survival' && (
        <div className={`px-4 py-2 flex items-center justify-between border-b ${theme === 'dark' ? 'bg-[#0d0d0d] border-neutral-800' : 'bg-neutral-50 border-neutral-100'}`}>
          <div className="flex items-center gap-1">
            <button onClick={() => setSurvivalTab('default')} className={`px-4 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all ${survivalTab === 'default' ? 'bg-blue-500 text-white shadow-sm' : 'text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-800'}`}>Default Terrain</button>
            <button onClick={() => setSurvivalTab('high')} className={`px-4 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all ${survivalTab === 'high' ? 'bg-emerald-600 text-white shadow-sm' : 'text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-800'}`}>High Survival (Survivors)</button>
            <button onClick={() => setSurvivalTab('low')} className={`px-4 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all ${survivalTab === 'low' ? 'bg-rose-600 text-white shadow-sm' : 'text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-800'}`}>Low Survival (Non-Survivors)</button>
          </div>
        </div>
      )}
      <div className="flex-1 relative">
        <canvas ref={glCanvasRef} width={800} height={600} className="absolute inset-0 w-full h-full" />
        <canvas ref={overlayCanvasRef} width={800} height={600} className="absolute inset-0 w-full h-full cursor-default" onMouseDown={e => { setDragging(true); setLastMouse({ x: e.clientX, y: e.clientY }); const rect = overlayCanvasRef.current!.getBoundingClientRect(); const x = (e.clientX - rect.left - viewport.offset.x) / viewport.scale, y = (e.clientY - rect.top - viewport.offset.y) / viewport.scale; const hit = mappedTargets.find(t => isPointInCircle(x, y, t.x!, t.y!, 10 / viewport.scale)); if (hit) onSelect(hit); }} onMouseMove={e => { if (dragging && lastMouse) { setViewport(prev => ({ ...prev, offset: { x: prev.offset.x + (e.clientX - lastMouse.x), y: prev.offset.y + (e.clientY - lastMouse.y) } })); setLastMouse({ x: e.clientX, y: e.clientY }); } }} onMouseUp={() => setDragging(false)} onWheel={e => setViewport(prev => ({ ...prev, scale: Math.max(0.5, Math.min(6, prev.scale * (e.deltaY > 0 ? 0.95 : 1.05))) }))} />
        <div className="absolute top-6 left-6 flex flex-col gap-3">
          <div className={`p-1 rounded-lg border flex flex-col gap-1 shadow-sm ${theme === 'dark' ? 'bg-[#171717] border-neutral-800' : 'bg-white border-neutral-200'}`}>{[ { id: 'gaussian', icon: Globe2, name: 'Evidence Intensity' }, { id: 'discrete', icon: Layers, name: 'Confidence Contours' }, { id: 'water', icon: FlaskConical, name: 'Drugability Peaks' }, { id: 'sky', icon: Microscope, name: 'Genetic Valleys' } ].map(l => (<button key={l.id} title={l.name} onClick={() => setCurrentLayer(l.id as TerrainLayer)} className={`p-2 rounded-md transition-colors ${currentLayer === l.id ? 'bg-blue-500 text-white' : 'text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800'}`}><l.icon className="w-4 h-4" /></button>))}</div>
          <div className={`p-3 rounded-lg border flex flex-col gap-2 shadow-sm ${theme === 'dark' ? 'bg-[#171717] border-neutral-800' : 'bg-white border-neutral-200'}`}><div className="flex items-center gap-2"><Volume2 className="w-3.5 h-3.5 text-neutral-400" /><span className="text-[10px] font-bold text-neutral-600 dark:text-neutral-500 uppercase">Amplification</span></div><input type="range" min="0.5" max="3.5" step="0.1" value={terrainGain} onChange={(e) => setTerrainGain(parseFloat(e.target.value))} className="w-20 h-1 bg-neutral-200 rounded-full appearance-none cursor-pointer accent-blue-500"/></div>
        </div>
        <div className="absolute bottom-6 right-6 flex gap-2"><button onClick={() => setViewport({ scale: 1.0, offset: { x: 0, y: 0 } })} className={`p-2 rounded-md border shadow-sm ${theme === 'dark' ? 'bg-[#171717] border-neutral-800 text-neutral-400' : 'bg-white border-neutral-200 text-neutral-700'} hover:bg-neutral-50 transition-colors`}><RotateCcw className="w-4 h-4" /></button>
          <div className="flex rounded-md border shadow-sm overflow-hidden bg-white border-neutral-200 dark:bg-[#171717] dark:border-neutral-800"><button onClick={() => setViewport(v => ({ ...v, scale: Math.min(6, v.scale * 1.2) }))} className="p-2 border-r border-neutral-200 dark:border-neutral-800"><ZoomIn className="w-4 h-4 text-neutral-500" /></button><button onClick={() => setViewport(v => ({ ...v, scale: Math.max(0.5, v.scale * 0.8) }))} className="p-2"><ZoomOut className="w-4 h-4 text-neutral-500" /></button></div>
        </div>
      </div>
      {mode === 'survival' && survivalTab !== 'default' && (
        <div className={`p-4 border-t ${theme === 'dark' ? 'bg-[#0d0d0d] border-neutral-800' : 'bg-blue-50 border-neutral-100'}`}>
          <div className="flex items-center gap-2 mb-1"><Info className="w-3.5 h-3.5 text-blue-500" /><span className="text-[11px] font-bold text-blue-600 uppercase">Independent Outcome Landscape</span></div>
          <p className="text-[11px] text-neutral-600 dark:text-neutral-400 leading-relaxed italic">{survivalTab === 'high' ? "Direct mapping of mean expression for long-surviving patients. Highlights areas of baseline molecular intensity in this cohort." : "Direct mapping of mean expression for short-surviving patients. Highlights areas of baseline molecular intensity in this cohort."}</p>
        </div>
      )}
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
  useEffect(() => { const fetchClinical = async () => { setLoadingClinical(true); const data = await api.getBrcaClinical(offset); setClinicalData(data); setLoadingClinical(false); }; fetchClinical(); }, [offset]);
  const handleSelectSample = async (sample: ClinicalSample) => { setSelectedSample(sample); setLoadingExpression(true); const data = await api.getBrcaExpression(sample.sampleid); setExpressionData(data); setLoadingExpression(false); };
  const filteredExpression = useMemo(() => { if (!showOnlyGetGenes) return expressionData; return expressionData.filter(row => getTargetSymbols.has(row.gene_symbol)); }, [expressionData, getTargetSymbols, showOnlyGetGenes]);
  return (
    <div className="h-full flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-neutral-100 dark:divide-neutral-800">
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between"><div className="flex items-center gap-2"><Stethoscope className="w-4 h-4 text-neutral-500" /><span className="text-[12px] font-semibold text-neutral-700 dark:text-neutral-400">Cohort Explorer</span></div><div className="flex items-center gap-2"><button onClick={() => setOffset(Math.max(0, offset - 10))} disabled={offset === 0} className="p-1 rounded hover:bg-neutral-100 transition-colors"><ChevronLeft className="w-4 h-4" /></button><span className="text-[10px] font-mono text-neutral-600 dark:text-neutral-500">P. {offset/10 + 1}</span><button onClick={() => setOffset(offset + 10)} className="p-1 rounded hover:bg-neutral-100 transition-colors"><ChevronRight className="w-4 h-4" /></button></div></div>
        <div className="flex-1 overflow-auto">{loadingClinical ? (<div className="h-full flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>) : (<table className="w-full text-left"><thead className="sticky top-0 bg-neutral-50 dark:bg-neutral-900 border-b border-neutral-100 dark:border-neutral-800 z-10"><tr><th className="p-4 text-[10px] font-bold text-neutral-600 dark:text-neutral-500 uppercase pl-6">Sample ID</th><th className="p-4 text-[10px] font-bold text-neutral-600 dark:text-neutral-500 uppercase">Type</th><th className="p-4 pr-6 text-right text-[10px] font-bold text-neutral-600 dark:text-neutral-500 uppercase">Status</th></tr></thead><tbody className="divide-y divide-neutral-50 dark:divide-neutral-800">{clinicalData.map(sample => (<tr key={sample.sampleid} onClick={() => handleSelectSample(sample)} className={`cursor-pointer transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/50 ${selectedSample?.sampleid === sample.sampleid ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}><td className="p-4 pl-6 font-mono text-[11px] text-blue-600 dark:text-blue-400">{sample.sampleid}</td><td className="p-4 text-[11px] text-neutral-700 dark:text-neutral-400">{sample.vital_status === 'Alive' ? 'Alive' : 'Deceased'}</td><td className={`p-4 pr-6 text-right text-[11px] font-medium ${sample.vital_status === 'Alive' ? 'text-emerald-600' : 'text-rose-600'}`}>{sample.vital_status}</td></tr>))}</tbody></table>)}</div>
      </div>
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between"><div className="flex items-center gap-2"><Activity className="w-4 h-4 text-neutral-500" /><span className="text-[12px] font-semibold text-neutral-700 dark:text-neutral-400">Sample Expression</span></div><button onClick={() => setShowOnlyGetGenes(!showOnlyGetGenes)} className={`text-[10px] font-bold px-3 py-1 rounded border transition-colors ${showOnlyGetGenes ? 'bg-blue-500 text-white' : 'text-neutral-500'}`}>{showOnlyGetGenes ? 'FILTERED' : 'ALL'}</button></div>
        <div className="flex-1 overflow-auto">{!selectedSample ? (<div className="h-full flex flex-col items-center justify-center p-12 text-center text-neutral-400"><DatabaseZap className="w-8 h-8 mb-4 opacity-10" /><p className="text-sm font-medium">Select a patient sample</p></div>) : loadingExpression ? (<div className="h-full flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>) : (<table className="w-full text-left"><thead className="sticky top-0 bg-neutral-50 dark:bg-neutral-900 border-b border-neutral-100 dark:border-neutral-800 z-10"><tr><th className="p-4 text-[10px] font-bold text-neutral-600 dark:text-neutral-500 uppercase pl-6">Gene</th><th className="p-4 text-[10px] font-bold text-neutral-600 dark:text-neutral-500 uppercase text-center">In List</th><th className="p-4 pr-6 text-right text-[10px] font-bold text-neutral-600 dark:text-neutral-500 uppercase">TPM Value</th></tr></thead><tbody className="divide-y divide-neutral-50 dark:divide-neutral-800">{filteredExpression.map(row => { const isGetGene = getTargetSymbols.has(row.gene_symbol); return (<tr key={row.gene_symbol} className={isGetGene ? 'bg-blue-50/20 dark:bg-blue-900/5' : ''}><td className={`p-4 pl-6 font-semibold text-[11px] ${isGetGene ? 'text-blue-600 dark:text-blue-400' : 'text-neutral-600 dark:text-neutral-300'}`}>{row.gene_symbol}</td><td className="p-4 text-center">{isGetGene && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mx-auto" />}</td><td className="p-4 pr-6 text-right font-mono text-[11px] text-neutral-600 dark:text-neutral-500">{parseFloat(row.value).toFixed(4)}</td></tr>); })}</tbody></table>)}</div>
      </div>
    </div>
  );
};

const DrugLandscape = ({ targetId, theme }: { targetId: string, theme: Theme }) => {
  const [drugs, setDrugs] = useState<DrugInfo[]>([]); const [loading, setLoading] = useState(false);
  useEffect(() => { let active = true; const fetch = async () => { setLoading(true); const res = await api.getTargetDrugs(targetId); if (active) { setDrugs(res); setLoading(false); } }; fetch(); return () => { active = false; }; }, [targetId]);
  if (loading) return <div className="flex items-center gap-3 py-4"><Loader2 className="w-4 h-4 animate-spin text-blue-500" /><span className="text-[11px] font-medium text-neutral-500">Mapping clinical pipeline...</span></div>;
  if (drugs.length === 0) return null;
  return (<div className="space-y-5"><div className="flex items-center gap-2"><Pill className="w-4 h-4 text-neutral-500" /><h4 className="text-[11px] font-bold uppercase text-neutral-600 dark:text-neutral-500">Pipeline Evidence</h4></div><div className="space-y-3">{drugs.slice(0, 4).map(d => (<div key={d.id} className={`p-4 rounded-lg border ${theme === 'dark' ? 'bg-[#171717] border-neutral-800' : 'bg-neutral-50 border-neutral-200 shadow-sm'}`}><div className="flex items-center justify-between mb-3"><span className="text-[11px] font-bold text-blue-600 dark:text-blue-500 uppercase">{d.name}</span><span className="text-[9px] font-bold text-neutral-500 dark:text-neutral-400 uppercase">PHASE {d.phase}</span></div><PipelineProgress phase={d.phase} /><p className={`text-[11px] leading-relaxed italic mt-3 ${theme === 'dark' ? 'text-neutral-400' : 'text-neutral-700'}`}>{d.mechanism}</p></div>))}</div></div>);
};

const LiteratureStats = ({ symbol, diseaseName, theme }: { symbol: string, diseaseName: string, theme: Theme }) => {
  const [stats, setStats] = useState<PubMedStats | null>(null); const [loading, setLoading] = useState(false);
  useEffect(() => { let active = true; const fetch = async () => { setLoading(true); const res = await api.getPubMedStats(symbol, diseaseName); if (active) { setStats(res); setLoading(false); } }; fetch(); return () => { active = false; }; }, [symbol, diseaseName]);
  if (loading) return <div className="flex items-center gap-3 py-6"><Loader2 className="w-4 h-4 animate-spin text-blue-500" /><span className="text-[11px] font-medium text-neutral-500">Retrieving PubMed analytics...</span></div>;
  if (!stats) return null;
  return (<div className="space-y-6"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><BookOpen className="w-4 h-4 text-neutral-500" /><h4 className="text-[11px] font-bold uppercase text-neutral-600 dark:text-neutral-500">Clinical Publications</h4></div><a href={stats.searchLink} target="_blank" rel="noopener noreferrer" className="text-[10px] font-bold text-blue-600 hover:underline flex items-center gap-1">ANALYSIS <ExternalLink className="w-3 h-3" /></a></div><div className="grid grid-cols-2 gap-3"><div className={`p-4 rounded-lg border ${theme === 'dark' ? 'bg-[#171717] border-neutral-800' : 'bg-neutral-50 border-neutral-200 shadow-sm'}`}><div className="text-[9px] font-bold text-neutral-500 dark:text-neutral-400 uppercase mb-1">Total Signals</div><div className={`text-lg font-bold ${theme === 'dark' ? 'text-white' : 'text-neutral-900'}`}>{stats.total.toLocaleString()}</div></div><a href={stats.primarySearchLink} target="_blank" rel="noopener noreferrer" className={`p-4 rounded-lg border block hover:bg-blue-100/50 transition-colors ${theme === 'dark' ? 'bg-blue-900/5 border-blue-500/20' : 'bg-blue-50 border-blue-100 shadow-sm'}`}><div className="flex items-center justify-between mb-1"><div className="text-[9px] font-bold text-blue-600 dark:text-blue-500 uppercase">Recent (2024-25)</div><ExternalLink className="w-2.5 h-2.5 text-blue-400" /></div><div className="text-lg font-bold text-blue-700 dark:text-blue-400">{stats.recent.toLocaleString()}</div></a></div><div className={`p-4 rounded-lg border ${theme === 'dark' ? 'bg-[#171717] border-neutral-800' : 'bg-neutral-50 border-neutral-200 shadow-sm'}`}><div className="flex items-center justify-between mb-2"><span className="text-[9px] font-bold uppercase text-neutral-500 dark:text-neutral-400">Signal Velocity</span><Activity className="w-3 h-3 text-blue-500" /></div><PublicationSparkline recent={stats.recent} total={stats.total} theme={theme} /></div><div className="space-y-3">{stats.topPapers.map(p => (<a key={p.id} href={`https://pubmed.ncbi.nlm.nih.gov/${p.id}/`} target="_blank" rel="noopener noreferrer" className={`block p-4 rounded-lg border transition-all hover:bg-neutral-100 dark:hover:bg-neutral-800/50 ${theme === 'dark' ? 'bg-[#171717] border-neutral-800' : 'bg-white border-neutral-200 shadow-sm'}`}><p className={`text-[11px] font-medium leading-relaxed mb-2 line-clamp-2 ${theme === 'dark' ? 'text-neutral-300' : 'text-neutral-800'}`}>{p.title}</p><div className="text-[9px] font-mono text-neutral-500 uppercase tracking-wider">PMID {p.id}</div></a>))}</div></div>);
};

const App = () => {
  const [theme, setTheme] = useState<Theme>('light');
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('pharm_user'));
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [loading, setLoading] = useState(false);
  const [researchState, setResearchState] = useState<ResearchContext>({ activeDisease: null, targets: [], enrichment: [], limit: 30, currentPage: 0, focusSymbol: null });
  const [messages, setMessages] = useState<Message[]>([{ role: 'assistant', content: "GetGene Ready. Targeting breakthroughs in Alzheimer's and other complex diseases.", timestamp: new Date() }]);
  const [chatInput, setChatInput] = useState("");
  const [isChatting, setIsChatting] = useState(false);
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight; }, [messages]);
  const isBrcaActive = useMemo(() => researchState.activeDisease?.name.toLowerCase().includes('brca') || researchState.activeDisease?.name.toLowerCase().includes('breast'), [researchState.activeDisease]);

  const analyzeBrcaSurvival = useCallback(async () => {
    if (!isBrcaActive || researchState.targets.length === 0) return;
    setResearchState(p => ({ ...p, isAnalyzingSurvival: true }));
    try {
      const allMeans = await api.getSurvivalMeans();
      const metrics: SurvivalMetrics = {};
      const targets = researchState.targets;

      targets.forEach(t => {
        const symbol = t.symbol;
        const apiData = allMeans.find((item: any) => item.gene === symbol);
        
        metrics[symbol] = { 
          meanHigh: apiData ? apiData.mean_high : 0, 
          meanLow: apiData ? apiData.mean_low : 0, 
          nHigh: 1098, // TCGA cohort approx
          nLow: 1098,
          nUsedHigh: apiData ? 1 : 0,
          nUsedLow: apiData ? 1 : 0,
          log1pHigh: 0, log1pLow: 0, highDiff: 0, lowDiff: 0, highStatus: 'neutral', lowStatus: 'neutral' 
        };
      });

      Object.keys(metrics).forEach(symbol => {
        const m = metrics[symbol];
        m.highDiff = m.meanHigh;
        m.lowDiff = m.meanLow;
        m.highStatus = m.highDiff > 0 ? 'up' : (m.highDiff < 0 ? 'down' : 'neutral');
        m.lowStatus = m.lowDiff > 0 ? 'up' : (m.lowDiff < 0 ? 'down' : 'neutral');
      });

      setResearchState(p => ({ 
        ...p, 
        survivalMetrics: metrics, 
        medianOs: 912 // Fixed median as per backend calculation
      }));
    } catch (e) {
      console.error("Survival analysis failed:", e);
    } finally {
      setResearchState(p => ({ ...p, isAnalyzingSurvival: false }));
    }
  }, [isBrcaActive, researchState.targets]);

  useEffect(() => {
    if (viewMode === 'survival' && isBrcaActive && !researchState.survivalMetrics) {
      analyzeBrcaSurvival();
    }
  }, [viewMode, isBrcaActive, researchState.survivalMetrics, analyzeBrcaSurvival]);

  const handleToolExecution = useCallback(async (name: string, args: any) => {
    setLoading(true);
    try {
      switch (name) {
        case 'search_diseases': {
          let opts = await api.searchDiseases(args.query);
          if (opts.length === 0) return `No records found for "${args.query}". Please try a more specific or standard clinical term.`;
          
          // Optimized Entity Matching: Filter top 3-5 and ensure high relevance score (>80% equivalent)
          opts = opts.sort((a, b) => (b.score || 0) - (a.score || 0));
          const maxScore = opts[0]?.score || 1;
          const filteredOpts = opts.filter(o => (o.score || 0) / maxScore > 0.8).slice(0, 5);
          
          if (filteredOpts.length === 0 && opts.length > 0) {
            filteredOpts.push(opts[0]);
          }

          if (filteredOpts.length === 1) {
            const opt = filteredOpts[0]; const genes = await api.getGenes(opt.id, 30, 0); const enr = await api.getEnrichment(genes.map(g => g.symbol));
            setResearchState(prev => ({ ...prev, targets: genes, enrichment: enr, activeDisease: opt, focusSymbol: genes[0]?.symbol || null, currentPage: 0, survivalMetrics: undefined, medianOs: undefined }));
            return `Project set to ${opt.name}. Molecular evidence mapped.`;
          }
          return { content: `I found several standard matches. Please refine your clinical focus:`, options: filteredOpts };
        }
        case 'get_genes': {
          const genes = await api.getGenes(args.id, 30, 0); const enr = await api.getEnrichment(genes.map(g => g.symbol));
          setResearchState(prev => ({ ...prev, targets: genes, enrichment: enr, activeDisease: { id: args.id, name: args.name }, focusSymbol: genes[0]?.symbol || null, currentPage: 0, survivalMetrics: undefined, medianOs: undefined }));
          return `Target prioritization complete for ${args.name}.`;
        }
        case 'load_more': {
          if (!researchState.activeDisease) return "No active condition to load more data for.";
          const nextPage = researchState.currentPage + 1;
          const genes = await api.getGenes(researchState.activeDisease.id, 30, nextPage);
          if (genes.length === 0) return "No more additional evidence found for this condition.";
          const combinedTargets = [...researchState.targets, ...genes];
          const enr = await api.getEnrichment(combinedTargets.map(g => g.symbol));
          setResearchState(prev => ({ ...prev, targets: combinedTargets, enrichment: enr, currentPage: nextPage, survivalMetrics: undefined, medianOs: undefined }));
          return `Loaded ${genes.length} additional prioritized targets. Current total: ${combinedTargets.length}.`;
        }
        case 'update_view': { setViewMode(args.mode); return `Visualization focus shifted to ${args.mode}.`; }
        default: return "Acknowledged.";
      }
    } catch (err) { return "Operation error."; } finally { setLoading(false); }
  }, [researchState.activeDisease, researchState.currentPage, researchState.targets]);

  const handleChat = async (e: React.FormEvent) => {
    e.preventDefault(); if (!chatInput.trim() || isChatting) return;
    const userMsg: Message = { role: 'user', content: chatInput, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]); setChatInput(""); setIsChatting(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const tools = [
        { name: 'search_diseases', parameters: { type: Type.OBJECT, properties: { query: { type: Type.STRING } }, required: ['query'] } },
        { name: 'get_genes', parameters: { type: Type.OBJECT, properties: { id: { type: Type.STRING }, name: { type: Type.STRING } }, required: ['id', 'name'] } },
        { name: 'load_more', parameters: { type: Type.OBJECT, properties: {}, required: [] } },
        { name: 'update_view', parameters: { type: Type.OBJECT, properties: { mode: { type: Type.STRING, enum: ['list', 'correlation', 'enrichment', 'graph', 'terrain', 'survival', 'raw'] } }, required: ['mode'] } }
      ];
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: [...messages, userMsg].map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] })),
        config: { 
          tools: [{ functionDeclarations: tools as any }], 
          systemInstruction: `You are the GetGene AI Assistant. You help researchers discover drug targets and explain the application's architecture and sources.

App Knowledge:
1. Retrieval Process: Genes are retrieved from the Open Targets Platform using GraphQL queries. They are prioritized using evidence scores spanning Genetic associations, RNA expression, and Drug targetability.
2. Data Sources:
   - Open Targets: Primary source for target-disease associations and known drug pipelines.
   - Enrichr: Used for KEGG Pathway enrichment analysis.
   - PubMed (NCBI): Used for real-time literature analytics, paper summaries, and research "velocity" tracking.
   - UAB GTKB: Specialized clinical endpoints from University of Alabama at Birmingham for BRCA survival means and high-resolution patient expression data.
3. Functionality: You can navigate views (List, Correlation, Enrichment, Graph, Terrain, Outcome, Cohort Data), search for therapeutic areas, and drill down into specific gene evidence.

Behavior Guidelines:
- Answer technical questions about "how the app works" or its "sources" directly using the facts above.
- If the user provides a disease name (even if misspelled like 'alzheimers'), use the 'search_diseases' tool.
- Help users navigate visualizations by using the 'update_view' tool when they express interest in different data formats.
- Maintain a professional, scientific, and helpful tone.`
        }
      });
      if (response.functionCalls?.length) {
        for (const fc of response.functionCalls) {
          const res = await handleToolExecution(fc.name, fc.args);
          setMessages(prev => [...prev, { role: 'assistant', content: typeof res === 'string' ? res : res.content, options: typeof res === 'string' ? undefined : res.options, timestamp: new Date() }]);
        }
      } else setMessages(prev => [...prev, { role: 'assistant', content: response.text || "Synthesizing response...", timestamp: new Date() }]);
    } catch (e) { setMessages(prev => [...prev, { role: 'assistant', content: "Protocol error.", timestamp: new Date() }]); } finally { setIsChatting(false); }
  };

  if (!isAuthenticated) return <SignInPage theme={theme} toggleTheme={() => setTheme(t=>t==='dark'?'light':'dark')} onSignIn={e => { localStorage.setItem('pharm_user', e); setIsAuthenticated(true); }} />;

  return (
    <div className={`h-screen flex flex-col transition-colors duration-200 ${theme === 'dark' ? 'bg-[#0a0a0a] text-neutral-200' : 'bg-neutral-50 text-neutral-900'}`}>
      <header className={`px-6 py-3.5 flex items-center justify-between border-b ${theme === 'dark' ? 'bg-[#171717] border-neutral-800' : 'bg-white border-neutral-100'}`}>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2.5"><FlaskConical className="w-5 h-5 text-blue-500" /><h1 className="text-base font-bold tracking-tight">Get<span className="text-blue-500">Gene</span></h1></div>
          {researchState.activeDisease && (<div className="px-3 py-1 rounded bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 shadow-sm"><span className={`text-[10px] font-bold uppercase ${theme === 'dark' ? 'text-neutral-500' : 'text-neutral-700'}`}>PROJECT: {researchState.activeDisease.name}</span></div>)}
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setTheme(t=>t==='dark'?'light':'dark')} className="p-2 rounded hover:bg-neutral-100 transition-colors">{theme === 'dark' ? <Sun className="w-4 h-4 text-neutral-400" /> : <Moon className="w-4 h-4 text-neutral-600" />}</button>
          <div className="w-px h-4 bg-neutral-200 dark:bg-neutral-800 mx-1" /><button onClick={() => { localStorage.removeItem('pharm_user'); setIsAuthenticated(false); }} className="p-2 rounded hover:text-rose-600 text-neutral-400 transition-colors"><LogOut className="w-4 h-4" /></button>
        </div>
      </header>
      <main className="flex-1 flex overflow-hidden relative">
        <aside className={`border-r flex flex-col shrink-0 transition-all duration-300 ${isLeftSidebarOpen ? 'w-[360px]' : 'w-0 opacity-0 pointer-events-none'} ${theme === 'dark' ? 'bg-[#0d0d0d] border-neutral-800' : 'bg-white'}`}>
           <div className="p-4 border-b border-neutral-100 dark:border-neutral-800 text-[10px] font-bold uppercase text-neutral-600 dark:text-neutral-500 flex items-center justify-between tracking-wider">Terminal Evidence<button onClick={() => setIsLeftSidebarOpen(false)} className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"><PanelLeft className="w-3.5 h-3.5" /></button></div>
           <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-5 space-y-6">
              {messages.map((m, i) => (<div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}><div className={`max-w-[95%] p-4 rounded-xl text-[14px] shadow-sm ${m.role === 'user' ? 'bg-blue-600 text-white' : (theme === 'dark' ? 'bg-[#171717] border border-neutral-800' : 'bg-neutral-100 text-neutral-900 border border-neutral-200')}`}>{m.content}{m.options && (<div className="mt-4 space-y-2">{m.options.map(o => (<button key={o.id} onClick={() => handleToolExecution('get_genes', { id: o.id, name: o.name }).then(res => setMessages(prev => [...prev, { role: 'assistant', content: typeof res === 'string' ? res : res.content, timestamp: new Date() }]))} className="w-full p-3 rounded-lg bg-blue-600/10 border border-blue-600/20 text-left text-[11px] font-semibold uppercase hover:bg-blue-600 hover:text-white transition-all shadow-sm">{o.name}</button>))}</div>)}</div></div>))}
              {isChatting && (<div className="flex items-center gap-2 text-blue-600 px-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /><span className="text-[10px] font-bold uppercase tracking-widest">Synthesizing...</span></div>)}
           </div>
           <form onSubmit={handleChat} className="p-4 border-t border-neutral-100 dark:border-neutral-800"><div className="relative"><input type="text" value={chatInput} onChange={e=>setChatInput(e.target.value)} placeholder="Analyze condition..." className={`w-full p-3 pr-10 text-sm rounded-xl border outline-none ${theme === 'dark' ? 'bg-[#171717] border-neutral-800 text-white placeholder-neutral-600' : 'bg-neutral-50 border-neutral-300 text-neutral-900 shadow-inner'}`} /><button type="submit" className="absolute right-2 top-2 p-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"><Send className="w-4 h-4" /></button></div></form>
        </aside>
        {!isLeftSidebarOpen && (<button onClick={() => setIsLeftSidebarOpen(true)} className="absolute left-4 bottom-4 z-20 p-2.5 rounded-full bg-blue-600 text-white shadow-xl hover:scale-110 transition-transform"><MessageSquare className="w-5 h-5" /></button>)}
        <section className="flex-1 flex flex-col p-6 overflow-hidden">
           <div className="flex items-center mb-5 overflow-hidden w-full">
              <div className={`flex p-1 rounded-xl border w-full overflow-x-auto custom-scrollbar-x ${theme === 'dark' ? 'bg-[#171717] border-neutral-800' : 'bg-white border-neutral-200 shadow-sm'}`}>
                {[ {id:'list',i:List,l:'TARGET LIST'}, {id:'correlation',i:Network,l:'Correlation'}, {id:'enrichment',i:BarChart3,l:'Enrichment'}, {id:'graph',i:Share2,l:'Graph'}, {id:'terrain',i:Globe2,l:'Terrain'}, {id:'survival',i:Activity,l:'Outcome'}, {id:'raw',i:Database,l:'Cohort Data'} ].map(t => (
                  <button key={t.id} onClick={() => setViewMode(t.id as any)} className={`px-4 py-2.5 rounded-lg text-[11px] font-bold uppercase flex items-center gap-2 transition-all whitespace-nowrap min-w-fit ${viewMode === t.id ? 'bg-blue-600 text-white shadow-md' : 'text-neutral-500 hover:text-blue-600 hover:bg-blue-50/50 dark:hover:bg-neutral-800'}`}>
                    <t.i className="w-4 h-4" /> {t.l}
                  </button>
                ))}
              </div>
           </div>
           <div className={`flex-1 rounded-2xl border overflow-hidden relative ${theme === 'dark' ? 'bg-[#121212] border-neutral-800' : 'bg-white shadow-lg'}`}>
              {(loading || researchState.isAnalyzingSurvival) && (<div className="absolute inset-0 bg-neutral-900/40 backdrop-blur-[2px] z-50 flex flex-col items-center justify-center gap-4"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /><p className="text-[11px] font-bold uppercase text-white tracking-widest">Mapping Intelligence...</p></div>)}
              {researchState.targets.length === 0 && viewMode !== 'raw' ? (<div className="h-full flex flex-col items-center justify-center p-20 text-center"><Search className="w-16 h-16 text-blue-500 mb-8 opacity-20" /><h2 className="text-xl font-bold mb-2 text-neutral-800 dark:text-neutral-200 tracking-tight">System Ready for Research Focus</h2><p className="text-sm text-neutral-600 dark:text-neutral-500 max-w-sm leading-relaxed">Search for a therapeutic area or disease in the terminal to begin multi-modal target discovery.</p></div>) : (viewMode === 'raw' || viewMode === 'survival') && !isBrcaActive ? (<div className="h-full flex flex-col items-center justify-center p-12 text-center"><div className="p-5 rounded-full bg-blue-50 dark:bg-blue-900/20 mb-6"><AlertCircle className="w-12 h-12 text-blue-600" /></div><h3 className="text-xl font-bold mb-2 text-neutral-800 dark:text-neutral-200">Optimized Context Required</h3><p className="text-sm max-w-md text-neutral-600 dark:text-neutral-500 leading-relaxed">Cohort and Outcome analytics are currently specifically tuned for high-resolution BRCA (Breast Cancer) studies.</p></div>) : (
                <>
                  {viewMode === 'list' && (
                    <div className="h-full flex flex-col">
                      <div className="flex-1 overflow-auto">
                        <table className="w-full text-left border-collapse">
                          <thead className={`sticky top-0 z-10 text-[10px] font-bold uppercase tracking-widest border-b ${theme === 'dark' ? 'bg-[#171717] border-neutral-800 text-neutral-500' : 'bg-neutral-50 border-neutral-200 text-neutral-900 shadow-sm'}`}>
                            <tr><th className="p-4 pl-8">Gene</th><th className="p-4 hidden md:table-cell">Gene Name</th><th className="p-4 text-center">Genetic</th><th className="p-4 text-center">Expression</th><th className="p-4 text-center">Target</th><th className="p-4 pr-8 text-right">Overall Score</th></tr>
                          </thead>
                          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                            {researchState.targets.map(t => (
                              <tr key={t.id} onClick={()=>setResearchState(p=>({...p, focusSymbol: t.symbol}))} className={`cursor-pointer transition-colors hover:bg-blue-50/30 dark:hover:bg-neutral-800/20 ${researchState.focusSymbol === t.symbol ? 'bg-blue-100/30 dark:bg-blue-900/10' : ''}`}>
                                <td className="p-4 pl-8 font-bold text-blue-700 dark:text-blue-500 text-[13px]">{t.symbol}</td>
                                <td className={`p-4 text-[12px] hidden md:table-cell ${theme === 'dark' ? 'text-neutral-400' : 'text-neutral-900'}`}>{t.name}</td>
                                <td className={`p-4 text-center font-mono text-[11px] font-medium ${theme === 'dark' ? 'text-neutral-400' : 'text-neutral-700'}`}>{t.geneticScore.toFixed(3)}</td>
                                <td className={`p-4 text-center font-mono text-[11px] font-medium ${theme === 'dark' ? 'text-neutral-400' : 'text-neutral-700'}`}>{t.combinedExpression?.toFixed(3)}</td>
                                <td className={`p-4 text-center font-mono text-[11px] font-medium ${theme === 'dark' ? 'text-neutral-400' : 'text-neutral-700'}`}>{t.targetScore.toFixed(3)}</td>
                                <td className="p-4 pr-8 text-right font-mono font-bold text-[12px] text-blue-600">{t.overallScore.toFixed(4)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {researchState.activeDisease && (
                          <div className="p-8 flex flex-col items-center gap-4 border-t border-neutral-100 dark:border-neutral-800 bg-neutral-50/30 dark:bg-transparent">
                            <button onClick={() => handleToolExecution('load_more', {})} disabled={loading} className={`group px-10 py-4 rounded-2xl bg-blue-600 text-white text-[12px] font-bold uppercase tracking-widest hover:bg-blue-700 active:scale-95 transition-all flex items-center gap-3 shadow-lg shadow-blue-600/25 disabled:opacity-50`}>{loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform" />} Load More Analysis</button>
                            <p className="text-[10px] font-bold text-neutral-500 dark:text-neutral-500 uppercase tracking-tighter">Cohort Depth: {researchState.currentPage + 1} | Buffer: 30 Targets</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {viewMode === 'correlation' && <CorrelationView targets={researchState.targets} theme={theme} />}
                  {viewMode === 'enrichment' && (<div className="p-10 h-full overflow-auto space-y-6"><div className={`flex items-center justify-between border-b pb-4 ${theme === 'dark' ? 'border-neutral-800' : 'border-neutral-200'}`}><h4 className="text-[13px] font-bold uppercase text-neutral-700 dark:text-neutral-400 tracking-wider">Molecular Pathway Analytics</h4></div><div className="grid grid-cols-1 gap-4">{researchState.enrichment.map((e, i) => { const nCoCo = Math.min(0.95, (Math.log10(e.combinedScore + 1) / 3)); return (<div key={i} className={`p-6 rounded-2xl border shadow-sm transition-hover hover:shadow-md ${theme === 'dark' ? 'bg-[#171717] border-neutral-800' : 'bg-white border-neutral-200'}`}><div className="flex flex-col lg:flex-row justify-between gap-6"><div className="space-y-4 flex-1"><div className="flex items-center gap-3"><span className={`text-[15px] font-bold tracking-tight ${theme === 'dark' ? 'text-neutral-100' : 'text-neutral-900'}`}>{e.term}</span></div><div className="flex flex-wrap gap-2">{e.genes.slice(0, 15).map(g => (<span key={g} className={`px-2.5 py-1 rounded-md text-[10px] font-bold border transition-colors ${theme === 'dark' ? 'bg-neutral-800 text-neutral-400 border-neutral-700 hover:text-blue-400' : 'bg-blue-50 text-blue-700 border-blue-100 hover:bg-blue-100'}`}>{g}</span>))}</div></div><div className="flex items-center gap-12 shrink-0"><div className="text-right"><div className="text-[10px] font-bold uppercase mb-1 text-neutral-500 tracking-wider">p-Value</div><div className="text-sm font-mono font-bold text-blue-600">{e.pValue.toExponential(3)}</div></div><div className="w-40 space-y-3"><div className="flex justify-between items-end"><span className="text-[10px] font-bold uppercase text-neutral-500 tracking-wider">Enrichment Score</span><span className="text-[11px] font-bold font-mono text-blue-600">{nCoCo.toFixed(3)}</span></div><div className={`h-2 rounded-full overflow-hidden ${theme === 'dark' ? 'bg-neutral-800' : 'bg-neutral-100 shadow-inner'}`}><div className="h-full bg-blue-600 shadow-[0_0_8px_rgba(37,99,235,0.4)]" style={{width: `${nCoCo*100}%`}} /></div></div></div></div></div>); })}</div></div>)}
                  {viewMode === 'graph' && <KnowledgeGraph targets={researchState.targets} selectedId={researchState.focusSymbol || undefined} onSelect={(t)=>setResearchState(p=>({...p, focusSymbol: t?.symbol || null}))} theme={theme} />}
                  {viewMode === 'terrain' && <GeneTerrain targets={researchState.targets} selectedId={researchState.targets.find(t=>t.symbol===researchState.focusSymbol)?.id} onSelect={(t)=>setResearchState(p=>({...p, focusSymbol: t?.symbol || null}))} theme={theme} />}
                  {viewMode === 'survival' && <GeneTerrain targets={researchState.targets} selectedId={researchState.targets.find(t=>t.symbol===researchState.focusSymbol)?.id} onSelect={(t)=>setResearchState(p=>({...p, focusSymbol: t?.symbol || null}))} theme={theme} mode="survival" survivalMetrics={researchState.survivalMetrics} medianOs={researchState.medianOs} />}
                  {viewMode === 'raw' && <RawDataView targets={researchState.targets} theme={theme} />}
                </>
              )}
           </div>
        </section>
        {researchState.focusSymbol && (<>
          <aside className={`border-l flex flex-col gap-10 overflow-y-auto custom-scrollbar transition-all duration-300 relative ${isRightSidebarOpen ? 'w-[420px] opacity-100 p-8' : 'w-0 opacity-0 p-0 pointer-events-none'} ${theme === 'dark' ? 'bg-[#0d0d0d] border-neutral-800' : 'bg-white shadow-xl'}`}>
            {(() => { const t = researchState.targets.find(x => x.symbol === researchState.focusSymbol); if (!t) return null; return (<>
              <div className="flex items-start justify-between border-b border-neutral-100 dark:border-neutral-800 pb-8">
                <div className="space-y-1">
                  <h3 className="text-5xl font-extrabold text-blue-600 dark:text-blue-500 tracking-tighter">{t.symbol}</h3>
                  <p className={`text-[12px] font-bold uppercase tracking-wide ${theme === 'dark' ? 'text-neutral-500' : 'text-neutral-600'}`}>{t.name}</p>
                </div>
                <button onClick={() => setIsRightSidebarOpen(false)} className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors" title="Minimize">
                  <ChevronRight className="w-5 h-5 text-neutral-400 hover:text-blue-600" />
                </button>
              </div>
              <div className="space-y-3">
                <h4 className="text-[10px] font-bold uppercase text-neutral-500 dark:text-neutral-400 tracking-widest">Molecular Radar</h4>
                <div className={`p-8 rounded-3xl border shadow-inner ${theme === 'dark' ? 'bg-[#171717] border-neutral-800' : 'bg-neutral-50 border-neutral-200'}`}>
                  <RadarChart target={t} theme={theme} />
                </div>
              </div>
              <DrugLandscape targetId={t.id} theme={theme} />
              <LiteratureStats symbol={t.symbol} diseaseName={researchState.activeDisease?.name || "Evidence"} theme={theme} />
            </>) })()}
          </aside>
          {!isRightSidebarOpen && (
            <button 
              onClick={() => setIsRightSidebarOpen(true)} 
              className="absolute right-0 top-1/2 -translate-y-1/2 z-20 p-2.5 rounded-l-xl bg-blue-600 text-white shadow-2xl hover:pl-6 transition-all group flex items-center gap-2"
              title="Show Analysis Details"
            >
              <ChevronLeft className="w-5 h-5" />
              <span className="text-[10px] font-bold uppercase hidden group-hover:block whitespace-nowrap pr-2 tracking-widest">Evidence</span>
            </button>
          )}
        </>)}
      </main>
    </div>
  );
};

const SignInPage = ({ theme, toggleTheme, onSignIn }: { theme: Theme, toggleTheme: () => void, onSignIn: (user: string) => void }) => {
  const [email, setEmail] = useState(""), [password, setPassword] = useState("");
  return (
    <div className={`h-screen flex items-center justify-center p-6 ${theme === 'dark' ? 'bg-[#0a0a0a]' : 'bg-neutral-50'}`}>
      <div className={`w-full max-w-sm p-10 rounded-2xl border transition-all ${theme === 'dark' ? 'bg-[#171717] border-neutral-800 shadow-2xl' : 'bg-white border-neutral-200 shadow-2xl shadow-blue-900/10'}`}>
        <div className="flex flex-col items-center gap-6 mb-12 text-center">
          <div className="p-4 bg-blue-600 rounded-2xl shadow-xl shadow-blue-600/30 rotate-3 transition-transform hover:rotate-0">
            <FlaskConical className="w-10 h-10 text-white" />
          </div>
          <div>
            <h1 className={`text-3xl font-black tracking-tight ${theme === 'light' ? 'text-neutral-900' : 'text-white'}`}>Get<span className="text-blue-600">Gene</span></h1>
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-neutral-400 dark:text-neutral-500 mt-2">Discovery Portal</p>
          </div>
        </div>
        <form onSubmit={e=>{e.preventDefault(); if(password===HARDCODED_PASSWORD) onSignIn("Researcher");}} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase text-neutral-500 dark:text-neutral-500 ml-1 tracking-widest">Username</label>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} className={`w-full p-4 rounded-xl border text-sm font-semibold outline-none transition-all ${theme === 'dark' ? 'bg-[#0a0a0a] border-neutral-800 text-white focus:border-blue-600' : 'bg-neutral-50 border-neutral-300 text-neutral-900 focus:border-blue-600 focus:bg-white'}`} placeholder="username@uab.edu" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase text-neutral-500 dark:text-neutral-500 ml-1 tracking-widest">Password</label>
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)} className={`w-full p-4 rounded-xl border text-sm font-semibold outline-none transition-all ${theme === 'dark' ? 'bg-[#0a0a0a] border-neutral-800 text-white focus:border-blue-600' : 'bg-neutral-50 border-neutral-300 text-neutral-900 focus:border-blue-600 focus:bg-white'}`} placeholder="••••••••" />
          </div>
          <button type="submit" className="w-full mt-4 p-4 bg-blue-600 text-white rounded-xl font-bold uppercase text-[12px] tracking-widest shadow-xl shadow-blue-600/20 hover:bg-blue-700 active:scale-95 transition-all flex items-center justify-center gap-3">
            <ShieldCheck className="w-5 h-5" /> Login
          </button>
        </form>
        <div className="mt-10 pt-10 border-t border-neutral-100 dark:border-neutral-800 flex justify-center">
          <button onClick={toggleTheme} className="p-3 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition-colors">
            {theme === 'dark' ? <Sun className="w-5 h-5 text-neutral-500" /> : <Moon className="w-5 h-5 text-neutral-600" />}
          </button>
        </div>
      </div>
    </div>
  );
};

const rootElement = document.getElementById('root');
if (rootElement) createRoot(rootElement).render(<App />);