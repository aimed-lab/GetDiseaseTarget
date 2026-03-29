import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Type, Chat, GenerateContentResponse } from "@google/genai";
import * as d3 from "d3";
import Markdown from 'react-markdown';
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, HeadingLevel } from 'docx';
import { saveAs } from 'file-saver';
import './index.css';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell, 
  Legend 
} from 'recharts';
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
  ChevronDown,
  ChevronUp,
  Layers,
  BookOpen,
  ExternalLink,
  FileText,
  Pill,
  Stethoscope,
  Users,
  Building2,
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
  Flag,
  Maximize,
  TableProperties,
  Plus,
  ArrowUpDown,
  HelpCircle,
  X,
  FileDown,
  ThumbsUp,
  ThumbsDown,
  Pin,
  Trash2,
  Home
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

const DEMO_PATIENTS = [
  { id: 'P1', race: 'WHITE', stage: 'Stage I', os_time: 1200 },
  { id: 'P2', race: 'WHITE', stage: 'Stage II', os_time: 800 },
  { id: 'P3', race: 'BLACK', stage: 'Stage I', os_time: 1100 },
  { id: 'P4', race: 'BLACK', stage: 'Stage III', os_time: 600 },
  { id: 'P5', race: 'ASIAN', stage: 'Stage II', os_time: 950 },
  { id: 'P6', race: 'OTHER', stage: 'Stage IV', os_time: 400 },
];

const getDemoExpression = (symbol: string, patientId: string) => {
  let hash = 0;
  const str = symbol + patientId;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return (Math.abs(hash % 100) / 100);
};

const CANCER_TYPE_MAP: Record<string, string> = {
  'bladder': 'BLCA',
  'breast': 'BRCA',
  'cervical': 'CESC',
  'cholangiocarcinoma': 'CHOL',
  'kidney': 'KIRC',
  'brca': 'BRCA',
  'blca': 'BLCA',
  'cesc': 'CESC',
  'chol': 'CHOL',
  'kirc': 'KIRC'
};

const detectCancerType = (name: string) => {
  const lowerName = name.toLowerCase();
  for (const [key, code] of Object.entries(CANCER_TYPE_MAP)) {
    if (lowerName.includes(key)) return code;
  }
  return null;
};

// --- Helper Components for Visualization ---

const RadarChart = ({ target, theme }: { target: Target, theme: Theme }) => {
  const size = 260;
  const center = size / 2;
  const radius = size * 0.35;
  
  const axes = [
    { label: 'Genetic', val: target.geneticScore, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { label: 'Literature', val: target.literatureScore || 0, color: 'text-purple-500', bg: 'bg-purple-500/10' },
    { label: 'GET Score', val: target.getScore || 0, color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
    { label: 'Expression', val: target.combinedExpression || 0, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    { label: 'Target', val: target.targetScore || 0, color: 'text-amber-500', bg: 'bg-amber-500/10' },
    { label: 'Priority', val: target.overallScore, color: 'text-blue-600', bg: 'bg-blue-600/10' }
  ];

  const points = axes.map((a, i) => {
    const angle = (Math.PI * 2 * i) / axes.length - Math.PI / 2;
    const x = center + radius * a.val * Math.cos(angle);
    const y = center + radius * a.val * Math.sin(angle);
    return `${x},${y}`;
  }).join(' ');

  const gridLevels = [0.25, 0.5, 0.75, 1.0];

  return (
    <div className="flex flex-col lg:flex-row items-center gap-12 w-full">
      <div className="relative">
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
                  x={center + (radius + 25) * Math.cos(angle)}
                  y={center + (radius + 20) * Math.sin(angle)}
                  textAnchor="middle"
                  fontSize="8"
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

      <div className="flex-1 grid grid-cols-2 gap-3">
        {axes.map((a, i) => (
          <div 
            key={i}
            className={`flex flex-col p-3 rounded-xl border transition-all hover:scale-105 ${theme === 'dark' ? 'bg-[#1c1c1c] border-neutral-800' : 'bg-white border-neutral-100 shadow-sm'}`}
          >
            <span className="text-[9px] font-bold uppercase text-neutral-400 tracking-widest mb-1">{a.label}</span>
            <div className="flex items-center justify-between">
              <span className={`text-lg font-black ${a.color}`}>{a.val.toFixed(3)}</span>
              <div className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${a.bg} ${a.color}`}>SCORE</div>
            </div>
          </div>
        ))}
      </div>
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
    <div className={`relative w-full h-full rounded-xl overflow-hidden border flex flex-col ${theme === 'dark' ? 'bg-[#0a0a0a] border-neutral-800' : (survivalTab !== 'default' ? 'bg-[#E9FBF6]' : 'bg-white') + ' border-neutral-200 shadow-sm'}`}>
      {mode === 'survival' && (
        <div className={`px-4 py-2 flex items-center justify-between border-b ${theme === 'dark' ? 'bg-[#0d0d0d] border-neutral-800' : 'bg-neutral-50 border-neutral-100'}`}>
          <div className="flex items-center gap-1">
            <button onClick={() => setSurvivalTab('default')} className={`px-4 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all ${survivalTab === 'default' ? 'bg-blue-500 text-white shadow-sm' : 'text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-800'}`}>Default Terrain</button>
            <button onClick={() => setSurvivalTab('high')} className={`px-4 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all ${survivalTab === 'high' ? 'bg-[#EB4236] text-white shadow-sm' : 'text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-800'}`}>High Survival (Survivors)</button>
            <button onClick={() => setSurvivalTab('low')} className={`px-4 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all ${survivalTab === 'low' ? 'bg-[#4285F5] text-white shadow-sm' : 'text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-800'}`}>Low Survival (Non-Survivors)</button>
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

const RawDataView = ({ targets, theme, cancerType }: { targets: Target[], theme: Theme, cancerType: string }) => {
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
      const data = await api.getTcgaClinical(cancerType, offset); 
      // Normalize clinical data keys
      const normalized = data.map(item => ({
        sampleid: item.SAMPLEID ?? item.sampleid ?? item.SampleID ?? item.sample_id ?? item.sample ?? item.PATIENT_ID ?? item.patient_id,
        vital_status: item.VITAL_STATUS ?? item.vital_status ?? item.VitalStatus ?? 'Unknown'
      }));
      setClinicalData(normalized); 
      setLoadingClinical(false); 
    }; 
    fetchClinical(); 
  }, [offset, cancerType]);

  const handleSelectSample = async (sample: ClinicalSample) => { 
    setSelectedSample(sample); 
    setLoadingExpression(true); 
    
    // Use the new expression API format
    // Since we need expression for a specific sample, we fetch the target genes
    // and filter for this sample. If "Show All" is selected, we are limited by the API
    // so we'll primarily support the target list genes.
    const genesToFetch = showOnlyGetGenes ? Array.from(getTargetSymbols) : ['TP53', 'BRCA1', 'EGFR', 'MYC', 'PTEN']; // Fallback small list if not filtered
    
    const page = await api.getTcgaExpressionPage(cancerType, genesToFetch, 0);
    const sampleRows = page.items.filter(item => {
      const sid = (item.SAMPLEID ?? item.sampleid ?? item.SampleID ?? item.sample_id ?? item.sample ?? item.PATIENT_ID ?? item.patient_id)?.toString().trim().toUpperCase();
      return sid === sample.sampleid.toString().trim().toUpperCase();
    }).map(item => ({
      gene_symbol: (item.GENE_SYMBOL ?? item.gene_symbol ?? item.GeneSymbol ?? item.symbol ?? item.Symbol ?? item.gene),
      value: (item.EXPRESSION_VALUE ?? item.value ?? item.expression_value ?? item.ExpressionValue ?? item.tpm ?? item.TPM ?? item.exp)
    }));
    
    setExpressionData(sampleRows); 
    setLoadingExpression(false); 
  };
  const filteredExpression = useMemo(() => { if (!showOnlyGetGenes) return expressionData; return expressionData.filter(row => getTargetSymbols.has(row.gene_symbol)); }, [expressionData, getTargetSymbols, showOnlyGetGenes]);
  return (
    <div className="h-full flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-neutral-100 dark:divide-neutral-800">
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between"><div className="flex items-center gap-2"><Stethoscope className="w-4 h-4 text-neutral-500" /><span className="text-[12px] font-semibold text-neutral-700 dark:text-neutral-400">Cohort Explorer</span></div><div className="flex items-center gap-2"><button onClick={() => setOffset(Math.max(0, offset - 10))} disabled={offset === 0} className="p-1 rounded hover:bg-neutral-100 transition-colors"><ChevronLeft className="w-4 h-4" /></button><span className="text-[10px] font-mono text-neutral-600 dark:text-neutral-500">P. {offset/10 + 1}</span><button onClick={() => setOffset(offset + 10)} className="p-1 rounded hover:bg-neutral-100 transition-colors"><ChevronRight className="w-4 h-4" /></button></div></div>
        <div className="flex-1 overflow-auto">{loadingClinical ? (<div className="h-full flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>) : (<table className="w-full text-left"><thead className="sticky top-0 bg-neutral-50 dark:bg-neutral-900 border-b border-neutral-100 dark:border-neutral-800 z-10"><tr><th className="p-4 text-[10px] font-bold text-neutral-600 dark:text-neutral-500 uppercase pl-6">Sample ID</th><th className="p-4 text-[10px] font-bold text-neutral-600 dark:text-neutral-500 uppercase">Type</th><th className="p-4 pr-6 text-right text-[10px] font-bold text-neutral-600 dark:text-neutral-500 uppercase">Status</th></tr></thead><tbody className="divide-y divide-neutral-50 dark:divide-neutral-800">{clinicalData.map(sample => (<tr key={sample.sampleid} onClick={() => handleSelectSample(sample)} className={`cursor-pointer transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/50 ${selectedSample?.sampleid === sample.sampleid ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}><td className="p-4 pl-6 font-mono text-[11px] text-blue-600 dark:text-blue-400">{sample.sampleid}</td><td className="p-4 text-[11px] text-neutral-700 dark:text-neutral-400">{sample.vital_status === 'Alive' ? 'Alive' : 'Deceased'}</td><td className={`p-4 pr-6 text-right text-[11px] font-medium ${sample.vital_status === 'Alive' ? 'text-[#EB4236]' : 'text-[#4285F5]'}`}>{sample.vital_status}</td></tr>))}</tbody></table>)}</div>
      </div>
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between"><div className="flex items-center gap-2"><Activity className="w-4 h-4 text-neutral-500" /><span className="text-[12px] font-semibold text-neutral-700 dark:text-neutral-400">Sample Expression</span></div><button onClick={() => setShowOnlyGetGenes(!showOnlyGetGenes)} className={`text-[10px] font-bold px-3 py-1 rounded border transition-colors ${showOnlyGetGenes ? 'bg-blue-500 text-white' : 'text-neutral-500'}`}>{showOnlyGetGenes ? 'FILTERED' : 'ALL'}</button></div>
        <div className="flex-1 overflow-auto">{!selectedSample ? (<div className="h-full flex flex-col items-center justify-center p-12 text-center text-neutral-400"><DatabaseZap className="w-8 h-8 mb-4 opacity-10" /><p className="text-sm font-medium">Select a patient sample</p></div>) : loadingExpression ? (<div className="h-full flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>) : (<table className="w-full text-left"><thead className="sticky top-0 bg-neutral-50 dark:bg-neutral-900 border-b border-neutral-100 dark:border-neutral-800 z-10"><tr><th className="p-4 text-[10px] font-bold text-neutral-600 dark:text-neutral-500 uppercase pl-6">Gene</th><th className="p-4 text-[10px] font-bold text-neutral-600 dark:text-neutral-500 uppercase text-center">In List</th><th className="p-4 pr-6 text-right text-[10px] font-bold text-neutral-600 dark:text-neutral-500 uppercase">TPM Value</th></tr></thead><tbody className="divide-y divide-neutral-50 dark:divide-neutral-800">{filteredExpression.map(row => { const isGetGene = getTargetSymbols.has(row.gene_symbol); return (<tr key={row.gene_symbol} className={isGetGene ? 'bg-blue-50/20 dark:bg-blue-900/5' : ''}><td className={`p-4 pl-6 font-semibold text-[11px] ${isGetGene ? 'text-blue-600 dark:text-blue-400' : 'text-neutral-600 dark:text-neutral-300'}`}>{row.gene_symbol}</td><td className="p-4 text-center">{isGetGene && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mx-auto" />}</td><td className="p-4 pr-6 text-right font-mono text-[11px] text-neutral-600 dark:text-neutral-500">{parseFloat(row.value).toFixed(4)}</td></tr>); })}</tbody></table>)}</div>
      </div>
    </div>
  );
};

const DrugLandscape = ({ 
  targetId, 
  symbol, 
  theme, 
  currentStatus, 
  onToggle 
}: { 
  targetId: string, 
  symbol: string, 
  theme: Theme, 
  currentStatus?: 'useful' | 'not-useful' | 'pinned', 
  onToggle: (symbol: string, source: string, status: 'useful' | 'not-useful' | 'pinned') => void 
}) => {
  const [drugs, setDrugs] = useState<DrugInfo[]>([]); const [loading, setLoading] = useState(false);
  useEffect(() => { let active = true; const fetch = async () => { setLoading(true); const res = await api.getTargetDrugs(targetId); if (active) { setDrugs(res); setLoading(false); } }; fetch(); return () => { active = false; }; }, [targetId]);
  if (loading) return <div className="flex items-center gap-3 py-4"><Loader2 className="w-4 h-4 animate-spin text-blue-500" /><span className="text-[11px] font-medium text-neutral-500">Mapping clinical pipeline...</span></div>;
  if (drugs.length === 0) return null;
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Pill className="w-4 h-4 text-neutral-500" />
          <h4 className="text-[11px] font-bold uppercase text-neutral-600 dark:text-neutral-500">Pipeline Evidence</h4>
        </div>
        <UsefulnessControls 
          symbol={symbol} 
          source="clinical" 
          currentStatus={currentStatus} 
          onToggle={onToggle} 
          theme={theme} 
        />
      </div>
      <div className="space-y-3">
        {drugs.slice(0, 4).map(d => (
          <div key={d.id} className={`p-4 rounded-lg border ${theme === 'dark' ? 'bg-[#171717] border-neutral-800' : 'bg-neutral-50 border-neutral-200 shadow-sm'}`}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-bold text-blue-600 dark:text-blue-500 uppercase">{d.name}</span>
              <span className="text-[9px] font-bold text-neutral-500 dark:text-neutral-400 uppercase">PHASE {d.phase}</span>
            </div>
            <PipelineProgress phase={d.phase} />
            <p className={`text-[11px] leading-relaxed italic mt-3 ${theme === 'dark' ? 'text-neutral-400' : 'text-neutral-700'}`}>{d.mechanism}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

const LiteratureStats = ({ 
  symbol, 
  diseaseName, 
  theme, 
  currentStatus, 
  onToggle 
}: { 
  symbol: string, 
  diseaseName: string, 
  theme: Theme, 
  currentStatus?: 'useful' | 'not-useful' | 'pinned', 
  onToggle: (symbol: string, source: string, status: 'useful' | 'not-useful' | 'pinned') => void 
}) => {
  const [stats, setStats] = useState<PubMedStats | null>(null); const [loading, setLoading] = useState(false);
  useEffect(() => { let active = true; const fetch = async () => { setLoading(true); const res = await api.getPubMedStats(symbol, diseaseName); if (active) { setStats(res); setLoading(false); } }; fetch(); return () => { active = false; }; }, [symbol, diseaseName]);
  if (loading) return <div className="flex items-center gap-3 py-6"><Loader2 className="w-4 h-4 animate-spin text-blue-500" /><span className="text-[11px] font-medium text-neutral-500">Retrieving PubMed analytics...</span></div>;
  if (!stats) return null;
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-neutral-500" />
          <h4 className="text-[11px] font-bold uppercase text-neutral-600 dark:text-neutral-500">Clinical Publications</h4>
        </div>
        <UsefulnessControls 
          symbol={symbol} 
          source="literature" 
          currentStatus={currentStatus} 
          onToggle={onToggle} 
          theme={theme} 
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className={`p-4 rounded-lg border ${theme === 'dark' ? 'bg-[#171717] border-neutral-800' : 'bg-neutral-50 border-neutral-200 shadow-sm'}`}>
          <div className="text-[9px] font-bold text-neutral-500 dark:text-neutral-400 uppercase mb-1">Literature Count</div>
          <div className={`text-lg font-bold ${theme === 'dark' ? 'text-white' : 'text-neutral-900'}`}>{stats.total.toLocaleString()}</div>
        </div>
        <a href={stats.primarySearchLink} target="_blank" rel="noopener noreferrer" className={`p-4 rounded-lg border block hover:bg-blue-100/50 transition-colors ${theme === 'dark' ? 'bg-blue-900/5 border-blue-500/20' : 'bg-blue-50 border-blue-100 shadow-sm'}`}>
          <div className="flex items-center justify-between mb-1">
            <div className="text-[9px] font-bold text-blue-600 dark:text-blue-500 uppercase">Recent (2024-25)</div>
            <ExternalLink className="w-2.5 h-2.5 text-blue-400" />
          </div>
          <div className="text-lg font-bold text-blue-700 dark:text-blue-400">{stats.recent.toLocaleString()}</div>
        </a>
      </div>
      <div className={`p-4 rounded-lg border ${theme === 'dark' ? 'bg-[#171717] border-neutral-800' : 'bg-neutral-50 border-neutral-200 shadow-sm'}`}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[9px] font-bold uppercase text-neutral-500 dark:text-neutral-400">Velocity (2y)</span>
          <Activity className="w-3 h-3 text-blue-500" />
        </div>
        <PublicationSparkline recent={stats.recent} total={stats.total} theme={theme} />
      </div>
      <div className="space-y-3">
        {stats.topPapers.map(p => (
          <a key={p.id} href={`https://pubmed.ncbi.nlm.nih.gov/${p.id}/`} target="_blank" rel="noopener noreferrer" className={`block p-4 rounded-lg border transition-all hover:bg-neutral-100 dark:hover:bg-neutral-800/50 ${theme === 'dark' ? 'bg-[#171717] border-neutral-800' : 'bg-white border-neutral-200 shadow-sm'}`}>
            <p className={`text-[11px] font-medium leading-relaxed mb-2 line-clamp-2 ${theme === 'dark' ? 'text-neutral-300' : 'text-neutral-800'}`}>{p.title}</p>
            <div className="text-[9px] font-mono text-neutral-500 uppercase tracking-wider">PMID {p.id}</div>
          </a>
        ))}
      </div>
    </div>
  );
};

const UsefulnessControls = ({ 
  symbol, 
  source, 
  currentStatus, 
  onToggle, 
  theme 
}: { 
  symbol: string; 
  source: string; 
  currentStatus?: 'useful' | 'not-useful' | 'pinned'; 
  onToggle: (symbol: string, source: string, status: 'useful' | 'not-useful' | 'pinned') => void;
  theme: Theme;
}) => {
  const isPinned = currentStatus === 'pinned';
  
  return (
    <div className="flex items-center gap-1 mt-2">
      <button
        onClick={(e) => { e.stopPropagation(); onToggle(symbol, source, 'pinned'); }}
        className={`p-1.5 rounded-md transition-all group ${
          isPinned 
            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' 
            : 'hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400'
        }`}
        title="Pin to Top"
      >
        <Pin className={`w-3.5 h-3.5 ${isPinned ? 'fill-current' : 'group-hover:text-blue-500'}`} />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); if (!isPinned) onToggle(symbol, source, 'not-useful'); }}
        disabled={isPinned}
        className={`p-1.5 rounded-md transition-all group relative ${
          currentStatus === 'not-useful' 
            ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 ring-2 ring-rose-500/50 shadow-[0_0_10px_rgba(244,63,94,0.5)]' 
            : isPinned ? 'opacity-20 cursor-not-allowed text-neutral-300' : 'hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400'
        }`}
        title={isPinned ? "Cannot delete pinned information" : "Delete Information"}
      >
        <Trash2 className={`w-3.5 h-3.5 ${currentStatus === 'not-useful' ? 'fill-current' : 'group-hover:text-rose-500'}`} />
      </button>
    </div>
  );
};

// =============================================================================
// Navigation Components
// =============================================================================

const Breadcrumbs = ({ 
  activeDisease, 
  focusSymbol, 
  focusSubPage,
  onNavigate, 
  theme 
}: { 
  activeDisease?: DiseaseInfo | null; 
  focusSymbol?: string | null; 
  focusSubPage?: 'main' | 'literature' | 'clinical' | null;
  onNavigate: (level: 'home' | 'disease' | 'target' | 'subpage') => void;
  theme: Theme;
}) => {
  return (
    <nav className="flex items-center gap-2 mb-5 text-[10px] font-bold uppercase tracking-widest overflow-x-auto custom-scrollbar-x pb-1">
      <button 
        onClick={() => onNavigate('home')}
        className={`flex items-center gap-1.5 transition-all px-2 py-1 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 whitespace-nowrap ${!activeDisease ? 'text-blue-600 bg-blue-50/50 dark:bg-blue-900/10' : 'text-neutral-400 hover:text-blue-500'}`}
      >
        <Home className="w-3.5 h-3.5" />
        Home
      </button>
      
      {activeDisease && (
        <>
          <ChevronRight className="w-3 h-3 text-neutral-300 dark:text-neutral-700 shrink-0" />
          <button 
            onClick={() => onNavigate('disease')}
            className={`flex items-center gap-1.5 transition-all px-2 py-1 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 whitespace-nowrap ${activeDisease && !focusSymbol ? 'text-blue-600 bg-blue-50/50 dark:bg-blue-900/10' : 'text-neutral-400 hover:text-blue-500'}`}
          >
            <FlaskConical className="w-3.5 h-3.5" />
            {activeDisease.name}
          </button>
        </>
      )}

      {focusSymbol && (
        <>
          <ChevronRight className="w-3 h-3 text-neutral-300 dark:text-neutral-700 shrink-0" />
          <button 
            onClick={() => onNavigate('target')}
            className={`flex items-center gap-1.5 transition-all px-2 py-1 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 whitespace-nowrap ${focusSymbol && focusSubPage === 'main' ? 'text-blue-600 bg-blue-50/50 dark:bg-blue-900/10' : 'text-neutral-400 hover:text-blue-500'}`}
          >
            <Atom className="w-3.5 h-3.5" />
            {focusSymbol}
          </button>
        </>
      )}

      {focusSymbol && focusSubPage === 'literature' && (
        <>
          <ChevronRight className="w-3 h-3 text-neutral-300 dark:text-neutral-700 shrink-0" />
          <div className="flex items-center gap-1.5 text-blue-600 bg-blue-50/50 dark:bg-blue-900/10 px-2 py-1 rounded-md whitespace-nowrap">
            <BookOpen className="w-3.5 h-3.5" />
            Literature Intelligence
          </div>
        </>
      )}
    </nav>
  );
};

const TargetDetailView = ({ 
  target, 
  theme, 
  diseaseName,
  subPage = 'main',
  onToggleUsefulness,
  onNavigateSubPage,
  onBack
}: { 
  target: Target; 
  theme: Theme; 
  diseaseName: string;
  subPage?: 'main' | 'literature' | 'clinical';
  onToggleUsefulness: (symbol: string, source: string, status: 'useful' | 'not-useful' | 'pinned' | null) => void;
  onNavigateSubPage: (page: 'main' | 'literature' | 'clinical') => void;
  onBack: () => void;
}) => {
  if (subPage === 'literature') {
    return (
      <div className="h-full flex flex-col overflow-hidden animate-in fade-in slide-in-from-right-4 duration-500">
        <div className={`p-6 border-b flex items-center justify-between ${theme === 'dark' ? 'bg-[#171717] border-neutral-800' : 'bg-white border-neutral-100'}`}>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => onNavigateSubPage('main')}
              className="p-2 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-neutral-400" />
            </button>
            <div className="space-y-1">
              <h3 className="text-2xl font-black text-purple-600 dark:text-purple-400 tracking-tighter flex items-center gap-2">
                <BookOpen className="w-6 h-6" /> Literature Intelligence: {target.symbol}
              </h3>
              <p className="text-[10px] font-bold uppercase text-neutral-400 tracking-widest">Scientific publication trends and evidence mapping</p>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          <div className="max-w-4xl mx-auto space-y-10">
            {target.drillDown ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className={`p-6 rounded-2xl border ${theme === 'dark' ? 'bg-[#171717] border-neutral-800' : 'bg-white border-neutral-200 shadow-sm'}`}>
                    <span className="text-[10px] font-bold text-neutral-400 uppercase block mb-1">Literature Count</span>
                    <span className="text-3xl font-black text-purple-600">{target.drillDown.total_signals || 0}</span>
                  </div>
                  <div className={`p-6 rounded-2xl border ${theme === 'dark' ? 'bg-[#171717] border-neutral-800' : 'bg-white border-neutral-200 shadow-sm'}`}>
                    <span className="text-[10px] font-bold text-neutral-400 uppercase block mb-1">Recent (2024-25)</span>
                    <span className="text-3xl font-black text-purple-600">{target.drillDown.recent_signals || 0}</span>
                  </div>
                  <div className={`p-6 rounded-2xl border ${theme === 'dark' ? 'bg-[#171717] border-neutral-800' : 'bg-white border-neutral-200 shadow-sm'}`}>
                    <span className="text-[10px] font-bold text-neutral-400 uppercase block mb-1">Velocity (2y)</span>
                    <span className="text-2xl font-black text-purple-600">{target.drillDown.signal_velocity || '0%'}</span>
                  </div>
                </div>

                <div className="space-y-6">
                  <h4 className="text-[12px] font-bold uppercase text-neutral-500 tracking-widest border-b pb-2">Publication Intelligence</h4>
                  <LiteratureStats 
                    symbol={target.symbol} 
                    diseaseName={diseaseName} 
                    theme={theme} 
                    currentStatus={target.usefulness?.['literature']}
                    onToggle={onToggleUsefulness}
                  />
                </div>

                <div className="pt-10 space-y-4">
                  <h4 className="text-[12px] font-bold uppercase text-neutral-500 tracking-widest">Global Evidence Repositories</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <a 
                      href={`https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(target.symbol)}+${encodeURIComponent(diseaseName)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 hover:bg-purple-50 dark:hover:bg-purple-900/10 transition-all group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-purple-100 dark:bg-purple-900/30 text-purple-600"><FileText className="w-5 h-5" /></div>
                        <div className="text-left">
                          <span className="text-[11px] font-black text-neutral-800 dark:text-neutral-200 block">PubMed / MEDLINE</span>
                          <span className="text-[9px] font-bold text-neutral-400 uppercase">NIH National Library</span>
                        </div>
                      </div>
                      <ExternalLink className="w-4 h-4 text-neutral-300 group-hover:text-purple-500 transition-colors" />
                    </a>
                    <a 
                      href={`https://europepmc.org/search?query=${encodeURIComponent(target.symbol)}+AND+${encodeURIComponent(diseaseName)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/10 transition-all group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600"><Globe2 className="w-5 h-5" /></div>
                        <div className="text-left">
                          <span className="text-[11px] font-black text-neutral-800 dark:text-neutral-200 block">Europe PMC</span>
                          <span className="text-[9px] font-bold text-neutral-400 uppercase">EMBL-EBI Open Access</span>
                        </div>
                      </div>
                      <ExternalLink className="w-4 h-4 text-neutral-300 group-hover:text-indigo-500 transition-colors" />
                    </a>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center p-20 text-center">
                <Loader2 className="w-10 h-10 animate-spin text-purple-500 mb-4" />
                <p className="text-sm font-bold text-neutral-500 uppercase tracking-widest">Mapping Scientific Evidence...</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (subPage === 'clinical') {
    return (
      <div className="h-full flex flex-col overflow-hidden animate-in fade-in slide-in-from-right-4 duration-500">
        <div className={`p-6 border-b flex items-center justify-between ${theme === 'dark' ? 'bg-[#171717] border-neutral-800' : 'bg-white border-neutral-100'}`}>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => onNavigateSubPage('main')}
              className="p-2 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-neutral-400" />
            </button>
            <div className="space-y-1">
              <h3 className="text-2xl font-black text-emerald-600 dark:text-emerald-400 tracking-tighter flex items-center gap-2">
                <Activity className="w-6 h-6" /> Clinical Trial Intelligence: {target.symbol}
              </h3>
              <p className="text-[10px] font-bold uppercase text-neutral-400 tracking-widest">Deep insights from ClinicalTrials.gov and AI synthesis</p>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          <div className="max-w-4xl mx-auto space-y-10">
            {target.drillDown ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <div className={`p-6 rounded-2xl border ${theme === 'dark' ? 'bg-[#171717] border-neutral-800' : 'bg-white border-neutral-200 shadow-sm'}`}>
                    <span className="text-[10px] font-bold text-neutral-400 uppercase block mb-1">Total Trials</span>
                    <span className="text-3xl font-black text-emerald-600">{target.drillDown.trial_count || 0}</span>
                  </div>
                  <div className={`p-6 rounded-2xl border ${theme === 'dark' ? 'bg-[#171717] border-neutral-800' : 'bg-white border-neutral-200 shadow-sm'}`}>
                    <span className="text-[10px] font-bold text-neutral-400 uppercase block mb-1">Max Phase</span>
                    <span className="text-3xl font-black text-emerald-600">{target.drillDown.max_phase || 'N/A'}</span>
                  </div>
                  <div className={`p-6 rounded-2xl border ${theme === 'dark' ? 'bg-[#171717] border-neutral-800' : 'bg-white border-neutral-200 shadow-sm'}`}>
                    <span className="text-[10px] font-bold text-neutral-400 uppercase block mb-1">Interventional</span>
                    <span className="text-3xl font-black text-emerald-600">{target.drillDown.interventional_count || 0}</span>
                  </div>
                  <div className={`p-6 rounded-2xl border ${theme === 'dark' ? 'bg-[#171717] border-neutral-800' : 'bg-white border-neutral-200 shadow-sm'}`}>
                    <span className="text-[10px] font-bold text-neutral-400 uppercase block mb-1">Active Trials</span>
                    <span className="text-3xl font-black text-emerald-600">{target.drillDown.active_trial_present ? 'YES' : 'NO'}</span>
                  </div>
                </div>

                {target.drillDown.clinical_summary && (
                  <div className={`p-8 rounded-3xl border border-dashed ${theme === 'dark' ? 'bg-blue-900/10 border-blue-500/30' : 'bg-blue-50 border-blue-200'}`}>
                    <div className="flex items-center gap-3 mb-4">
                      <ShieldCheck className="w-6 h-6 text-blue-500" />
                      <h4 className="text-[12px] font-bold uppercase text-blue-600 tracking-widest">AI Clinical Synthesis</h4>
                    </div>
                    <p className={`text-lg leading-relaxed font-medium italic ${theme === 'dark' ? 'text-neutral-200' : 'text-neutral-800'}`}>
                      "{target.drillDown.clinical_summary}"
                    </p>
                  </div>
                )}

                {target.clinical_flags && target.clinical_flags.length > 0 && (
                  <div className={`p-8 rounded-3xl border ${theme === 'dark' ? 'bg-rose-900/10 border-rose-500/30' : 'bg-rose-50 border-rose-200'}`}>
                    <div className="flex items-center gap-3 mb-6">
                      <Flag className="w-6 h-6 text-rose-500" />
                      <h4 className="text-[12px] font-bold uppercase text-rose-600 tracking-widest">Clinical Strategic Flags</h4>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {target.clinical_flags.map((flag, i) => (
                        <div key={i} className={`flex items-start gap-3 p-4 rounded-2xl ${theme === 'dark' ? 'bg-rose-950/40 border border-rose-900/50' : 'bg-white border border-rose-100 shadow-sm'}`}>
                          <div className="mt-1 p-1 rounded-full bg-rose-500/10"><AlertCircle className="w-3.5 h-3.5 text-rose-600" /></div>
                          <span className={`text-[13px] font-bold leading-tight ${theme === 'dark' ? 'text-rose-200' : 'text-rose-900'}`}>{flag}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                  <div className="space-y-6">
                    <h4 className="text-[12px] font-bold uppercase text-neutral-500 tracking-widest border-b pb-2 flex items-center gap-2">
                      <Stethoscope className="w-4 h-4" /> Top Conditions
                    </h4>
                    <div className="space-y-3">
                      {target.drillDown.top_conditions?.map((c, i) => (
                        <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-100 dark:border-neutral-800">
                          <span className="text-[11px] font-bold text-neutral-700 dark:text-neutral-300 line-clamp-1">{c.name}</span>
                          <span className="px-2 py-1 rounded-lg bg-blue-500/10 text-[10px] font-black text-blue-600">{c.count} Trials</span>
                        </div>
                      )) || <p className="text-[11px] text-neutral-400 italic">No condition data available</p>}
                    </div>
                  </div>

                  <div className="space-y-6">
                    <h4 className="text-[12px] font-bold uppercase text-neutral-500 tracking-widest border-b pb-2 flex items-center gap-2">
                      <Pill className="w-4 h-4" /> Top Investigational Drugs
                    </h4>
                    <div className="space-y-3">
                      {target.drillDown.top_drugs?.map((d, i) => (
                        <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-100 dark:border-neutral-800">
                          <span className="text-[11px] font-bold text-neutral-700 dark:text-neutral-300 line-clamp-1">{d.name}</span>
                          <span className="px-2 py-1 rounded-lg bg-emerald-500/10 text-[10px] font-black text-emerald-600">{d.count} Trials</span>
                        </div>
                      )) || <p className="text-[11px] text-neutral-400 italic">No drug data available</p>}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                  <div className="space-y-6">
                    <h4 className="text-[12px] font-bold uppercase text-neutral-500 tracking-widest border-b pb-2 flex items-center gap-2">
                      <Layers className="w-4 h-4" /> Phase Breakdown
                    </h4>
                    <div className="space-y-2">
                      {Object.entries(target.drillDown.phase_breakdown || {}).map(([phase, count]) => (
                        <div key={phase} className="flex items-center gap-4">
                          <span className="text-[10px] font-bold text-neutral-400 uppercase w-24">{phase.replace('_', ' ')}</span>
                          <div className="flex-1 h-2 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-emerald-500" 
                              style={{ width: `${(count / (target.drillDown?.trial_count || 1)) * 100}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-bold text-neutral-600 dark:text-neutral-400">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-6">
                    <h4 className="text-[12px] font-bold uppercase text-neutral-500 tracking-widest border-b pb-2 flex items-center gap-2">
                      <Building2 className="w-4 h-4" /> Sponsor Breakdown
                    </h4>
                    <div className="flex flex-wrap gap-3">
                      {Object.entries(target.drillDown.sponsor_breakdown || {}).map(([sponsor, count]) => (
                        <div key={sponsor} className="px-4 py-2 rounded-2xl bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-100 dark:border-neutral-800 flex flex-col items-center min-w-[100px]">
                          <span className="text-[16px] font-black text-neutral-800 dark:text-neutral-200">{count}</span>
                          <span className="text-[9px] font-bold text-neutral-400 uppercase">{sponsor}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="pt-10 space-y-4">
                  <h4 className="text-[12px] font-bold uppercase text-neutral-500 tracking-widest">External Clinical Registries</h4>
                  <a 
                    href={`https://clinicaltrials.gov/search?cond=${encodeURIComponent(diseaseName)}&term=${encodeURIComponent(target.symbol)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-6 rounded-3xl border-2 border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10 transition-all group"
                  >
                    <div className="flex items-center gap-4">
                      <div className="p-3 rounded-2xl bg-emerald-500 text-white shadow-lg shadow-emerald-500/20"><Activity className="w-6 h-6" /></div>
                      <div className="text-left">
                        <span className="text-[14px] font-black text-neutral-800 dark:text-neutral-200 block">ClinicalTrials.gov</span>
                        <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">U.S. National Library of Medicine</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-emerald-600 font-bold text-[11px] uppercase tracking-tighter">
                      View Full Registry <ExternalLink className="w-4 h-4" />
                    </div>
                  </a>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center p-20 text-center">
                <Loader2 className="w-10 h-10 animate-spin text-emerald-500 mb-4" />
                <p className="text-sm font-bold text-neutral-500 uppercase tracking-widest">Synthesizing Clinical Intelligence...</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden animate-in fade-in slide-in-from-right-4 duration-500">
      <div className={`p-6 border-b flex items-center justify-between ${theme === 'dark' ? 'bg-[#171717] border-neutral-800' : 'bg-white border-neutral-100'}`}>
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-2 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-neutral-400" />
          </button>
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h3 className="text-4xl font-black text-blue-600 dark:text-blue-50 tracking-tighter">{target.symbol}</h3>
              <div className="px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-[10px] font-bold text-blue-600 uppercase">
                Score: {target.overallScore.toFixed(4)}
              </div>
              {target.drillDown?.trial_count && target.drillDown.trial_count > 0 && (
                <div className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-bold text-emerald-600 uppercase flex items-center gap-1">
                  <Activity className="w-3 h-3" /> {target.drillDown.trial_count} Clinical Trials
                </div>
              )}
            </div>
            <p className={`text-[12px] font-bold uppercase tracking-wide ${theme === 'dark' ? 'text-neutral-500' : 'text-neutral-600'}`}>{target.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[10px] font-bold uppercase text-neutral-400 tracking-widest">Priority Status</span>
          <UsefulnessControls 
            symbol={target.symbol} 
            source="overall" 
            currentStatus={target.usefulness?.['overall']} 
            onToggle={onToggleUsefulness} 
            theme={theme} 
          />
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-[10px] font-bold uppercase text-neutral-500 dark:text-neutral-400 tracking-widest">Molecular Radar</h4>
              <span className="text-[9px] font-bold text-neutral-400 uppercase block mt-1">Source: Open Targets</span>
            </div>
            <UsefulnessControls 
              symbol={target.symbol} 
              source="radar" 
              currentStatus={target.usefulness?.['radar']} 
              onToggle={onToggleUsefulness} 
              theme={theme} 
            />
          </div>
          <div className={`p-10 rounded-3xl border shadow-inner flex items-center justify-center ${theme === 'dark' ? 'bg-[#171717] border-neutral-800' : 'bg-neutral-50 border-neutral-200'}`}>
            <RadarChart target={target} theme={theme} />
          </div>
        </div>

        {target.drillDown ? (
          <div className="pt-10 border-t border-neutral-100 dark:border-neutral-800">
            <h4 className="text-[10px] font-bold uppercase text-neutral-500 dark:text-neutral-400 tracking-widest mb-6">Evidence summary</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

              {/* Clinical Publication Insights Section */}
              <div 
                onClick={() => onNavigateSubPage('literature')}
                className={`p-6 rounded-2xl border cursor-pointer transition-all hover:ring-2 hover:ring-indigo-500/50 hover:shadow-lg ${theme === 'dark' ? 'bg-[#171717] border-neutral-800' : 'bg-white border-neutral-200 shadow-sm'}`}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/20"><FileText className="w-4 h-4 text-indigo-500" /></div>
                    <h4 className="text-[11px] font-bold uppercase text-neutral-500 tracking-wider">Literature</h4>
                  </div>
                  <div className="text-[9px] font-bold text-indigo-600 uppercase tracking-tighter">Click for Details</div>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-end"><span className="text-[10px] font-bold text-neutral-400 uppercase">Literature Count</span><span className="text-xl font-black text-indigo-600">{target.drillDown.total_signals || 0}</span></div>
                  <div className="flex justify-between items-end"><span className="text-[10px] font-bold text-neutral-400 uppercase">Recent (24-25)</span><span className="text-lg font-bold text-indigo-500">{target.drillDown.recent_signals || 0}</span></div>
                  <div className="flex justify-between items-end"><span className="text-[10px] font-bold text-neutral-400 uppercase">Velocity (2y)</span><span className="text-[11px] font-mono font-bold text-indigo-600">{target.drillDown.signal_velocity || '0%'}</span></div>
                  <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800">
                    <span className="text-[9px] font-bold text-neutral-400 uppercase block mb-1">Latest Publication</span>
                    <p className="text-[10px] text-neutral-600 dark:text-neutral-400 line-clamp-1 italic">
                      {target.drillDown.top_papers?.[0]?.title || 'No recent publications found'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Clinical Trials Section */}
              <div 
                onClick={() => onNavigateSubPage('clinical')}
                className={`p-6 rounded-2xl border cursor-pointer transition-all hover:ring-2 hover:ring-emerald-500/50 hover:shadow-lg ${theme === 'dark' ? 'bg-[#171717] border-neutral-800' : 'bg-white border-neutral-200 shadow-sm'}`}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20"><Activity className="w-4 h-4 text-emerald-500" /></div>
                    <h4 className="text-[11px] font-bold uppercase text-neutral-500 tracking-wider">Clinical Trials</h4>
                  </div>
                  <div className="text-[9px] font-bold text-emerald-600 uppercase tracking-tighter">Click for Details</div>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-end"><span className="text-[10px] font-bold text-neutral-400 uppercase">Total Trials</span><span className="text-xl font-black text-emerald-600">{target.drillDown.trial_count || 0}</span></div>
                  <div className="flex justify-between items-end"><span className="text-[10px] font-bold text-neutral-400 uppercase">Max Phase</span><span className="text-lg font-bold text-emerald-500">{target.drillDown.max_phase || 'N/A'}</span></div>
                  <div className="flex justify-between items-end"><span className="text-[10px] font-bold text-neutral-400 uppercase">Interventional</span><span className="text-[11px] font-mono font-bold text-emerald-600">{target.drillDown.interventional_count || 0}</span></div>
                  <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800 flex items-center gap-2">
                    <span className="text-[9px] font-bold text-neutral-400 uppercase">Source: ClinicalTrials.gov</span>
                  </div>
                </div>
              </div>

              {/* Europe PMC Section */}
              <div className={`p-6 rounded-2xl border ${theme === 'dark' ? 'bg-[#171717] border-neutral-800' : 'bg-white border-neutral-200 shadow-sm opacity-80'}`}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-purple-50 dark:bg-purple-900/20"><BookOpen className="w-4 h-4 text-purple-500" /></div>
                    <h4 className="text-[11px] font-bold uppercase text-neutral-500 tracking-wider">Europe PMC</h4>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-end"><span className="text-[10px] font-bold text-neutral-400 uppercase">Paper Count</span><span className="text-xl font-black text-purple-600">{target.drillDown.paper_count.toLocaleString()}</span></div>
                  <div className="flex justify-between items-end"><span className="text-[10px] font-bold text-neutral-400 uppercase">Recent (3y)</span><span className="text-lg font-bold text-purple-500">{target.drillDown.recent_paper_count.toLocaleString()}</span></div>
                  <div className="flex justify-between items-end"><span className="text-[10px] font-bold text-neutral-400 uppercase">Latest Publication</span><span className="text-[11px] font-mono font-bold text-neutral-600 dark:text-neutral-400">{target.drillDown.latest_publication_date}</span></div>
                  <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800 flex items-center gap-2">
                    <span className="text-[9px] font-bold text-neutral-400 uppercase">Source: Europe PMC</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Clinical Intelligence Summary */}
            {target.drillDown.clinical_summary && (
              <div className={`mt-6 p-6 rounded-2xl border border-dashed ${theme === 'dark' ? 'bg-blue-900/5 border-blue-500/20' : 'bg-blue-50/50 border-blue-200'}`}>
                <div className="flex items-center gap-2 mb-3">
                  <ShieldCheck className="w-4 h-4 text-blue-500" />
                  <h5 className="text-[10px] font-bold uppercase text-blue-600 tracking-widest">Clinical Intelligence Summary</h5>
                </div>
                <p className={`text-[12px] leading-relaxed italic ${theme === 'dark' ? 'text-neutral-300' : 'text-neutral-700'}`}>
                  {target.drillDown.clinical_summary}
                </p>
              </div>
            )}

            {target.clinical_flags && target.clinical_flags.length > 0 && (
              <div className="mt-6 space-y-3">
                <div className="flex items-center gap-2">
                  <Flag className="w-4 h-4 text-rose-500" />
                  <h5 className="text-[10px] font-bold uppercase text-rose-600 tracking-widest">Strategic Flags</h5>
                </div>
                <div className="flex flex-wrap gap-2">
                  {target.clinical_flags.map((flag, i) => (
                    <div key={i} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border ${theme === 'dark' ? 'bg-rose-950/20 border-rose-900/40 text-rose-300' : 'bg-rose-50 border-rose-100 text-rose-700'}`}>
                      <AlertCircle className="w-3 h-3" />
                      <span className="text-[10px] font-bold leading-none">{flag}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Clinical Pipeline Section */}
            <div className="pt-10 border-t border-neutral-100 dark:border-neutral-800">
              <DrugLandscape 
                targetId={target.id} 
                symbol={target.symbol} 
                theme={theme} 
                currentStatus={target.usefulness?.['clinical']}
                onToggle={onToggleUsefulness}
              />
            </div>

            {/* Target Summary (Moved to last) */}
            <div className={`mt-10 p-8 rounded-3xl border shadow-sm ${theme === 'dark' ? 'bg-[#171717] border-neutral-800' : 'bg-white border-neutral-200'}`}>
              <h4 className="text-[10px] font-bold uppercase text-neutral-500 dark:text-neutral-400 tracking-widest mb-4">Target Summary</h4>
              <p className={`text-sm leading-relaxed ${theme === 'dark' ? 'text-neutral-400' : 'text-neutral-600'}`}>
                {target.name} ({target.symbol}) is a significant target in {diseaseName} research. 
                With an overall evidence score of {target.overallScore.toFixed(4)}, it shows strong {target.geneticScore > 0.5 ? 'genetic' : 'molecular'} associations.
                Explore the deep evidence intelligence above for detailed publication insights.
              </p>
            </div>
          </div>
        ) : (
          <div className="pt-10 border-t border-neutral-100 dark:border-neutral-800 flex flex-col items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-4" />
            <p className="text-[11px] font-bold uppercase text-neutral-500 tracking-widest">Synthesizing Deep Evidence...</p>
          </div>
        )}
      </div>
    </div>
  );
};

const App = () => {
  const [theme, setTheme] = useState<Theme>('light');
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('pharm_user'));
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("Mapping Intelligence...");
  const [researchState, setResearchState] = useState<ResearchContext>({ 
    activeDisease: null, 
    targets: [], 
    enrichment: [], 
    limit: 20, 
    currentPage: 0, 
    focusSymbol: null,
    filters: [],
    sorts: [],
    globalHiddenMetrics: []
  });
  const [messages, setMessages] = useState<Message[]>([{ role: 'assistant', content: "DiseaseToTarget Ready. Targeting breakthroughs in Alzheimer's and other complex diseases.", timestamp: new Date() }]);
  const [chatInput, setChatInput] = useState("");
  const [isChatting, setIsChatting] = useState(false);
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
  const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false);
  const [activeScoreInfo, setActiveScoreInfo] = useState<'genetic' | 'expression' | 'target' | 'overall' | 'literature' | 'get_score' | 'priority' | null>(null);
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const [drillDownLoading, setDrillDownLoading] = useState<string | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight; }, [messages]);
  const [isExporting, setIsExporting] = useState(false);
  const [focusSubPage, setFocusSubPage] = useState<'main' | 'literature' | 'clinical'>('main');

  const handleDrillDown = async (symbol: string) => {
    const target = researchState.targets.find(t => t.symbol === symbol);
    if (target && !target.drillDown) {
      setDrillDownLoading(symbol);
      const data = await api.getDrillDownData(symbol, researchState.activeDisease?.name || '');
      setResearchState(prev => ({
        ...prev,
        targets: prev.targets.map(t => t.symbol === symbol ? { ...t, drillDown: data } : t)
      }));
      setDrillDownLoading(null);
    }
  };
  
  const toggleUsefulness = (symbol: string, source: string, status: 'useful' | 'not-useful' | 'pinned') => {
    setResearchState(prev => {
      const isGlobalTrash = status === 'not-useful' && source !== 'overall';
      const isCurrentlyGloballyHidden = prev.globalHiddenMetrics?.includes(source);

      let newGlobalHiddenMetrics = [...(prev.globalHiddenMetrics || [])];
      if (isGlobalTrash) {
        if (isCurrentlyGloballyHidden) {
          newGlobalHiddenMetrics = newGlobalHiddenMetrics.filter(m => m !== source);
        } else {
          newGlobalHiddenMetrics.push(source);
        }
      }

      return {
        ...prev,
        globalHiddenMetrics: newGlobalHiddenMetrics,
        targets: prev.targets.map(t => {
          // If it's a global trash toggle, update all targets to match the new global state
          if (isGlobalTrash) {
            const newUsefulness = { ...(t.usefulness || {}) };
            if (isCurrentlyGloballyHidden) {
              delete newUsefulness[source];
            } else {
              newUsefulness[source] = 'not-useful';
            }
            return { ...t, usefulness: newUsefulness };
          }

          // Otherwise, it's a local toggle (like 'overall' or pinning)
          if (t.symbol === symbol) {
            const currentStatus = t.usefulness?.[source];
            const newUsefulness = { ...(t.usefulness || {}) };
            
            if (source === 'overall' && status === 'not-useful') {
              // If we're trashing the overall gene row, mark all metrics as not-useful for this gene
              if (currentStatus === 'not-useful') {
                delete newUsefulness['overall'];
                delete newUsefulness['literature'];
                delete newUsefulness['discovery'];
              } else {
                newUsefulness['overall'] = 'not-useful';
                newUsefulness['literature'] = 'not-useful';
                newUsefulness['discovery'] = 'not-useful';
              }
            } else if (currentStatus === status) {
              delete newUsefulness[source];
            } else {
              newUsefulness[source] = status;
            }
            return { ...t, usefulness: newUsefulness };
          }
          return t;
        })
      };
    });
  };

  const exportToNotion = async () => {
    if (!researchState.targets.length) {
      alert("No data to export. Please search for a disease first.");
      return;
    }
    setIsExporting(true);
    try {
      const response = await fetch('/api/export/notion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targets: researchState.targets,
          disease: researchState.activeDisease
        })
      });
      const data = await response.json();
      if (data.success && data.count > 0) {
        alert(`Successfully exported ${data.count} targets to Notion!`);
      } else {
        const errorMsg = data.error || 'Unknown error';
        const details = data.details ? `\n\nDetails:\n${data.details.join('\n')}` : '';
        alert(`Export failed: ${errorMsg}${details}`);
      }
    } catch (err) {
      alert(`Export error: ${err}`);
    } finally {
      setIsExporting(false);
    }
  };

  const exportToDocx = async () => {
    if (!researchState.targets.length) {
      alert("No data to export. Please search for a disease first.");
      return;
    }
    setIsExporting(true);
    try {
      const diseaseName = researchState.activeDisease?.name || 'Unknown Disease';
      
      const doc = new Document({
        sections: [{
          properties: {},
          children: [
            new Paragraph({
              text: `Target Prioritization Report: ${diseaseName}`,
              heading: HeadingLevel.HEADING_1,
              spacing: { after: 400 },
            }),
            new Paragraph({
              text: `Generated on: ${new Date().toLocaleDateString()}`,
              spacing: { after: 200 },
            }),
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                new TableRow({
                  children: [
                    'Gene', 'Genetic Score', 'Expression', 'Target Score', 'Overall Score'
                  ].map(text => new TableCell({
                    children: [new Paragraph({ text, alignment: AlignmentType.CENTER })],
                    shading: { fill: "E0E0E0" }
                  })),
                }),
                ...researchState.targets
                  .filter(t => !t.usefulness || !Object.values(t.usefulness).includes('not-useful'))
                  .slice(0, 100)
                  .map(target => new TableRow({
                    children: [
                      target.symbol,
                      (target.geneticScore || 0).toFixed(3),
                      (target.combinedExpression || 0).toFixed(3),
                      (target.targetScore || 0).toFixed(3),
                      (target.overallScore || 0).toFixed(3)
                    ].map(text => new TableCell({
                      children: [new Paragraph({ text, alignment: AlignmentType.CENTER })],
                    })),
                  })),
              ],
            }),
            ...researchState.targets
              .filter(t => t.usefulness && Object.values(t.usefulness).includes('useful'))
              .slice(0, 20)
              .map(target => [
                new Paragraph({
                  text: `Supporting Evidence: ${target.symbol}`,
                  heading: HeadingLevel.HEADING_2,
                  spacing: { before: 400, after: 200 },
                }),
                new Paragraph({
                  text: `The following evidence sources were prioritized as useful for this target:`,
                  spacing: { after: 100 },
                }),
                ...Object.entries(target.usefulness || {})
                  .filter(([_, status]) => status === 'useful')
                  .map(([source]) => new Paragraph({
                    text: `${source.charAt(0).toUpperCase() + source.slice(1)} Intelligence`,
                    bullet: { level: 0 }
                  }))
              ]).flat(),
          ],
        }],
      });

      const blob = await Packer.toBlob(doc);
      saveAs(blob, `Target_Prioritization_${diseaseName.replace(/\s+/g, '_')}.docx`);
      
      alert("Document generated and download started.");
    } catch (err) {
      console.error("DOCX Export Error:", err);
      alert(`Export error: ${err}`);
    } finally {
      setIsExporting(false);
    }
  };

  const activeCancerType = useMemo(() => {
    if (!researchState.activeDisease) return null;
    return detectCancerType(researchState.activeDisease.name);
  }, [researchState.activeDisease]);
  
  const displayTargets = useMemo(() => {
    let result = researchState.targets.map(t => {
      const newUsefulness = { ...(t.usefulness || {}) };
      researchState.globalHiddenMetrics?.forEach(m => {
        newUsefulness[m] = 'not-useful';
      });
      return { ...t, usefulness: newUsefulness };
    });


    // Apply filters
    if (researchState.filters && researchState.filters.length > 0) {
      const fieldMapping: Record<string, string> = {
        'gene': 'symbol',
        'gene_name': 'name',
        'genetic_score': 'geneticScore',
        'literature_score': 'literatureScore',
        'get_score': 'getScore',
        'expression_score': 'combinedExpression',
        'target_score': 'targetScore',
        'overall_score': 'overallScore',
        'priority_score': 'priorityScore'
      };
      const phaseMap: Record<string, number> = { 'N/A': 0, 'EARLY_PHASE1': 1, 'PHASE1': 2, 'PHASE2': 3, 'PHASE3': 4, 'PHASE4': 5 };

      const drillDownFields = ['paper_count', 'recent_paper_count', 'latest_publication_date', 'total_signals', 'recent_signals', 'signal_velocity', 'clinical_flags'];

      result = result.filter(t => {
        return researchState.filters.every(f => {
          let val: any;
          const internalField = fieldMapping[f.field] || f.field;
          if (drillDownFields.includes(f.field)) {
            if (f.field === 'clinical_flags') {
              val = t.clinical_flags || [];
            } else {
              val = (t.drillDown as any)?.[f.field];
            }
            if (f.field === 'max_phase') val = phaseMap[val || 'N/A'];
            if (f.field === 'signal_velocity' && typeof val === 'string') val = parseFloat(val.replace('%', ''));
          } else {
            val = (t as any)[internalField];
          }
          
          if (val === undefined) return false;

          if (f.field === 'clinical_flags') {
            if (f.operator === 'contains') return val.includes(f.stringValue);
            if (f.operator === 'not_contains') return !val.includes(f.stringValue);
            return true;
          }

          if (f.field === 'latest_publication_date' && typeof val === 'string' && f.value) {
            const valYear = parseInt(val.substring(0, 4));
            if (!isNaN(valYear)) {
              if (f.operator === '>') return valYear > f.value;
              if (f.operator === '<') return valYear < f.value;
              if (f.operator === '>=') return valYear >= f.value;
              if (f.operator === '<=') return valYear <= f.value;
              if (f.operator === '=') return valYear === f.value;
              if (f.operator === '!=') return valYear !== f.value;
            }
          }

          const compareValue = f.boolValue !== undefined ? f.boolValue : (f.stringValue !== undefined ? f.stringValue : f.value);

          if (f.operator === '>') return val > compareValue;
          if (f.operator === '<') return val < compareValue;
          if (f.operator === '>=') return val >= compareValue;
          if (f.operator === '<=') return val <= compareValue;
          if (f.operator === '=') return val === compareValue;
          if (f.operator === '!=') return val !== compareValue;
          if (f.operator === 'between') return val >= (f.value || 0) && val <= (f.value2 || 0);
          return true;
        });
      });
    }

    // Apply sorts
    result.sort((a, b) => {
      // Primary sort: Pinned targets first
      const aPinned = Object.values(a.usefulness || {}).some(v => v === 'pinned');
      const bPinned = Object.values(b.usefulness || {}).some(v => v === 'pinned');
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;

      if (researchState.sorts && researchState.sorts.length > 0) {
        const fieldMapping: Record<string, string> = {
          'genetic_score': 'geneticScore',
          'literature_score': 'literatureScore',
          'get_score': 'getScore',
          'expression_score': 'combinedExpression',
          'target_score': 'targetScore',
          'overall_score': 'overallScore',
          'priority_score': 'priorityScore'
        };
        const phaseMap: Record<string, number> = { 'N/A': 0, 'EARLY_PHASE1': 1, 'PHASE1': 2, 'PHASE2': 3, 'PHASE3': 4, 'PHASE4': 5 };

        const drillDownFields = ['paper_count', 'recent_paper_count', 'latest_publication_date', 'total_signals', 'recent_signals', 'signal_velocity'];

        for (const s of researchState.sorts) {
          const internalField = fieldMapping[s.field] || s.field;
          let valA = (a as any)[internalField];
          let valB = (b as any)[internalField];
          if (drillDownFields.includes(s.field)) {
            valA = (a.drillDown as any)?.[s.field] || 0;
            valB = (b.drillDown as any)?.[s.field] || 0;
            if (s.field === 'signal_velocity') {
              valA = typeof valA === 'string' ? parseFloat(valA.replace('%', '')) : (valA || 0);
              valB = typeof valB === 'string' ? parseFloat(valB.replace('%', '')) : (valB || 0);
            }
          }
          if (valA !== valB) {
            if (typeof valA === 'number' && typeof valB === 'number') {
              return s.direction === 'desc' ? valB - valA : valA - valB;
            }
            // Fallback for strings
            const strA = String(valA);
            const strB = String(valB);
            return s.direction === 'desc' ? strB.localeCompare(strA) : strA.localeCompare(strB);
          }
        }
      }

      // Default fallback sort: overallScore desc
      return b.overallScore - a.overallScore;
    });

    return result;
  }, [researchState.targets, researchState.filters, researchState.sorts]);

  const analyzeSurvival = useCallback(async () => {
    if (!activeCancerType || researchState.targets.length === 0) return;
    setResearchState(p => ({ ...p, isAnalyzingSurvival: true }));
    try {
      // Step 1: Fetch and Process Clinical Data
      const clinicalRows = await api.getTcgaClinical(activeCancerType);
      
      const allProcessed = clinicalRows
        .map(row => {
          const sid = row.SAMPLEID ?? row.sampleid ?? row.SampleID ?? row.sample_id ?? row.Sample_ID ?? row.sample ?? row.PATIENT_ID ?? row.patient_id;
          const os = row["os_time"] ?? row["os.time"] ?? row.OS_TIME ?? row.OsTime ?? row.os_days ?? row.days_to_last_followup ?? row.days_to_death ?? row.SURVIVAL_TIME ?? row.survival_time;
          const race = row.RACE ?? row.race ?? row.Race ?? 'Unknown';
          const gender = row.GENDER ?? row.gender ?? row.Gender ?? 'Unknown';
          const ageRaw = row.AGE_AT_INITIAL_PATHOLOGIC_DIAGNOSIS ?? row.age_at_initial_pathologic_diagnosis ?? row.age ?? row.Age ?? '0';
          const age = parseInt(ageRaw) || 0;
          
          let ageGroup = 'Unknown';
          if (age > 0) {
            if (age < 40) ageGroup = '< 40';
            else if (age <= 60) ageGroup = '40-60';
            else if (age <= 80) ageGroup = '60-80';
            else ageGroup = '> 80';
          }

          return {
            sampleid: sid,
            os_time: parseFloat(os),
            race: race,
            gender: gender,
            ageGroup: ageGroup
          };
        })
        .filter(row => row.sampleid && !isNaN(row.os_time));

      // Extract unique values for filters
      const uniqueRaces = Array.from(new Set(allProcessed.map(p => p.race))).filter(Boolean).sort();
      const uniqueGenders = Array.from(new Set(allProcessed.map(p => p.gender))).filter(Boolean).sort();
      const uniqueAgeGroups = Array.from(new Set(allProcessed.map(p => p.ageGroup))).filter(Boolean).sort();

      // Apply filters
      let processedClinical = allProcessed;
      if (researchState.activeRace) {
        processedClinical = processedClinical.filter(p => p.race === researchState.activeRace);
      }
      if (researchState.activeGender) {
        processedClinical = processedClinical.filter(p => p.gender === researchState.activeGender);
      }
      if (researchState.activeAgeGroup) {
        processedClinical = processedClinical.filter(p => p.ageGroup === researchState.activeAgeGroup);
      }

      if (processedClinical.length === 0) {
        console.warn("No valid clinical records found for survival analysis after filtering.");
        setResearchState(p => ({ 
          ...p, 
          survivalMetrics: {}, 
          medianOs: 0, 
          availableRaces: uniqueRaces,
          availableGenders: uniqueGenders,
          availableAgeGroups: uniqueAgeGroups
        }));
        return;
      }

      // Compute median of os_time
      const sortedOs = [...processedClinical].map(p => p.os_time).sort((a, b) => a - b);
      let median: number;
      const mid = Math.floor(sortedOs.length / 2);
      if (sortedOs.length % 2 === 0) {
        median = (sortedOs[mid - 1] + sortedOs[mid]) / 2;
      } else {
        median = sortedOs[mid];
      }

      // Assign survival group
      const groupMap: Record<string, 'HIGH' | 'LOW'> = {};
      processedClinical.forEach(p => {
        if (p.sampleid) {
          groupMap[p.sampleid.toString().toUpperCase()] = p.os_time > median ? 'HIGH' : 'LOW';
        }
      });

      // Step 2: Fetch Expression Data in Batches
      const geneSymbols = Array.from(new Set(
        researchState.targets
          .map(t => t.symbol?.toString().trim().toUpperCase())
          .filter(Boolean) as string[]
      ));
      
      const sumHigh: Record<string, number> = {};
      const countHigh: Record<string, number> = {};
      const sumLow: Record<string, number> = {};
      const countLow: Record<string, number> = {};

      // Initialize counters
      geneSymbols.forEach(s => {
        sumHigh[s] = 0; countHigh[s] = 0;
        sumLow[s] = 0; countLow[s] = 0;
      });

      // Split into batches of 10 genes for better reliability
      for (let i = 0; i < geneSymbols.length; i += 10) {
        const batch = geneSymbols.slice(i, i + 10);
        
        const page = await api.getTcgaExpressionPage(activeCancerType, batch, 0);
        if (!page.items) continue;

        page.items.forEach(item => {
          const sid = (item.SAMPLEID ?? item.sampleid ?? item.SampleID ?? item.sample_id ?? item.Sample_ID ?? item.sample ?? item.PATIENT_ID ?? item.patient_id)?.toString().trim().toUpperCase();
          const gene = (item.GENE_SYMBOL ?? item.gene_symbol ?? item.GeneSymbol ?? item.symbol ?? item.Symbol ?? item.gene)?.toString().trim().toUpperCase();
          const rawVal = item.EXPRESSION_VALUE ?? item.value ?? item.expression_value ?? item.ExpressionValue ?? item.tpm ?? item.TPM ?? item.exp;
          const val = Number(rawVal);
          
          if (sid && gene && groupMap[sid] && !isNaN(val)) {
            // We check if the gene is in our initialization list to avoid NaN
            if (countHigh[gene] !== undefined) {
              if (groupMap[sid] === 'HIGH') {
                sumHigh[gene] += val;
                countHigh[gene]++;
              } else {
                sumLow[gene] += val;
                countLow[gene]++;
              }
            }
          }
        });
      }

      console.log('Example counts TP53:', countHigh['TP53'], countLow['TP53']);
      console.log('Example means TP53:', sumHigh['TP53']/countHigh['TP53'], sumLow['TP53']/countLow['TP53']);
      console.log("Sample groupMap keys (first 3):", Object.keys(groupMap).slice(0, 3));
      console.log("Total grouped patients:", Object.keys(groupMap).length);        
      // Step 3: Compute Final Metrics
      const metrics: SurvivalMetrics = {};
      const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
      const maxAbs = 2; 
      const norm = (x: number) => clamp(x / maxAbs, -1, 1);
      const threshold = 0.05;
      const status = (v: number): 'up' | 'down' | 'neutral' =>
        v > threshold ? 'up' : v < -threshold ? 'down' : 'neutral';

      researchState.targets.forEach(t => {
        const s = t.symbol?.toString().trim().toUpperCase();
        if (!s) return;
        
        const mHigh = countHigh[s] > 0 ? sumHigh[s] / countHigh[s] : 0;
        const mLow = countLow[s] > 0 ? sumLow[s] / countLow[s] : 0;
        
        // Normalize for terrain visualization
        const normHigh = norm(mHigh);
        const normLow = norm(mLow);

        metrics[t.symbol] = {
          meanHigh: normHigh,
          meanLow: normLow,
          highDiff: normHigh,
          lowDiff: normLow,
          highStatus: status(normHigh),
          lowStatus: status(normLow),
          nHigh: countHigh[s],
          nLow: countLow[s],
          nUsedHigh: countHigh[s],
          nUsedLow: countLow[s],
          log1pHigh: 0,
          log1pLow: 0
        };
      });

      setResearchState(p => {
        const sortedTargets = [...p.targets].sort((a, b) => {
          const metA = metrics[a.symbol];
          const metB = metrics[b.symbol];
          if (!metA || !metB) return 0;
          const deltaA = Math.abs(metA.meanHigh - metA.meanLow);
          const deltaB = Math.abs(metB.meanHigh - metB.meanLow);
          return deltaB - deltaA;
        });
        return { 
          ...p, 
          targets: sortedTargets,
          survivalMetrics: metrics, 
          medianOs: median,
          availableRaces: uniqueRaces,
          availableGenders: uniqueGenders,
          availableAgeGroups: uniqueAgeGroups,
          lastAnalyzedRace: researchState.activeRace,
          lastAnalyzedGender: researchState.activeGender,
          lastAnalyzedAgeGroup: researchState.activeAgeGroup
        };
      });
    } catch (e) {
      console.error("Survival analysis failed:", e);
    } finally {
      setResearchState(p => ({ ...p, isAnalyzingSurvival: false }));
    }
  }, [activeCancerType, researchState.targets, researchState.activeRace, researchState.activeGender, researchState.activeAgeGroup]);

  useEffect(() => {
    const needsAnalysis = !researchState.survivalMetrics || 
      researchState.lastAnalyzedRace !== researchState.activeRace ||
      researchState.lastAnalyzedGender !== researchState.activeGender ||
      researchState.lastAnalyzedAgeGroup !== researchState.activeAgeGroup;
    if (viewMode === 'survival' && activeCancerType && needsAnalysis && !researchState.isAnalyzingSurvival) {
      analyzeSurvival();
    }
  }, [viewMode, activeCancerType, researchState.activeRace, researchState.activeGender, researchState.activeAgeGroup, researchState.survivalMetrics, researchState.lastAnalyzedRace, researchState.lastAnalyzedGender, researchState.lastAnalyzedAgeGroup, researchState.isAnalyzingSurvival, analyzeSurvival]);

  const calculatePriorityScores = (targets: Target[]): Target[] => {
    const interventionalCounts = targets.map(t => t.drillDown?.interventional_count || 0);
    const maxInterventional = Math.max(...interventionalCounts, 1);

    const velocities = targets.map(t => {
      const vStr = t.drillDown?.signal_velocity || "0%";
      return parseFloat(vStr.replace('%', '')) || 0;
    });
    const maxVelocity = Math.max(...velocities, 1);

    return targets.map(t => {
      const interventional = t.drillDown?.interventional_count || 0;
      const interventional_normalized = interventional / maxInterventional;

      const vStr = t.drillDown?.signal_velocity || "0%";
      const velocity = parseFloat(vStr.replace('%', '')) || 0;
      const velocity_normalized = velocity / maxVelocity;

      const getScore = t.getScore || 0;
      const priorityScore = (getScore * 0.70) + (interventional_normalized * 0.20) + (velocity_normalized * 0.10);

      const clinical_flags: string[] = [];
      if (t.drillDown) {
        const dd = t.drillDown;
        const total_trials_globally = dd.total_trials_globally || 0;
        const max_phase = dd.max_phase || 'N/A';

        // Flag 1 — "Clinically Unexplored"
        if (t.geneticScore > 0.7 && interventional === 0) {
          clinical_flags.push("Strong genetic evidence but no interventional trials in this disease");
        }

        // Flag 2 — "Pipeline Elsewhere"
        if (interventional === 0 && total_trials_globally > 10) {
          clinical_flags.push("Active clinical pipeline exists but not in this disease");
        }

        // Flag 3 — "Clinically Validated"
        if (max_phase === 'PHASE4' || max_phase === 'PHASE3') {
          clinical_flags.push("Advanced clinical validation in this disease");
        }

        // Flag 4 — "Early Stage Only"
        if (interventional > 0 && (max_phase === 'PHASE1' || max_phase === 'EARLY_PHASE1')) {
          clinical_flags.push("Clinical pursuit is early stage only");
        }

        // Flag 5 — "High Tractability Gap"
        if (t.targetScore === 1.0 && interventional === 0) {
          clinical_flags.push("Approved drug exists but no trials in this disease");
        }
      }

      return { ...t, priorityScore, clinical_flags };
    });
  };

  const handleToolExecution = useCallback(async (name: string, args: any) => {
    setLoading(true);
    try {
      const fieldMapping: Record<string, string> = {
        'gene': 'symbol',
        'gene_name': 'name',
        'genetic_score': 'geneticScore',
        'literature_score': 'literatureScore',
        'get_score': 'getScore',
        'expression_score': 'combinedExpression',
        'target_score': 'targetScore',
        'overall_score': 'overallScore',
        'priority_score': 'priorityScore'
      };
      const phaseMap: Record<string, number> = { 'N/A': 0, 'EARLY_PHASE1': 1, 'PHASE1': 2, 'PHASE2': 3, 'PHASE3': 4, 'PHASE4': 5 };

      switch (name) {
        case 'search_diseases': {
          let opts = await api.searchDiseases(args.query);
          if (opts.length === 0) return `No records found for "${args.query}". Please try a more specific or standard clinical term.`;
          opts = opts.sort((a, b) => (b.score || 0) - (a.score || 0));
          const maxScore = opts[0]?.score || 1;
          const filteredOpts = opts.filter(o => (o.score || 0) / maxScore > 0.8).slice(0, 5);
          if (filteredOpts.length === 0 && opts.length > 0) filteredOpts.push(opts[0]);
          if (filteredOpts.length === 1) {
            const opt = filteredOpts[0];
            setLoadingMessage("Fetching top gene associations...");
            const genes = await api.getGenes(opt.id, 20, 0);
            
            const batchSize = 3;
            const updatedGenes = [...genes];
            for (let i = 0; i < updatedGenes.length; i += batchSize) {
              const batch = updatedGenes.slice(i, i + batchSize);
              const batchNum = Math.floor(i / batchSize) + 1;
              const totalBatches = Math.ceil(updatedGenes.length / batchSize);
              
              const messages = [
                "Analyzing clinical trial landscape...",
                "Calculating publication momentum...",
                "Building evidence profiles...",
                "Finalizing target intelligence...",
                "Synthesizing research data...",
                "Cross-referencing clinical signals...",
                "Evaluating therapeutic potential..."
              ];
              setLoadingMessage(`${messages[batchNum - 1] || "Processing evidence..."} (batch ${batchNum} of ${totalBatches})`);
              
              await Promise.all(batch.map(async (g, idx) => {
                const dd = await api.getDrillDownData(g.symbol, opt.name);
                updatedGenes[i + idx] = { ...g, drillDown: dd };
              }));

              if (i + batchSize < updatedGenes.length) {
                await new Promise(resolve => setTimeout(resolve, 800));
              }
            }
            
            setLoadingMessage("Ranking targets by composite evidence...");
            const finalGenes = calculatePriorityScores(updatedGenes);
            const enr = await api.getEnrichment(finalGenes.map(g => g.symbol));
            
            setResearchState(prev => ({ ...prev, targets: finalGenes, enrichment: enr, activeDisease: opt, focusSymbol: null, currentPage: 0, survivalMetrics: undefined, medianOs: undefined }));
            return `Project set to ${opt.name}. Molecular evidence mapped with composite scoring.`;
          }
          return { content: `I found several standard matches. Please refine your clinical focus:`, options: filteredOpts };
        }
        case 'get_genes': {
          setLoadingMessage("Fetching top gene associations...");
          const genes = await api.getGenes(args.id, 20, 0);
          
          const batchSize = 3;
          const updatedGenes = [...genes];
          for (let i = 0; i < updatedGenes.length; i += batchSize) {
            const batch = updatedGenes.slice(i, i + batchSize);
            const batchNum = Math.floor(i / batchSize) + 1;
            const totalBatches = Math.ceil(updatedGenes.length / batchSize);
            
            const messages = [
              "Analyzing clinical trial landscape...",
              "Calculating publication momentum...",
              "Building evidence profiles...",
              "Finalizing target intelligence...",
              "Synthesizing research data...",
              "Cross-referencing clinical signals...",
              "Evaluating therapeutic potential..."
            ];
            setLoadingMessage(`${messages[batchNum - 1] || "Processing evidence..."} (batch ${batchNum} of ${totalBatches})`);
            
            await Promise.all(batch.map(async (g, idx) => {
              const dd = await api.getDrillDownData(g.symbol, args.name);
              updatedGenes[i + idx] = { ...g, drillDown: dd };
            }));

            if (i + batchSize < updatedGenes.length) {
              await new Promise(resolve => setTimeout(resolve, 800));
            }
          }
          
          setLoadingMessage("Ranking targets by composite evidence...");
          const finalGenes = calculatePriorityScores(updatedGenes);
          const enr = await api.getEnrichment(finalGenes.map(g => g.symbol));
          
          setResearchState(prev => ({ ...prev, targets: finalGenes, enrichment: enr, activeDisease: { id: args.id, name: args.name }, focusSymbol: null, currentPage: 0, survivalMetrics: undefined, medianOs: undefined }));
          return `Target prioritization complete for ${args.name} with composite scoring.`;
        }
        case 'get_target_list': {
          if (displayTargets.length === 0) return "Target list is currently empty or no genes match the current filters.";
          const list = displayTargets.slice(0, args.limit || 50).map(t => ({
            symbol: t.symbol,
            name: t.name,
            overall_score: t.overallScore.toFixed(3),
            get_score: t.getScore?.toFixed(3) || 'N/A',
            genetic_score: t.geneticScore.toFixed(3)
          }));
          return `Current target list (${list.length} genes shown):\n` + list.map(t => `- **${t.symbol}**: ${t.name} (GET: ${t.get_score}, Overall: ${t.overall_score})`).join('\n');
        }
        case 'get_target_details': {
          const symbol = args.symbol;
          let target = researchState.targets.find(t => t.symbol === symbol);
          if (!target) return `Target ${symbol} not found in current list.`;
          if (!target.drillDown) {
            const data = await api.getDrillDownData(symbol, researchState.activeDisease?.name || '');
            const updatedTargets = calculatePriorityScores(researchState.targets.map(t => t.symbol === symbol ? { ...t, drillDown: data } : t));
            setResearchState(prev => ({
              ...prev,
              targets: updatedTargets
            }));
            target = updatedTargets.find(t => t.symbol === symbol)!;
          }
          return `### Detailed Evidence for ${symbol} (${target.name})\n` +
            `- **Priority Score**: ${target.priorityScore?.toFixed(4)}\n` +
            `- **Genetic Score**: ${target.geneticScore.toFixed(4)}\n` +
            `- **Clinical Flags**: ${target.clinical_flags?.join(', ') || 'None'}\n` +
            `- **Paper Count**: ${target.drillDown?.paper_count}\n` +
            `- **Recent Papers**: ${target.drillDown?.recent_paper_count}\n` +
            `- **Latest Publication**: ${target.drillDown?.latest_publication_date}\n\n`;
        }
        case 'get_active_filters': {
          const filters = researchState.filters.map(f => `${f.field} ${f.operator} ${f.boolValue !== undefined ? f.boolValue : (f.stringValue !== undefined ? f.stringValue : f.value)}`).join(', ');
          const sorts = researchState.sorts.map(s => `${s.field} (${s.direction})`).join(', ');
          return `Active Filters: ${filters || 'None'}\nActive Sorts: ${sorts || 'None'}\nTotal matching genes: ${displayTargets.length}`;
        }
        case 'apply_filters': {
          const drillDownFields = ['paper_count', 'recent_paper_count', 'latest_publication_date', 'total_signals', 'recent_signals', 'signal_velocity', 'clinical_flags'];
          const needsDrillDown = args.conditions.some((c: any) => 
            drillDownFields.includes(c.field)
          );
          if (needsDrillDown) {
            const targetsToFetch = researchState.targets.filter(t => !t.drillDown);
            if (targetsToFetch.length > 0) {
              const results = await Promise.all(targetsToFetch.map(t => api.getDrillDownData(t.symbol, researchState.activeDisease?.name || '')));
              const updatedTargets = calculatePriorityScores(researchState.targets.map(t => {
                const idx = targetsToFetch.findIndex(tf => tf.symbol === t.symbol);
                return idx >= 0 ? { ...t, drillDown: results[idx] } : t;
              }));
              setResearchState(prev => ({ ...prev, targets: updatedTargets, filters: [...prev.filters, ...args.conditions] }));
            } else {
              setResearchState(prev => ({ ...prev, filters: [...prev.filters, ...args.conditions] }));
            }
          } else {
            setResearchState(prev => ({ ...prev, filters: [...prev.filters, ...args.conditions] }));
          }
          return `Applied ${args.conditions.length} new filter(s). Total active filters: ${researchState.filters.length + args.conditions.length}.`;
        }
        case 'remove_filters': {
          if (args.all) {
            setResearchState(prev => ({ ...prev, filters: [] }));
            return "All filters removed.";
          }
          const remaining = researchState.filters.filter(f => !args.fields.includes(f.field));
          setResearchState(prev => ({ ...prev, filters: remaining }));
          return `Removed filters for: ${args.fields.join(', ')}. ${remaining.length} filters remain.`;
        }
        case 'replace_filters': {
          const updated = researchState.filters.filter(f => f.field !== args.old_field);
          setResearchState(prev => ({ ...prev, filters: [...updated, args.new_condition] }));
          return `Replaced filter on ${args.old_field} with new condition on ${args.new_condition.field}.`;
        }
        case 'reset_target_list_view': {
          setResearchState(prev => ({ ...prev, filters: [], sorts: [] }));
          return "Target list view reset. All filters and sorts cleared.";
        }
        case 'preview_filter_effect': {
          // Simulate filtering
          const phaseMap: Record<string, number> = { 'N/A': 0, 'EARLY_PHASE1': 1, 'PHASE1': 2, 'PHASE2': 3, 'PHASE3': 4, 'PHASE4': 5 };
          const drillDownFields = ['paper_count', 'recent_paper_count', 'latest_publication_date', 'total_signals', 'recent_signals', 'signal_velocity', 'clinical_flags'];
          const tempFiltered = displayTargets.filter(t => {
            let val: any;
            const internalField = fieldMapping[args.condition.field] || args.condition.field;
            if (drillDownFields.includes(args.condition.field)) {
              if (args.condition.field === 'clinical_flags') {
                val = t.clinical_flags || [];
              } else {
                val = (t.drillDown as any)?.[args.condition.field];
              }
              if (args.condition.field === 'max_phase') val = phaseMap[val || 'N/A'];
              if (args.condition.field === 'signal_velocity' && typeof val === 'string') val = parseFloat(val.replace('%', ''));
            } else {
              val = (t as any)[internalField];
            }
            if (val === undefined) return false;

            if (args.condition.field === 'clinical_flags') {
              if (args.condition.operator === 'contains') return val.includes(args.condition.stringValue);
              if (args.condition.operator === 'not_contains') return !val.includes(args.condition.stringValue);
              return true;
            }

            const compareValue = args.condition.boolValue !== undefined ? args.condition.boolValue : (args.condition.stringValue !== undefined ? args.condition.stringValue : args.condition.value);
            if (args.condition.operator === '>') return val > compareValue;
            if (args.condition.operator === '<') return val < compareValue;
            if (args.condition.operator === '=') return val === compareValue;
            return true;
          });
          return `Preview: Applying this filter would change the result set from ${displayTargets.length} to ${tempFiltered.length} genes.`;
        }
        case 'filter_targets': {
          // Legacy support: now updates state
          const drillDownFields = ['paper_count', 'recent_paper_count', 'latest_publication_date', 'total_signals', 'recent_signals', 'signal_velocity', 'clinical_flags'];
          const needsDrillDown = args.conditions.some((c: any) => 
            drillDownFields.includes(c.field)
          );
          if (needsDrillDown) {
            const targetsToFetch = researchState.targets.filter(t => !t.drillDown);
            if (targetsToFetch.length > 0) {
              const results = await Promise.all(targetsToFetch.map(t => api.getDrillDownData(t.symbol, researchState.activeDisease?.name || '')));
              const updatedTargets = calculatePriorityScores(researchState.targets.map(t => {
                const idx = targetsToFetch.findIndex(tf => tf.symbol === t.symbol);
                return idx >= 0 ? { ...t, drillDown: results[idx] } : t;
              }));
              setResearchState(prev => ({ ...prev, targets: updatedTargets, filters: args.conditions }));
            } else {
              setResearchState(prev => ({ ...prev, filters: args.conditions }));
            }
          } else {
            setResearchState(prev => ({ ...prev, filters: args.conditions }));
          }
          return `Filters updated. ${args.conditions.length} conditions active.`;
        }
        case 'sort_targets': {
          setResearchState(prev => ({ ...prev, sorts: args.sorts }));
          return `Sort order updated: ${args.sorts.map((s: any) => `${s.field} (${s.direction})`).join(', ')}.`;
        }
        case 'compare_targets': {
          const targets = researchState.targets.filter(t => args.symbols.includes(t.symbol));
          if (targets.length === 0) return "None of the specified genes were found in the current list.";
          let table = `| Metric | ${targets.map(t => t.symbol).join(' | ')} |\n| --- | ${targets.map(() => '---').join(' | ')} |\n`;
          const scoreMetrics = ['overall_score', 'get_score', 'genetic_score', 'literature_score', 'expression_score', 'target_score'];
          scoreMetrics.forEach(m => {
            const internalField = fieldMapping[m] || m;
            table += `| ${m.replace(/_/g, ' ')} | ${targets.map(t => (t as any)[internalField]?.toFixed(3) || 'N/A').join(' | ')} |\n`;
          });
          
          const evidenceMetrics = [
            { label: 'Literature Count', field: 'total_signals' },
            { label: 'Recent Signals', field: 'recent_signals' },
            { label: 'Velocity (2y)', field: 'signal_velocity' }
          ];
          
          evidenceMetrics.forEach(m => {
            table += `| ${m.label} | ${targets.map(t => {
              const val = (t.drillDown as any)?.[m.field];
              if (val === undefined) return 'N/A';
              if (typeof val === 'boolean') return val ? 'Yes' : 'No';
              return val;
            }).join(' | ')} |\n`;
          });
          
          return `### Target Comparison\n\n${table}`;
        }
        case 'summarize_targets': {
          let set = displayTargets;
          if (args.target_set === 'filtered') {
             set = displayTargets;
          } else if (args.target_set === 'top_literature') {
            set = [...set].sort((a, b) => (b.literatureScore || 0) - (a.literatureScore || 0)).slice(0, 5);
          } else if (args.target_set === 'high_overall_low_target') {
            set = set.filter(t => t.overallScore > 0.5 && t.targetScore < 0.3).slice(0, 5);
          }
          
          return `### Summary: ${args.target_set.replace(/_/g, ' ')}\n` + 
            set.map(t => {
              let info = `- **${t.symbol}**: ${t.name}\n  - GET Score: ${t.getScore?.toFixed(3) || 'N/A'}\n  - Overall: ${t.overallScore.toFixed(3)}\n  - Literature: ${t.literatureScore?.toFixed(3) || 'N/A'}`;
              if (t.drillDown) {
                info += `\n  - Literature Count: ${t.drillDown.total_signals} (Velocity: ${t.drillDown.signal_velocity})`;
              }
              return info;
            }).join('\n');
        }
        case 'explain_target': {
          const t = researchState.targets.find(t => t.symbol === args.symbol);
          if (!t) return `Target ${args.symbol} not found.`;
          return `### Why is ${t.symbol} ranked this way?\n` +
            `- **Priority Score (${t.priorityScore?.toFixed(3) || 'N/A'})**: Weighted prioritization (70% GET, 20% Interventional, 10% Velocity).\n` +
            `- **GET Score (${t.getScore?.toFixed(3) || 'N/A'})**: Weighted prioritization (50% Genetic, 25% Expression, 25% Target).\n` +
            `- **Overall Score (${t.overallScore.toFixed(3)})**: Weighted combination of all evidence.\n` +
            `- **Genetic Evidence (${t.geneticScore.toFixed(3)})**: Strength of association from GWAS/V2G data.\n` +
            `- **Literature Support (${t.literatureScore?.toFixed(3) || 'N/A'})**: Volume of research papers.\n` +
            `- **Targetability (${t.targetScore.toFixed(3)})**: Assessment of how "druggable" the protein is.`;
        }
        case 'rank_targets': {
          const drillDownFields = ['paper_count', 'recent_paper_count', 'latest_publication_date', 'total_signals', 'recent_signals', 'signal_velocity'];
          const ranked = [...researchState.targets].sort((a, b) => {
            let scoreA = 0, scoreB = 0;
            args.priorities.forEach((p: any) => {
              const internalField = fieldMapping[p.field] || p.field;
              const weight = p.weight || 1;
              let valA = (a as any)[internalField] || 0;
              let valB = (b as any)[internalField] || 0;
              if (drillDownFields.includes(p.field)) {
                valA = (a.drillDown as any)?.[p.field] || 0;
                valB = (b.drillDown as any)?.[p.field] || 0;
                if (p.field === 'signal_velocity') {
                  valA = typeof valA === 'string' ? parseFloat(valA.replace('%', '')) : (valA || 0);
                  valB = typeof valB === 'string' ? parseFloat(valB.replace('%', '')) : (valB || 0);
                }
              }
              scoreA += valA * weight;
              scoreB += valB * weight;
            });
            return scoreB - scoreA;
          });
          setResearchState(prev => ({ ...prev, targets: ranked }));
          return `Re-ranked targets based on priorities: ${args.priorities.map((p: any) => p.field).join(', ')}. Top 5: ${ranked.slice(0, 5).map(r => r.symbol).join(', ')}.`;
        }
        case 'suggest_filters': {
          return { content: `Based on your query "${args.query}", here are some suggested filters:`, filterOptions: [
            { label: 'High GET Score', scoreType: 'getScore', threshold: 0.6, operator: 'gt' as const },
            { label: 'Strong Genetic Support', scoreType: 'geneticScore', threshold: 0.7, operator: 'gt' as const }
          ]};
        }
        case 'update_view': { 
          setViewMode(args.mode); 
          setResearchState(p => ({ ...p, focusSymbol: null })); 
          return `Visualization focus shifted to ${args.mode}.`; 
        }
        case 'load_more': {
          if (!researchState.activeDisease) return "No active condition to load more data for.";
          const nextPage = researchState.currentPage + 1;
          setLoadingMessage(`Fetching next ${researchState.limit} gene associations...`);
          const newGenes = await api.getGenes(researchState.activeDisease.id, researchState.limit, nextPage * researchState.limit);
          if (newGenes.length === 0) return "No more additional evidence found for this condition.";
          
          const batchSize = 3;
          const updatedNewGenes = [...newGenes];
          for (let i = 0; i < updatedNewGenes.length; i += batchSize) {
            const batch = updatedNewGenes.slice(i, i + batchSize);
            const batchNum = Math.floor(i / batchSize) + 1;
            const totalBatches = Math.ceil(updatedNewGenes.length / batchSize);
            
            setLoadingMessage(`Analyzing clinical evidence for new targets... (batch ${batchNum} of ${totalBatches})`);
            
            await Promise.all(batch.map(async (g, idx) => {
              const dd = await api.getDrillDownData(g.symbol, researchState.activeDisease!.name);
              updatedNewGenes[i + idx] = { ...g, drillDown: dd };
            }));

            if (i + batchSize < updatedNewGenes.length) {
              await new Promise(resolve => setTimeout(resolve, 800));
            }
          }
          
          setLoadingMessage("Recalculating composite scores for all targets...");
          const allTargets = [...researchState.targets, ...updatedNewGenes];
          const finalTargets = calculatePriorityScores(allTargets);
          
          const enr = await api.getEnrichment(finalTargets.map(g => g.symbol));
          setResearchState(prev => ({
            ...prev,
            targets: finalTargets,
            enrichment: enr,
            currentPage: nextPage
          }));
          return `Loaded ${updatedNewGenes.length} more targets for ${researchState.activeDisease.name}.`;
        }
        default: return "Acknowledged.";
      }
    } catch (err) { return "Operation error."; } finally { setLoading(false); }
  }, [researchState.activeDisease, researchState.currentPage, researchState.targets]);

  const handleChat = async (e: React.FormEvent) => {
    e.preventDefault(); if (!chatInput.trim() || isChatting) return;
    const userMsg: Message = { role: 'user', content: chatInput, timestamp: new Date() };
    const currentMessages = [...messages, userMsg];
    setMessages(currentMessages); setChatInput(""); setIsChatting(true);
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const tools = [
        { name: 'search_diseases', parameters: { type: Type.OBJECT, properties: { query: { type: Type.STRING } }, required: ['query'] } },
        { name: 'get_genes', parameters: { type: Type.OBJECT, properties: { id: { type: Type.STRING }, name: { type: Type.STRING } }, required: ['id', 'name'] } },
        { name: 'load_more', parameters: { type: Type.OBJECT, properties: {}, required: [] } },
        { name: 'update_view', parameters: { type: Type.OBJECT, properties: { mode: { type: Type.STRING, enum: ['list', 'correlation', 'enrichment', 'graph', 'terrain', 'survival', 'raw'] } }, required: ['mode'] } },
        { name: 'get_target_list', parameters: { type: Type.OBJECT, properties: { limit: { type: Type.NUMBER } } } },
        { name: 'get_active_filters', parameters: { type: Type.OBJECT, properties: {} } },
        { name: 'apply_filters', parameters: { type: Type.OBJECT, properties: { conditions: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { field: { type: Type.STRING }, operator: { type: Type.STRING, enum: ['>', '<', '>=', '<=', '=', '!=', 'between', 'contains', 'not_contains'] }, value: { type: Type.NUMBER }, value2: { type: Type.NUMBER }, boolValue: { type: Type.BOOLEAN }, stringValue: { type: Type.STRING } }, required: ['field', 'operator'] } }, logic: { type: Type.STRING, enum: ['AND', 'OR'] } }, required: ['conditions'] } },
        { name: 'remove_filters', parameters: { type: Type.OBJECT, properties: { fields: { type: Type.ARRAY, items: { type: Type.STRING } }, all: { type: Type.BOOLEAN } } } },
        { name: 'replace_filters', parameters: { type: Type.OBJECT, properties: { old_field: { type: Type.STRING }, new_condition: { type: Type.OBJECT, properties: { field: { type: Type.STRING }, operator: { type: Type.STRING }, value: { type: Type.NUMBER }, boolValue: { type: Type.BOOLEAN }, stringValue: { type: Type.STRING } } } }, required: ['old_field', 'new_condition'] } },
        { name: 'reset_target_list_view', parameters: { type: Type.OBJECT, properties: {} } },
        { name: 'preview_filter_effect', parameters: { type: Type.OBJECT, properties: { condition: { type: Type.OBJECT, properties: { field: { type: Type.STRING }, operator: { type: Type.STRING }, value: { type: Type.NUMBER } } } }, required: ['condition'] } },
        { name: 'filter_targets', parameters: { type: Type.OBJECT, properties: { conditions: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { field: { type: Type.STRING }, operator: { type: Type.STRING, enum: ['>', '<', '>=', '<=', '=', '!=', 'between', 'contains', 'not_contains'] }, value: { type: Type.NUMBER }, value2: { type: Type.NUMBER }, boolValue: { type: Type.BOOLEAN }, stringValue: { type: Type.STRING } }, required: ['field', 'operator'] } }, logic: { type: Type.STRING, enum: ['AND', 'OR'] } }, required: ['conditions'] } },
        { name: 'sort_targets', parameters: { type: Type.OBJECT, properties: { sorts: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { field: { type: Type.STRING }, direction: { type: Type.STRING, enum: ['asc', 'desc'] } }, required: ['field', 'direction'] } } }, required: ['sorts'] } },
        { name: 'compare_targets', parameters: { type: Type.OBJECT, properties: { symbols: { type: Type.ARRAY, items: { type: Type.STRING } } }, required: ['symbols'] } },
        { name: 'summarize_targets', parameters: { type: Type.OBJECT, properties: { target_set: { type: Type.STRING, enum: ['current', 'filtered', 'top_literature', 'high_overall_low_target'] } }, required: ['target_set'] } },
        { name: 'explain_target', parameters: { type: Type.OBJECT, properties: { symbol: { type: Type.STRING } }, required: ['symbol'] } },
        { name: 'get_target_details', parameters: { type: Type.OBJECT, properties: { symbol: { type: Type.STRING } }, required: ['symbol'] } },
        { name: 'suggest_filters', parameters: { type: Type.OBJECT, properties: { query: { type: Type.STRING } }, required: ['query'] } },
        { name: 'rank_targets', parameters: { type: Type.OBJECT, properties: { priorities: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { field: { type: Type.STRING }, weight: { type: Type.NUMBER } }, required: ['field'] } } }, required: ['priorities'] } }
      ];

      const systemInstruction = `You are the DiseaseToTarget AI Assistant, an intelligent terminal for Target List exploration.
      
      Core Capabilities:
      - You operate on a Target List of genes associated with a disease.
      - You use MCP-style tools to filter, sort, compare, and explain targets.
      - You interpret natural-language requests into precise tool calls.
      - You manage a persistent filter state for the Target List.
      
      Filter State Management:
      - Maintain active filters across the session.
      - Use 'get_active_filters' to see what's currently applied.
      - Use 'apply_filters' to add new conditions to the existing set.
      - Use 'remove_filters' to clear specific fields or all filters.
      - Use 'replace_filters' to update an existing condition.
      - Use 'reset_target_list_view' to clear all filters and sorts.
      - Use 'preview_filter_effect' to show impact before applying.
      
      Fields Available:
      - Gene Info: gene (symbol), gene_name (name).
      - Scores (0.0 - 1.0): overall_score, get_score (50% Genetic, 25% Exp, 25% Target), genetic_score, literature_score, expression_score, target_score.
      - Evidence Metrics: 
        - Literature: paper_count (Europe PMC count), recent_paper_count (Europe PMC 3y), total_signals (Literature Count), recent_signals (Recent signals), signal_velocity (Velocity percentage), latest_publication_date (string/date).
        - Clinical Flags (array of strings): clinical_flags. Use operator 'contains' or 'not_contains' with stringValue.
          Possible flags:
          - "Strong genetic evidence but no interventional trials in this disease"
          - "Active clinical pipeline exists but not in this disease"
          - "Advanced clinical validation in this disease"
          - "Clinical pursuit is early stage only"
          - "Approved drug exists but no trials in this disease"
      
      Interpretation Rules:
      - Comparison: "greater than", "above", "more than" (>= or >); "less than", "below" (<= or <); "equal to" (=); "not equal to" (!=).
      - Literature: "recent papers" -> recent_paper_count; "Europe PMC papers" -> paper_count; "literature papers" -> paper_count.
      - Top/Bottom: Use 'sort_targets' followed by 'get_target_list' with a limit.
      - AND/OR: Use the 'logic' parameter in 'apply_filters' or 'filter_targets'.
      - Date: For "after 2023", use field 'latest_publication_date', operator '>', value 2023.
      
      Behavior:
      - When you call a tool, acknowledge it: "Tool called: [name]".
      - Return the filtered target list based on the user's request.
      - Mention the interpreted filter conditions clearly.
      - If no rows match, explain why and suggest a relaxed filter.
      - Use Open Targets scores for ranking backbone and drill-down metrics for specific evidence.
      - Do not ask unnecessary clarification questions.
      - Always work in the context of the current Target List and its active filters.`;

      let response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: currentMessages.map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] })),
        config: { tools: [{ functionDeclarations: tools as any }], systemInstruction }
      });

      if (response.functionCalls?.length) {
        let currentHistory = [...currentMessages];
        
        for (const fc of response.functionCalls) {
          // Add tool call message to history and UI
          const toolCallMsg: Message = { 
            role: 'assistant', 
            content: `Tool called: ${fc.name}`, 
            timestamp: new Date(),
            toolCall: fc.name
          };
          setMessages(prev => [...prev, toolCallMsg]);
          currentHistory.push(toolCallMsg);

          const res = await handleToolExecution(fc.name, fc.args);
          const toolResMsg: Message = { 
            role: 'assistant', 
            content: typeof res === 'string' ? res : res.content, 
            options: typeof res === 'string' ? undefined : res.options,
            filterOptions: typeof res === 'string' ? undefined : res.filterOptions,
            timestamp: new Date() 
          };
          currentHistory.push(toolResMsg);
          setMessages(prev => [...prev, toolResMsg]);
        }

        // Always do a second pass if tools were called to provide a natural response
        const secondResponse = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: currentHistory.map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] })),
          config: { tools: [{ functionDeclarations: tools as any }], systemInstruction }
        });
        
        if (secondResponse.text) {
          setMessages(prev => [...prev, { role: 'assistant', content: secondResponse.text!, timestamp: new Date() }]);
        }
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: response.text || "Synthesizing response...", timestamp: new Date() }]);
      }
    } catch (e) { 
      setMessages(prev => [...prev, { role: 'assistant', content: "Protocol error.", timestamp: new Date() }]); 
    } finally { 
      setIsChatting(false); 
    }
  };

  if (!isAuthenticated) return <SignInPage theme={theme} toggleTheme={() => setTheme(t=>t==='dark'?'light':'dark')} onSignIn={e => { localStorage.setItem('pharm_user', e); setIsAuthenticated(true); }} />;

  return (
    <div className={`h-screen flex flex-col transition-colors duration-200 ${theme === 'dark' ? 'bg-[#0a0a0a] text-neutral-200' : 'bg-neutral-50 text-neutral-900'}`}>
      <header className={`px-6 py-3.5 flex items-center justify-between border-b ${theme === 'dark' ? 'bg-[#171717] border-neutral-800' : 'bg-white border-neutral-100'}`}>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2.5"><FlaskConical className="w-5 h-5 text-blue-500" /><h1 className="text-base font-bold tracking-tight">DiseaseTo<span className="text-blue-500">Target</span></h1></div>
          {researchState.activeDisease && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 shadow-sm">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
              <span className={`text-[10px] font-bold uppercase tracking-wider ${theme === 'dark' ? 'text-blue-400' : 'text-blue-700'}`}>
                {researchState.activeDisease.name}
              </span>
            </div>
          )}
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
              {messages.map((m, i) => (
                <div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className={`max-w-[95%] p-4 rounded-xl text-[14px] shadow-sm ${m.role === 'user' ? 'bg-blue-600 text-white' : (theme === 'dark' ? 'bg-[#171717] border border-neutral-800 text-neutral-200' : 'bg-white text-black border border-neutral-200 shadow-sm')}`}>
                    <div className="markdown-body prose prose-sm prose-neutral dark:prose-invert max-w-none text-neutral-900 dark:text-neutral-200">
                      <Markdown>{m.content}</Markdown>
                    </div>
                    {m.options && (
                      <div className="mt-4 space-y-2">
                        {m.options.map(o => (
                          <button key={o.id} onClick={() => handleToolExecution('get_genes', { id: o.id, name: o.name }).then(res => setMessages(prev => [...prev, { role: 'assistant', content: typeof res === 'string' ? res : res.content, timestamp: new Date() }]))} className="w-full p-3 rounded-lg bg-blue-600/10 border border-blue-600/20 text-left text-[11px] font-semibold uppercase hover:bg-blue-600 hover:text-white transition-all shadow-sm">
                            {o.name}
                          </button>
                        ))}
                      </div>
                    )}
                    {m.filterOptions && (
                      <div className="mt-4 grid grid-cols-1 gap-2">
                        {m.filterOptions.map((f, idx) => (
                          <button 
                            key={idx} 
                            onClick={() => handleToolExecution('apply_filter', f).then(res => setMessages(prev => [...prev, { role: 'assistant', content: typeof res === 'string' ? res : res.content, timestamp: new Date() }]))}
                            className="w-full p-3 rounded-lg bg-emerald-600/10 border border-emerald-600/20 text-left text-[11px] font-semibold uppercase hover:bg-emerald-600 hover:text-white transition-all shadow-sm flex items-center justify-between"
                          >
                            <span>{f.label}</span>
                            <span className="opacity-60 font-mono">{f.operator === 'gt' ? '>' : '<'} {f.threshold}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {isChatting && (<div className="flex items-center gap-2 text-blue-600 px-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /><span className="text-[10px] font-bold uppercase tracking-widest">Synthesizing...</span></div>)}
           </div>
           <form onSubmit={handleChat} className="p-4 border-t border-neutral-100 dark:border-neutral-800"><div className="relative"><input type="text" value={chatInput} onChange={e=>setChatInput(e.target.value)} placeholder="Analyze condition..." className={`w-full p-3 pr-10 text-sm rounded-xl border outline-none ${theme === 'dark' ? 'bg-[#171717] border-neutral-800 text-white placeholder-neutral-600' : 'bg-neutral-50 border-neutral-300 text-black shadow-inner'}`} /><button type="submit" className="absolute right-2 top-2 p-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"><Send className="w-4 h-4" /></button></div></form>
        </aside>
        {!isLeftSidebarOpen && (<button onClick={() => setIsLeftSidebarOpen(true)} className="absolute left-4 bottom-4 z-20 p-2.5 rounded-full bg-blue-600 text-white shadow-xl hover:scale-110 transition-transform"><MessageSquare className="w-5 h-5" /></button>)}
        <section className="flex-1 flex flex-col p-6 overflow-hidden">
           <Breadcrumbs 
             activeDisease={researchState.activeDisease} 
             focusSymbol={researchState.focusSymbol}
             focusSubPage={focusSubPage}
             theme={theme}
             onNavigate={(level) => {
               if (level === 'home') {
                 setResearchState(p => ({ ...p, activeDisease: null, focusSymbol: null, enrichment: [], survivalMetrics: undefined }));
                 setFocusSubPage('main');
               } else if (level === 'disease') {
                 setResearchState(p => ({ ...p, focusSymbol: null }));
                 setFocusSubPage('main');
               } else if (level === 'target') {
                 setFocusSubPage('main');
               }
             }}
           />
           {!researchState.focusSymbol && (
             <div className="flex items-center mb-5 overflow-hidden w-full animate-in fade-in slide-in-from-left-4 duration-300">
                <div className={`flex p-1 rounded-xl border w-full overflow-x-auto custom-scrollbar-x ${theme === 'dark' ? 'bg-[#171717] border-neutral-800' : 'bg-white border-neutral-200 shadow-sm'}`}>
                  {[ {id:'list',i:List,l:'TARGET LIST'}, {id:'correlation',i:Network,l:'Correlation'}, {id:'enrichment',i:BarChart3,l:'Enrichment'}, {id:'graph',i:Share2,l:'Graph'}, {id:'terrain',i:Globe2,l:'Terrain'}, {id:'survival',i:Activity,l:'Outcome'}, {id:'raw',i:Database,l:'Cohort Data'} ].map(t => (
                    <button key={t.id} onClick={() => setViewMode(t.id as any)} className={`px-4 py-2.5 rounded-lg text-[11px] font-bold uppercase flex items-center gap-2 transition-all whitespace-nowrap min-w-fit ${viewMode === t.id ? 'bg-blue-600 text-white shadow-md' : 'text-neutral-500 hover:text-blue-600 hover:bg-blue-50/50 dark:hover:bg-neutral-800'}`}>
                      <t.i className="w-4 h-4" /> {t.l}
                    </button>
                  ))}
                </div>
             </div>
           )}
           <div className={`flex-1 rounded-2xl border overflow-hidden relative ${theme === 'dark' ? 'bg-[#121212] border-neutral-800' : 'bg-white shadow-lg'}`}>
              {(loading || researchState.isAnalyzingSurvival) && (<div className="absolute inset-0 bg-neutral-900/40 backdrop-blur-[2px] z-50 flex flex-col items-center justify-center gap-4"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /><p className="text-[11px] font-bold uppercase text-white tracking-widest">{loadingMessage}</p></div>)}
              
              {researchState.focusSymbol ? (
                <TargetDetailView 
                  target={researchState.targets.find(t => t.symbol === researchState.focusSymbol)!}
                  theme={theme}
                  diseaseName={researchState.activeDisease?.name || "Evidence"}
                  subPage={focusSubPage}
                  onToggleUsefulness={toggleUsefulness}
                  onNavigateSubPage={setFocusSubPage}
                  onBack={() => {
                    setResearchState(p => ({ ...p, focusSymbol: null }));
                    setFocusSubPage('main');
                  }}
                />
              ) : researchState.targets.length === 0 && viewMode !== 'raw' ? (<div className="h-full flex flex-col items-center justify-center p-20 text-center animate-in zoom-in duration-500"><Search className="w-16 h-16 text-blue-500 mb-8 opacity-20" /><h2 className="text-xl font-bold mb-2 text-neutral-800 dark:text-neutral-200 tracking-tight">System Ready for Research Focus</h2><p className="text-sm text-neutral-600 dark:text-neutral-500 max-w-sm leading-relaxed">Search for a therapeutic area or disease in the terminal to begin multi-modal target discovery.</p></div>) : (viewMode === 'raw' || viewMode === 'survival') && !activeCancerType ? (<div className="h-full flex flex-col items-center justify-center p-12 text-center"><div className="p-5 rounded-full bg-blue-50 dark:bg-blue-900/20 mb-6"><AlertCircle className="w-12 h-12 text-blue-600" /></div><h3 className="text-xl font-bold mb-2 text-neutral-800 dark:text-neutral-200">Optimized Context Required</h3><p className="text-sm max-w-md text-neutral-600 dark:text-neutral-500 leading-relaxed">Cohort and Outcome analytics are currently specifically tuned for high-resolution TCGA (e.g. BRCA, KIRC, BLCA) studies.</p></div>) : (
                <>
                  {viewMode === 'list' && (
                    <div className="h-full flex flex-col">
                      <div className="flex items-center justify-between p-4 border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/20">
                        <div className="flex flex-col gap-1.5">
                          <h3 className="text-[11px] font-bold uppercase text-black dark:text-neutral-400 tracking-wider">Target Prioritization List</h3>
                          {(researchState.filters.length > 0 || activeCancerType) && (
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-tight">Active decision filters:</span>
                              <div className="flex flex-wrap gap-1.5">
                                {activeCancerType && (
                                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-[9px] font-bold text-blue-600 dark:text-blue-400 uppercase">
                                    Cohort = {activeCancerType} all patients
                                  </div>
                                )}
                                {researchState.filters.map((f, idx) => {
                                  let label = "";
                                  if (f.field === 'active_trial_present' && f.boolValue === true) label = "Active trials preferred";
                                  else if (f.field === 'clinical_score' && f.operator === '>' && f.value === 0) label = "Clinical score > 0";
                                  else {
                                    const field = f.field.replace(/_/g, ' ');
                                    const val = f.boolValue !== undefined ? (f.boolValue ? 'YES' : 'NO') : (f.stringValue !== undefined ? f.stringValue : (f.value2 !== undefined ? `${f.value}-${f.value2}` : f.value));
                                    label = `${field} ${f.operator} ${val}`;
                                  }
                                  return (
                                    <div key={idx} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[9px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">
                                      {label}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-4">
                          <button 
                            onClick={() => {
                              setResearchState(prev => ({
                                ...prev,
                                globalHiddenMetrics: [],
                                targets: prev.targets.map(t => ({ ...t, usefulness: {} }))
                              }));
                            }}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all shadow-sm bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700"
                          >
                            <RotateCcw className="w-3 h-3" />
                            Reset Metrics
                          </button>
                          <div className="relative">
                            <button 
                              onClick={() => setIsExportDropdownOpen(!isExportDropdownOpen)}
                              disabled={isExporting || !researchState.targets.length}
                              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all shadow-sm ${isExporting || !researchState.targets.length ? 'bg-neutral-200 text-neutral-400 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                            >
                              {isExporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Share2 className="w-3 h-3" />}
                              Export
                              <ChevronDown className={`w-3 h-3 transition-transform ${isExportDropdownOpen ? 'rotate-180' : ''}`} />
                            </button>
                            {isExportDropdownOpen && (
                              <div className="absolute right-0 mt-2 w-44 rounded-xl border bg-white dark:bg-[#171717] border-neutral-200 dark:border-neutral-800 shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in duration-200">
                                <button onClick={() => { exportToNotion(); setIsExportDropdownOpen(false); }} className="w-full px-4 py-3 text-left text-[11px] font-semibold hover:bg-neutral-50 dark:hover:bg-neutral-800 flex items-center gap-3 border-b border-neutral-100 dark:border-neutral-800 transition-colors text-neutral-700 dark:text-neutral-300">
                                  <div className="p-1.5 rounded-md bg-neutral-100 dark:bg-neutral-800"><Database className="w-3.5 h-3.5 text-neutral-500" /></div>
                                  <span>Notion</span>
                                </button>
                                <button onClick={() => { exportToDocx(); setIsExportDropdownOpen(false); }} className="w-full px-4 py-3 text-left text-[11px] font-semibold hover:bg-neutral-50 dark:hover:bg-neutral-800 flex items-center gap-3 transition-colors text-neutral-700 dark:text-neutral-300">
                                  <div className="p-1.5 rounded-md bg-blue-50 dark:bg-blue-900/20"><FileDown className="w-3.5 h-3.5 text-blue-500" /></div>
                                  <span>Download DOCX</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex-1 overflow-auto relative">
                        <table className="w-full text-left border-collapse">
                          <thead className={`sticky top-0 z-10 text-[10px] font-bold uppercase tracking-widest border-b ${theme === 'dark' ? 'bg-[#171717] border-neutral-800 text-neutral-500' : 'bg-neutral-50 border-neutral-200 text-neutral-900 shadow-sm'}`}>
                            <tr>
                              <th className="p-4 pl-4">Gene</th>
                              <th className="p-4 hidden md:table-cell">Gene Name</th>
                              <th className="p-4 text-center relative">
                                <div className="flex items-center justify-center gap-1.5">
                                  Genetic
                                  <button 
                                    onMouseEnter={() => setActiveTooltip('genetic')} 
                                    onMouseLeave={() => setActiveTooltip(null)}
                                    onClick={() => setActiveScoreInfo('genetic')}
                                    className="p-0.5 rounded-full hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors"
                                  >
                                    <Info className="w-3 h-3 text-neutral-400" />
                                  </button>
                                </div>
                                {activeTooltip === 'genetic' && (
                                  <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-64 p-4 rounded-xl border bg-white dark:bg-[#1c1c1c] border-neutral-200 dark:border-neutral-800 shadow-2xl z-50 text-left normal-case tracking-normal animate-in fade-in slide-in-from-top-2 duration-200">
                                    <div className="flex items-center gap-2 mb-2">
                                      <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/20"><Info className="w-3.5 h-3.5 text-blue-500" /></div>
                                      <h5 className="text-[12px] font-bold text-black dark:text-white">Genetic Score</h5>
                                    </div>
                                    <p className="text-[11px] text-black dark:text-neutral-400 leading-relaxed mb-3">Max of genetic_association, somatic_mutation, and genetic_literature datatype scores from Open Targets. Reflects strength of evidence linking this gene to the disease through germline variants, somatic mutations, and genetics-informed literature.</p>
                                    <button onClick={() => setActiveScoreInfo('genetic')} className="text-[10px] font-bold text-blue-600 hover:underline flex items-center gap-1">Learn more <ChevronRight className="w-3 h-3" /></button>
                                  </div>
                                )}
                              </th>
                              <th className="p-4 text-center relative">
                                <div className="flex items-center justify-center gap-1.5">
                                  Expression
                                  <button 
                                    onMouseEnter={() => setActiveTooltip('expression')} 
                                    onMouseLeave={() => setActiveTooltip(null)}
                                    onClick={() => setActiveScoreInfo('expression')}
                                    className="p-0.5 rounded-full hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors"
                                  >
                                    <Info className="w-3 h-3 text-neutral-400" />
                                  </button>
                                </div>
                                {activeTooltip === 'expression' && (
                                  <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-64 p-4 rounded-xl border bg-white dark:bg-[#1c1c1c] border-neutral-200 dark:border-neutral-800 shadow-2xl z-50 text-left normal-case tracking-normal animate-in fade-in slide-in-from-top-2 duration-200">
                                    <div className="flex items-center gap-2 mb-2">
                                      <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20"><Info className="w-3.5 h-3.5 text-emerald-500" /></div>
                                      <h5 className="text-[12px] font-bold text-black dark:text-white">Expression Score</h5>
                                    </div>
                                    <p className="text-[11px] text-black dark:text-neutral-400 leading-relaxed mb-3">Calculated from Open Targets RNA expression data across all tissues. Combines expression strength (top 3 tissue average, log-normalized) and tissue selectivity (peak tissue vs mean). Higher score means strongly and selectively expressed.</p>
                                    <button onClick={() => setActiveScoreInfo('expression')} className="text-[10px] font-bold text-emerald-600 hover:underline flex items-center gap-1">Learn more <ChevronRight className="w-3 h-3" /></button>
                                  </div>
                                )}
                              </th>
                              <th className="p-4 text-center relative">
                                <div className="flex items-center justify-center gap-1.5">
                                  Target
                                  <button 
                                    onMouseEnter={() => setActiveTooltip('target')} 
                                    onMouseLeave={() => setActiveTooltip(null)}
                                    onClick={() => setActiveScoreInfo('target')}
                                    className="p-0.5 rounded-full hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors"
                                  >
                                    <Info className="w-3 h-3 text-neutral-400" />
                                  </button>
                                </div>
                                {activeTooltip === 'target' && (
                                  <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-64 p-4 rounded-xl border bg-white dark:bg-[#1c1c1c] border-neutral-200 dark:border-neutral-800 shadow-2xl z-50 text-left normal-case tracking-normal animate-in fade-in slide-in-from-top-2 duration-200">
                                    <div className="flex items-center gap-2 mb-2">
                                      <div className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/20"><Pill className="w-3.5 h-3.5 text-amber-500" /></div>
                                      <h5 className="text-[12px] font-bold text-black dark:text-white">Target Score</h5>
                                    </div>
                                    <p className="text-[11px] text-black dark:text-neutral-400 leading-relaxed mb-3">Derived from Open Targets tractability assessment. Reflects how druggable this gene is: Approved Drug (1.0), Advanced Clinical (0.85), Phase 1 Clinical (0.70), Structure with Ligand (0.55), High-Quality Pocket (0.40), Druggable Family (0.25), Unknown (0.10).</p>
                                    <button onClick={() => setActiveScoreInfo('target')} className="text-[10px] font-bold text-amber-600 hover:underline flex items-center gap-1">Learn more <ChevronRight className="w-3 h-3" /></button>
                                  </div>
                                )}
                              </th>
                              <th className="p-4 text-center relative">
                                <div className="flex items-center justify-center gap-1.5">
                                  Literature
                                  <button 
                                    onMouseEnter={() => setActiveTooltip('literature')} 
                                    onMouseLeave={() => setActiveTooltip(null)}
                                    onClick={() => setActiveScoreInfo('literature')}
                                    className="p-0.5 rounded-full hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors"
                                  >
                                    <Info className="w-3 h-3 text-neutral-400" />
                                  </button>
                                </div>
                                {activeTooltip === 'literature' && (
                                  <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-64 p-4 rounded-xl border bg-white dark:bg-[#1c1c1c] border-neutral-200 dark:border-neutral-800 shadow-2xl z-50 text-left normal-case tracking-normal animate-in fade-in slide-in-from-top-2 duration-200">
                                    <div className="flex items-center gap-2 mb-2">
                                      <div className="p-1.5 rounded-lg bg-purple-50 dark:bg-purple-900/20"><BookOpen className="w-3.5 h-3.5 text-purple-500" /></div>
                                      <h5 className="text-[12px] font-bold text-black dark:text-white">Literature Support</h5>
                                    </div>
                                    <p className="text-[11px] text-black dark:text-neutral-400 leading-relaxed mb-3">Literature datatype score from Open Targets. Reflects the volume and quality of published evidence associating this gene with the disease, sourced from Europe PMC text mining.</p>
                                    <button onClick={() => setActiveScoreInfo('literature')} className="text-[10px] font-bold text-purple-600 hover:underline flex items-center gap-1">Learn more <ChevronRight className="w-3 h-3" /></button>
                                  </div>
                                )}
                              </th>
                              <th className="p-4 text-center relative">
                                <div className="flex items-center justify-center gap-1.5">
                                  GET Score
                                  <button 
                                    onMouseEnter={() => setActiveTooltip('get_score')} 
                                    onMouseLeave={() => setActiveTooltip(null)}
                                    onClick={() => setActiveScoreInfo('get_score')}
                                    className="p-0.5 rounded-full hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors"
                                  >
                                    <Info className="w-3 h-3 text-neutral-400" />
                                  </button>
                                </div>
                                {activeTooltip === 'get_score' && (
                                  <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-64 p-4 rounded-xl border bg-white dark:bg-[#1c1c1c] border-neutral-200 dark:border-neutral-800 shadow-2xl z-50 text-left normal-case tracking-normal animate-in fade-in slide-in-from-top-2 duration-200">
                                    <div className="flex items-center gap-2 mb-2">
                                      <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/20"><Atom className="w-3.5 h-3.5 text-indigo-500" /></div>
                                      <h5 className="text-[12px] font-bold text-black dark:text-white">GET Score</h5>
                                    </div>
                                    <p className="text-[11px] text-black dark:text-neutral-400 leading-relaxed mb-3">Composite score combining Genetic (50%), Expression (25%), and Target tractability (25%). Represents the overall biological priority of this gene as a drug target independent of Open Targets overall score.</p>
                                    <button onClick={() => setActiveScoreInfo('get_score')} className="text-[10px] font-bold text-indigo-600 hover:underline flex items-center gap-1">Learn more <ChevronRight className="w-3 h-3" /></button>
                                  </div>
                                )}
                              </th>
                              <th className="p-4 text-center relative">
                                <div className="flex items-center justify-center gap-1.5">
                                  Priority
                                  <button 
                                    onMouseEnter={() => setActiveTooltip('priority')} 
                                    onMouseLeave={() => setActiveTooltip(null)}
                                    onClick={() => setActiveScoreInfo('priority')}
                                    className="p-0.5 rounded-full hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors"
                                  >
                                    <Info className="w-3 h-3 text-neutral-400" />
                                  </button>
                                </div>
                                {activeTooltip === 'priority' && (
                                  <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-64 p-4 rounded-xl border bg-white dark:bg-[#1c1c1c] border-neutral-200 dark:border-neutral-800 shadow-2xl z-50 text-left normal-case tracking-normal animate-in fade-in slide-in-from-top-2 duration-200">
                                    <div className="flex items-center gap-2 mb-2">
                                      <div className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-900/20"><Activity className="w-3.5 h-3.5 text-rose-500" /></div>
                                      <h5 className="text-[12px] font-bold text-black dark:text-white">Priority Score</h5>
                                    </div>
                                    <p className="text-[11px] text-black dark:text-neutral-400 leading-relaxed mb-3">Advanced prioritization combining GET Score (70%), normalized Clinical Trial count (20%), and normalized Literature Velocity (10%). Provides a balanced view of biological potential and clinical momentum.</p>
                                    <button onClick={() => setActiveScoreInfo('priority')} className="text-[10px] font-bold text-rose-600 hover:underline flex items-center gap-1">Learn more <ChevronRight className="w-3 h-3" /></button>
                                  </div>
                                )}
                              </th>
                              <th className="p-4 pr-8 text-right relative">
                                <div className="flex items-center justify-end gap-1.5">
                                  Overall Score
                                  <button 
                                    onMouseEnter={() => setActiveTooltip('overall')} 
                                    onMouseLeave={() => setActiveTooltip(null)}
                                    onClick={() => setActiveScoreInfo('overall')}
                                    className="p-0.5 rounded-full hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors"
                                  >
                                    <Info className="w-3 h-3 text-neutral-400" />
                                  </button>
                                </div>
                                {activeTooltip === 'overall' && (
                                  <div className="absolute top-full right-0 mt-2 w-64 p-4 rounded-xl border bg-white dark:bg-[#1c1c1c] border-neutral-200 dark:border-neutral-800 shadow-2xl z-50 text-left normal-case tracking-normal animate-in fade-in slide-in-from-top-2 duration-200">
                                    <div className="flex items-center gap-2 mb-2">
                                      <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/20"><Atom className="w-3.5 h-3.5 text-blue-500" /></div>
                                      <h5 className="text-[12px] font-bold text-black dark:text-white">Overall Score</h5>
                                    </div>
                                    <p className="text-[11px] text-black dark:text-neutral-400 leading-relaxed mb-3">Open Targets platform overall association score combining all their evidence datatypes.</p>
                                    <button onClick={() => setActiveScoreInfo('overall')} className="text-[10px] font-bold text-blue-600 hover:underline flex items-center gap-1">Learn more <ChevronRight className="w-3 h-3" /></button>
                                  </div>
                                )}
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                            {displayTargets.map(t => {
                              const isRowPinned = t.usefulness?.['overall'] === 'pinned';
                              const areAllMetricsHidden = t.usefulness?.['literature'] === 'not-useful' && 
                                                         t.usefulness?.['discovery'] === 'not-useful';

                              return (
                                <React.Fragment key={t.id}>
                                  <tr 
                                    onClick={()=>{
                                      setResearchState(p=>({...p, focusSymbol: t.symbol}));
                                      if (!t.drillDown) handleDrillDown(t.symbol);
                                    }} 
                                    className={`cursor-pointer transition-all hover:bg-blue-50/30 dark:hover:bg-neutral-800/20 ${researchState.focusSymbol === t.symbol ? 'bg-blue-100/30 dark:bg-blue-900/10' : ''} ${isRowPinned ? 'ring-2 ring-inset ring-blue-500/50 bg-blue-50/10 dark:bg-blue-900/5' : ''}`}
                                  >
                                  <td className="p-4 pl-4 font-bold text-blue-700 dark:text-blue-500 text-[13px]">
                                    <div className="flex items-center gap-2 group">
                                      {t.symbol}
                                      {drillDownLoading === t.symbol ? (
                                        <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
                                      ) : (
                                        <ZoomIn className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-blue-400" />
                                      )}
                                    </div>
                                  </td>
                                  <td className={`p-4 text-[12px] hidden md:table-cell ${theme === 'dark' ? 'text-neutral-400' : 'text-neutral-900'}`}>{t.name}</td>
                                  <td className={`p-4 text-center font-mono text-[11px] font-medium ${theme === 'dark' ? 'text-neutral-400' : 'text-neutral-700'}`}>{t.geneticScore.toFixed(3)}</td>
                                  <td className={`p-4 text-center font-mono text-[11px] font-medium ${theme === 'dark' ? 'text-neutral-400' : 'text-neutral-700'}`}>{t.combinedExpression?.toFixed(3)}</td>
                                  <td className={`p-4 text-center font-mono text-[11px] font-medium ${theme === 'dark' ? 'text-neutral-400' : 'text-neutral-700'}`}>{t.targetScore.toFixed(3)}</td>
                                  <td className={`p-4 text-center font-mono text-[11px] font-medium ${theme === 'dark' ? 'text-neutral-400' : 'text-neutral-700'}`}>{t.literatureScore?.toFixed(3)}</td>
                                  <td className={`p-4 text-center font-mono text-[11px] font-medium ${theme === 'dark' ? 'text-indigo-400' : 'text-indigo-700'}`}>{t.getScore?.toFixed(3)}</td>
                                  <td className={`p-4 text-center font-mono text-[11px] font-bold ${theme === 'dark' ? 'text-rose-400' : 'text-rose-700'}`}>{t.priorityScore?.toFixed(3) || 'N/A'}</td>
                                  <td className="p-4 pr-8 text-right font-mono font-bold text-[12px] text-blue-600">{t.overallScore.toFixed(4)}</td>
                                </tr>
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                        </table>
                        {researchState.activeDisease && (
                          <div className="p-8 flex flex-col items-center gap-4 border-t border-neutral-100 dark:border-neutral-800 bg-neutral-50/30 dark:bg-transparent">
                            {researchState.filters.length > 0 && (
                              <div className="flex flex-wrap justify-center gap-2 mb-2">
                                {researchState.filters.map((f, i) => (
                                  <div key={i} className="flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800">
                                    <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">
                                      {f.field}: {f.operator} {f.boolValue !== undefined ? String(f.boolValue) : (f.stringValue !== undefined ? f.stringValue : f.value)}
                                    </span>
                                    <button 
                                      onClick={() => setResearchState(p => ({ ...p, filters: p.filters.filter((_, idx) => idx !== i) }))}
                                      className="p-0.5 hover:bg-blue-200 dark:hover:bg-blue-800 rounded-full transition-colors"
                                    >
                                      <X className="w-3 h-3 text-blue-600" />
                                    </button>
                                  </div>
                                ))}
                                <button 
                                  onClick={() => setResearchState(p => ({ ...p, filters: [] }))}
                                  className="text-[10px] font-bold text-neutral-500 hover:text-blue-600 uppercase tracking-widest ml-2"
                                >
                                  Clear All
                                </button>
                              </div>
                            )}
                            <button onClick={() => handleToolExecution('load_more', {})} disabled={loading} className={`group px-10 py-4 rounded-2xl bg-blue-600 text-white text-[12px] font-bold uppercase tracking-widest hover:bg-blue-700 active:scale-95 transition-all flex items-center gap-3 shadow-lg shadow-blue-600/25 disabled:opacity-50`}>{loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform" />} Load More Analysis</button>
                            <p className="text-[10px] font-bold text-neutral-500 dark:text-neutral-500 uppercase tracking-tighter">Cohort Depth: {researchState.currentPage + 1} | Buffer: 30 Targets | Showing: {displayTargets.length}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {viewMode === 'correlation' && <CorrelationView targets={displayTargets} theme={theme} />}
                  {viewMode === 'enrichment' && (<div className="p-10 h-full overflow-auto space-y-6"><div className={`flex items-center justify-between border-b pb-4 ${theme === 'dark' ? 'border-neutral-800' : 'border-neutral-200'}`}><h4 className="text-[13px] font-bold uppercase text-neutral-700 dark:text-neutral-400 tracking-wider">Molecular Pathway Analytics</h4></div><div className="grid grid-cols-1 gap-4">{researchState.enrichment.map((e, i) => { const nCoCo = Math.min(0.95, (Math.log10(e.combinedScore + 1) / 3)); return (<div key={i} className={`p-6 rounded-2xl border shadow-sm transition-hover hover:shadow-md ${theme === 'dark' ? 'bg-[#171717] border-neutral-800' : 'bg-white border-neutral-200'}`}><div className="flex flex-col lg:flex-row justify-between gap-6"><div className="space-y-4 flex-1"><div className="flex items-center gap-3"><span className={`text-[15px] font-bold tracking-tight ${theme === 'dark' ? 'text-neutral-100' : 'text-neutral-900'}`}>{e.term}</span></div><div className="flex flex-wrap gap-2">{e.genes.slice(0, 15).map(g => (<span key={g} className={`px-2.5 py-1 rounded-md text-[10px] font-bold border transition-colors ${theme === 'dark' ? 'bg-neutral-800 text-neutral-400 border-neutral-700 hover:text-blue-400' : 'bg-blue-50 text-blue-700 border-blue-100 hover:bg-blue-100'}`}>{g}</span>))}</div></div><div className="flex items-center gap-12 shrink-0"><div className="text-right"><div className="text-[10px] font-bold uppercase mb-1 text-neutral-500 tracking-wider">p-Value</div><div className="text-sm font-mono font-bold text-blue-600">{e.pValue.toExponential(3)}</div></div><div className="w-40 space-y-3"><div className="flex justify-between items-end"><span className="text-[10px] font-bold uppercase text-neutral-500 tracking-wider">Enrichment Score</span><span className="text-[11px] font-bold font-mono text-blue-600">{nCoCo.toFixed(3)}</span></div><div className={`h-2 rounded-full overflow-hidden ${theme === 'dark' ? 'bg-neutral-800' : 'bg-neutral-100 shadow-inner'}`}><div className="h-full bg-blue-600 shadow-[0_0_8px_rgba(37,99,235,0.4)]" style={{width: `${nCoCo*100}%`}} /></div></div></div></div></div>); })}</div></div>)}
                  {viewMode === 'graph' && <KnowledgeGraph targets={displayTargets} selectedId={researchState.focusSymbol || undefined} onSelect={(t)=>setResearchState(p=>({...p, focusSymbol: t?.symbol || null}))} theme={theme} />}
                  {viewMode === 'terrain' && <GeneTerrain targets={displayTargets} selectedId={researchState.targets.find(t=>t.symbol===researchState.focusSymbol)?.id} onSelect={(t)=>setResearchState(p=>({...p, focusSymbol: t?.symbol || null}))} theme={theme} />}
                  {viewMode === 'survival' && (
                    <div className="h-full flex divide-x divide-neutral-100 dark:divide-neutral-800">
                      <div className="flex-1 relative">
                        <GeneTerrain targets={displayTargets} selectedId={researchState.targets.find(t=>t.symbol===researchState.focusSymbol)?.id} onSelect={(t)=>setResearchState(p=>({...p, focusSymbol: t?.symbol || null}))} theme={theme} mode="survival" survivalMetrics={researchState.survivalMetrics} medianOs={researchState.medianOs} />
                      </div>
                      <div className={`w-80 flex flex-col overflow-hidden ${theme === 'dark' ? 'bg-[#0d0d0d]' : 'bg-white'}`}>
                        <div className="p-4 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <TableProperties className="w-4 h-4 text-neutral-500" />
                            <span className="text-[11px] font-bold uppercase text-neutral-600 dark:text-neutral-400 tracking-wider">{activeCancerType} Cohort Comparison</span>
                          </div>
                        </div>
                        
                        {/* Demographic Filters */}
                        <div className="p-4 border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50">
                          <div className="space-y-3">
                            <div>
                              <label className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest mb-1.5 block">Filter by Race</label>
                              <select 
                                value={researchState.activeRace || ''} 
                                onChange={(e) => setResearchState(p => ({ ...p, activeRace: e.target.value || undefined, survivalMetrics: undefined }))}
                                className={`w-full p-2.5 rounded-lg border text-[11px] font-semibold outline-none transition-all ${theme === 'dark' ? 'bg-[#0a0a0a] border-neutral-800 text-white focus:border-blue-600' : 'bg-white border-neutral-200 text-neutral-900 focus:border-blue-600'}`}
                              >
                                <option value="">All Races</option>
                                {researchState.availableRaces?.map(r => (
                                  <option key={r} value={r}>{r}</option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest mb-1.5 block">Filter by Gender</label>
                              <select 
                                value={researchState.activeGender || ''} 
                                onChange={(e) => setResearchState(p => ({ ...p, activeGender: e.target.value || undefined, survivalMetrics: undefined }))}
                                className={`w-full p-2.5 rounded-lg border text-[11px] font-semibold outline-none transition-all ${theme === 'dark' ? 'bg-[#0a0a0a] border-neutral-800 text-white focus:border-blue-600' : 'bg-white border-neutral-200 text-neutral-900 focus:border-blue-600'}`}
                              >
                                <option value="">All Genders</option>
                                {researchState.availableGenders?.map(g => (
                                  <option key={g} value={g}>{g}</option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest mb-1.5 block">Filter by Age Group</label>
                              <select 
                                value={researchState.activeAgeGroup || ''} 
                                onChange={(e) => setResearchState(p => ({ ...p, activeAgeGroup: e.target.value || undefined, survivalMetrics: undefined }))}
                                className={`w-full p-2.5 rounded-lg border text-[11px] font-semibold outline-none transition-all ${theme === 'dark' ? 'bg-[#0a0a0a] border-neutral-800 text-white focus:border-blue-600' : 'bg-white border-neutral-200 text-neutral-900 focus:border-blue-600'}`}
                              >
                                <option value="">All Ages</option>
                                {researchState.availableAgeGroups?.map(a => (
                                  <option key={a} value={a}>{a}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </div>
                        <div className="flex-1 overflow-auto">
                          {researchState.isAnalyzingSurvival ? (
                            <div className="h-full flex flex-col items-center justify-center p-8 text-center">
                              <Loader2 className="w-6 h-6 animate-spin text-blue-500 mb-3" />
                              <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Analyzing Cohort Expression...</p>
                              <p className="text-[9px] text-neutral-400 mt-1 italic">Processing TCGA clinical & genomic batches</p>
                            </div>
                          ) : (
                            <table className="w-full text-left">
                              <thead className={`sticky top-0 z-10 text-[9px] font-bold uppercase tracking-widest border-b ${theme === 'dark' ? 'bg-[#171717] border-neutral-800 text-neutral-500' : 'bg-neutral-50 border-neutral-200 text-neutral-700'}`}>
                                <tr>
                                  <th className="p-3 pl-4">Gene</th>
                                  <th className="p-3 text-right">High Mean</th>
                                  <th className="p-3 text-right pr-4">Low Mean</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-neutral-50 dark:divide-neutral-800">
                                {researchState.targets.map(t => {
                                  const m = researchState.survivalMetrics?.[t.symbol];
                                  return (
                                    <tr key={t.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
                                      <td className="p-3 pl-4 font-bold text-blue-600 dark:text-blue-500 text-[11px]">{t.symbol}</td>
                                      <td className="p-3 text-right font-mono text-[10px] text-neutral-600 dark:text-neutral-400">
                                        {m ? m.meanHigh.toFixed(4) : '—'}
                                      </td>
                                      <td className="p-3 text-right font-mono text-[10px] text-neutral-600 dark:text-neutral-400 pr-4">
                                        {m ? m.meanLow.toFixed(4) : '—'}
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
                  )}
                  {viewMode === 'raw' && <RawDataView targets={displayTargets} theme={theme} cancerType={activeCancerType || 'BRCA'} />}
                </>
              )}
           </div>
        </section>
      </main>

      {/* Score Information Drawer */}
      <div className={`fixed inset-y-0 right-0 w-96 bg-white dark:bg-[#0d0d0d] border-l border-neutral-200 dark:border-neutral-800 shadow-2xl z-[100] transition-transform duration-300 ease-in-out transform ${activeScoreInfo ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="h-full flex flex-col">
          <div className="p-6 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-900/20"><Info className="w-5 h-5 text-blue-600" /></div>
              <h2 className="text-lg font-bold tracking-tight text-black dark:text-white">Score Information</h2>
            </div>
            <button onClick={() => setActiveScoreInfo(null)} className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"><X className="w-5 h-5 text-neutral-400" /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-8 space-y-10">
            {activeScoreInfo === 'genetic' && (
              <section className="space-y-4">
                <h3 className="text-[11px] font-bold uppercase text-blue-600 tracking-widest">Genetic Score</h3>
                <div className="space-y-6">
                  <div>
                    <h4 className="text-[12px] font-bold mb-2 text-black dark:text-neutral-200 uppercase tracking-tighter">Description</h4>
                    <p className="text-[13px] text-neutral-900 dark:text-neutral-400 leading-relaxed">Max of genetic_association, somatic_mutation, and genetic_literature datatype scores from Open Targets. Reflects strength of evidence linking this gene to the disease through germline variants, somatic mutations, and genetics-informed literature.</p>
                  </div>
                  <div>
                    <h4 className="text-[12px] font-bold mb-2 text-black dark:text-neutral-200 uppercase tracking-tighter">Integrated Datasets</h4>
                    <ul className="list-disc list-inside text-[13px] text-neutral-900 dark:text-neutral-400 space-y-1">
                      <li>Genome-wide association studies (GWAS)</li>
                      <li>Rare variant evidence</li>
                      <li>ClinVar annotations</li>
                      <li>Gene–phenotype databases</li>
                      <li>Open Targets Genetics portal data</li>
                    </ul>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800">
                      <div className="text-[10px] font-bold text-neutral-400 uppercase mb-1">Range</div>
                      <div className="text-lg font-bold text-blue-600">0.0 — 1.0</div>
                    </div>
                  </div>
                  <div>
                    <h4 className="text-[12px] font-bold mb-2 text-black dark:text-neutral-200 uppercase tracking-tighter">Interpretation</h4>
                    <p className="text-[13px] text-neutral-900 dark:text-neutral-400 leading-relaxed">Higher score indicates stronger genetic evidence supporting disease association.</p>
                  </div>
                  <div>
                    <h4 className="text-[12px] font-bold mb-2 text-black dark:text-neutral-200 uppercase tracking-tighter">Source</h4>
                    <p className="text-[13px] text-neutral-900 dark:text-neutral-400 leading-relaxed mb-4">Open Targets Platform</p>
                    <a href="https://platform-docs.opentargets.org/associations#interpreting-association-scores" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-[11px] font-bold uppercase hover:bg-blue-700 transition-all shadow-md">Learn more on Open Targets <ExternalLink className="w-3.5 h-3.5" /></a>
                  </div>
                </div>
              </section>
            )}

            {activeScoreInfo === 'expression' && (
              <section className="space-y-4">
                <h3 className="text-[11px] font-bold uppercase text-emerald-600 tracking-widest">Expression Score</h3>
                <div className="space-y-6">
                  <div>
                    <h4 className="text-[12px] font-bold mb-2 text-black dark:text-neutral-200 uppercase tracking-tighter">Description</h4>
                    <p className="text-[13px] text-neutral-900 dark:text-neutral-400 leading-relaxed">Calculated from Open Targets RNA expression data across all tissues. Combines expression strength (top 3 tissue average, log-normalized) and tissue selectivity (peak tissue vs mean). Higher score means strongly and selectively expressed.</p>
                  </div>
                  <div>
                    <h4 className="text-[12px] font-bold mb-2 text-neutral-800 dark:text-neutral-200 uppercase tracking-tighter">Derived From</h4>
                    <ul className="list-disc list-inside text-[13px] text-neutral-600 dark:text-neutral-400 space-y-1">
                      <li>Expression Atlas</li>
                      <li>Differential expression studies</li>
                      <li>Transcriptomic datasets</li>
                    </ul>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800">
                      <div className="text-[10px] font-bold text-neutral-400 uppercase mb-1">Range</div>
                      <div className="text-lg font-bold text-emerald-600">0.0 — 1.0</div>
                    </div>
                  </div>
                  <div>
                    <h4 className="text-[12px] font-bold mb-2 text-black dark:text-neutral-200 uppercase tracking-tighter">Interpretation</h4>
                    <p className="text-[13px] text-neutral-900 dark:text-neutral-400 leading-relaxed">Higher score indicates stronger expression-based evidence supporting disease relevance.</p>
                  </div>
                  <div>
                    <a href="https://platform-docs.opentargets.org/associations#interpreting-association-scores" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-[11px] font-bold uppercase hover:bg-emerald-700 transition-all shadow-md">Learn more on Open Targets <ExternalLink className="w-3.5 h-3.5" /></a>
                  </div>
                </div>
              </section>
            )}

            {activeScoreInfo === 'target' && (
              <section className="space-y-4">
                <h3 className="text-[11px] font-bold uppercase text-amber-600 tracking-widest">Drug / Target Score</h3>
                <div className="space-y-6">
                  <div>
                    <h4 className="text-[12px] font-bold mb-2 text-black dark:text-neutral-200 uppercase tracking-tighter">Description</h4>
                    <p className="text-[13px] text-neutral-900 dark:text-neutral-400 leading-relaxed">Derived from Open Targets tractability assessment. Reflects how druggable this gene is: Approved Drug (1.0), Advanced Clinical (0.85), Phase 1 Clinical (0.70), Structure with Ligand (0.55), High-Quality Pocket (0.40), Druggable Family (0.25), Unknown (0.10).</p>
                  </div>
                  <div>
                    <h4 className="text-[12px] font-bold mb-2 text-neutral-800 dark:text-neutral-200 uppercase tracking-tighter">Derived From</h4>
                    <ul className="list-disc list-inside text-[13px] text-neutral-600 dark:text-neutral-400 space-y-1">
                      <li>ChEMBL</li>
                      <li>Drug–target relationship databases</li>
                      <li>Clinical pharmacology evidence</li>
                    </ul>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800">
                      <div className="text-[10px] font-bold text-neutral-400 uppercase mb-1">Range</div>
                      <div className="text-lg font-bold text-amber-600">0.0 — 1.0</div>
                    </div>
                  </div>
                  <div>
                    <h4 className="text-[12px] font-bold mb-2 text-black dark:text-neutral-200 uppercase tracking-tighter">Interpretation</h4>
                    <p className="text-[13px] text-neutral-900 dark:text-neutral-400 leading-relaxed">Higher score indicates stronger drug-targeting evidence.</p>
                  </div>
                  <div>
                    <a href="https://platform-docs.opentargets.org/associations#interpreting-association-scores" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 text-white text-[11px] font-bold uppercase hover:bg-amber-700 transition-all shadow-md">Learn more on Open Targets <ExternalLink className="w-3.5 h-3.5" /></a>
                  </div>
                </div>
              </section>
            )}

            {activeScoreInfo === 'overall' && (
              <section className="space-y-4">
                <h3 className="text-[11px] font-bold uppercase text-blue-600 tracking-widest">Overall Score</h3>
                <div className="space-y-6">
                  <div>
                    <h4 className="text-[12px] font-bold mb-2 text-black dark:text-neutral-200 uppercase tracking-tighter">Description</h4>
                    <p className="text-[13px] text-neutral-900 dark:text-neutral-400 leading-relaxed">Open Targets platform overall association score combining all their evidence datatypes.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800">
                      <div className="text-[10px] font-bold text-neutral-400 uppercase mb-1">Range</div>
                      <div className="text-lg font-bold text-blue-600">0.0 — 1.0</div>
                    </div>
                  </div>
                  <div>
                    <h4 className="text-[12px] font-bold mb-2 text-black dark:text-neutral-200 uppercase tracking-tighter">Interpretation</h4>
                    <p className="text-[13px] text-neutral-900 dark:text-neutral-400 leading-relaxed">Higher score indicates a more promising therapeutic target across multiple evidence dimensions.</p>
                  </div>
                  <div>
                    <a href="https://platform-docs.opentargets.org/associations#interpreting-association-scores" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-[11px] font-bold uppercase hover:bg-blue-700 transition-all shadow-md">Learn more on Open Targets <ExternalLink className="w-3.5 h-3.5" /></a>
                  </div>
                </div>
              </section>
            )}

            {activeScoreInfo === 'literature' && (
              <section className="space-y-4">
                <h3 className="text-[11px] font-bold uppercase text-purple-600 tracking-widest">Literature Support</h3>
                <div className="space-y-6">
                  <div>
                    <h4 className="text-[12px] font-bold mb-2 text-black dark:text-neutral-200 uppercase tracking-tighter">Description</h4>
                    <p className="text-[13px] text-neutral-900 dark:text-neutral-400 leading-relaxed">Literature datatype score from Open Targets. Reflects the volume and quality of published evidence associating this gene with the disease, sourced from Europe PMC text mining.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800">
                      <div className="text-[10px] font-bold text-neutral-400 uppercase mb-1">Range</div>
                      <div className="text-lg font-bold text-purple-600">0.0 — 1.0</div>
                    </div>
                  </div>
                  <div>
                    <h4 className="text-[12px] font-bold mb-2 text-black dark:text-neutral-200 uppercase tracking-tighter">Interpretation</h4>
                    <p className="text-[13px] text-neutral-900 dark:text-neutral-400 leading-relaxed">Higher score indicates extensive literature support for the target–disease association.</p>
                  </div>
                </div>
              </section>
            )}

            {activeScoreInfo === 'get_score' && (
              <section className="space-y-4">
                <h3 className="text-[11px] font-bold uppercase text-indigo-600 tracking-widest">GET Score</h3>
                <div className="space-y-6">
                  <div>
                    <h4 className="text-[12px] font-bold mb-2 text-black dark:text-neutral-200 uppercase tracking-tighter">Description</h4>
                    <p className="text-[13px] text-neutral-900 dark:text-neutral-400 leading-relaxed">Composite score calculated by GetGene combining Genetic (50%), Expression (25%), and Target tractability (25%). Represents the overall biological priority of this gene as a drug target independent of Open Targets overall score.</p>
                  </div>
                  <div className="space-y-4">
                    <h4 className="text-[12px] font-bold mb-2 text-black dark:text-neutral-200 uppercase tracking-tighter">Weighting Breakdown</h4>
                    <div className="space-y-3">
                      <div className="p-4 rounded-xl border border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-[12px] font-bold text-neutral-900 dark:text-white">Genetic Association</span>
                          <span className="text-[12px] font-bold text-indigo-600">50%</span>
                        </div>
                        <p className="text-[11px] text-neutral-500 leading-relaxed">Strength of evidence from GWAS and V2G mapping.</p>
                      </div>
                      <div className="p-4 rounded-xl border border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-[12px] font-bold text-neutral-900 dark:text-white">Expression Profile</span>
                          <span className="text-[12px] font-bold text-indigo-600">25%</span>
                        </div>
                        <p className="text-[11px] text-neutral-500 leading-relaxed">Combined tissue expression and disease-specific enrichment.</p>
                      </div>
                      <div className="p-4 rounded-xl border border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-[12px] font-bold text-neutral-900 dark:text-white">Targetability</span>
                          <span className="text-[12px] font-bold text-indigo-600">25%</span>
                        </div>
                        <p className="text-[11px] text-neutral-500 leading-relaxed">Assessment of druggability and known pharmacology.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {activeScoreInfo === 'priority' && (
              <section className="space-y-4">
                <h3 className="text-[11px] font-bold uppercase text-rose-600 tracking-widest">Priority Score</h3>
                <div className="space-y-6">
                  <div>
                    <h4 className="text-[12px] font-bold mb-2 text-black dark:text-neutral-200 uppercase tracking-tighter">Description</h4>
                    <p className="text-[13px] text-neutral-900 dark:text-neutral-400 leading-relaxed">Advanced prioritization combining biological evidence (GET Score) with real-world clinical and publication momentum. This score is designed to highlight targets that are not only biologically relevant but also have significant clinical research activity and recent publication growth.</p>
                  </div>
                  <div>
                    <h4 className="text-[12px] font-bold mb-2 text-black dark:text-neutral-200 uppercase tracking-tighter">Calculation Formula</h4>
                    <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 font-mono text-[12px] text-rose-600 leading-relaxed">
                      Priority = (GET × 0.70) + (Interventional_Norm × 0.20) + (Velocity_Norm × 0.10)
                    </div>
                  </div>
                  <div>
                    <h4 className="text-[12px] font-bold mb-2 text-black dark:text-neutral-200 uppercase tracking-tighter">Components</h4>
                    <ul className="list-disc list-inside text-[13px] text-neutral-900 dark:text-neutral-400 space-y-2">
                      <li><span className="font-bold">GET Score (70%)</span>: The core biological priority score (Genetic + Expression + Targetability).</li>
                      <li><span className="font-bold">Interventional Count (20%)</span>: Normalized count of interventional clinical trials. Reflects therapeutic interest and feasibility.</li>
                      <li><span className="font-bold">Signal Velocity (10%)</span>: Normalized publication growth rate. Reflects current research momentum and "hotness" of the target.</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-[12px] font-bold mb-2 text-black dark:text-neutral-200 uppercase tracking-tighter">Normalization</h4>
                    <p className="text-[13px] text-neutral-900 dark:text-neutral-400 leading-relaxed">Clinical and velocity metrics are normalized against the maximum value in the current target list to ensure relative ranking accuracy.</p>
                  </div>
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
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
            <h1 className={`text-3xl font-black tracking-tight ${theme === 'light' ? 'text-neutral-900' : 'text-white'}`}>DiseaseTo<span className="text-blue-600">Target</span></h1>
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