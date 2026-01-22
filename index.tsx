import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Type, Chat, GenerateContentResponse } from "@google/genai";
import { 
  Dna, 
  Activity, 
  BrainCircuit, 
  AlertCircle,
  Microscope,
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
  Target as TargetIcon,
  Lock,
  User as UserIcon,
  LogOut,
  ShieldCheck,
  Send,
  MessageSquare,
  Sparkles,
  Zap,
  Atom,
  Search,
  Filter,
  Info,
  Layers,
  BookOpen,
  ExternalLink,
  FileText,
  Pill,
  Stethoscope,
  Shield,
  ZoomIn,
  ZoomOut,
  X,
  Sliders,
  Maximize2,
  Share,
  RotateCcw,
  PanelLeft,
  PanelRight
} from 'lucide-react';

import { 
  Pathway, 
  Target, 
  DrugInfo, 
  DiseaseInfo, 
  EnrichmentResult, 
  PubMedStats, 
  Theme, 
  ViewMode, 
  TerrainLayer, 
  ResearchContext, 
  Message 
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

// --- Utils ---
const getSigmaForZoom = (scale: number) => 60.0 / scale;
const isPointInCircle = (px: number, py: number, cx: number, cy: number, r: number) => {
  return Math.sqrt((px - cx) ** 2 + (py - cy) ** 2) < r;
};
const isPointInPolygon = (pt: {x:number, y:number}, poly: {x:number, y:number}[]) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect = ((yi > pt.y) !== (yj > pt.y)) && (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
};

// --- Visualization Components ---

const KnowledgeGraph = ({ targets, selectedId, onSelect, theme }: { targets: Target[], selectedId?: string, onSelect: (t: Target | null) => void, theme: Theme }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas || !containerRef.current) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      const { width, height } = containerRef.current!.getBoundingClientRect();
      canvas.width = width * dpr; canvas.height = height * dpr;
      ctx.scale(dpr, dpr);
    };
    resize();
    const w = canvas.width / dpr, h = canvas.height / dpr;

    const nodes = targets.slice(0, 50).map((t, i) => ({
      ...t, 
      x: w/2 + (Math.random()-0.5)*400, 
      y: h/2 + (Math.random()-0.5)*400,
      vx: 0, vy: 0, r: 12 + (t.overallScore * 12),
      color: t.overallScore > 0.6 ? '#c084fc' : '#22d3ee'
    }));

    const links: { s: any, t: any, weight: number }[] = [];
    for(let i=0; i<nodes.length; i++) {
      for(let j=i+1; j<nodes.length; j++) {
        const overlap = nodes[i].pathways.filter(p1 => nodes[j].pathways.some(p2 => p1.id === p2.id)).length;
        if (overlap > 0) links.push({ s: nodes[i], t: nodes[j], weight: overlap });
      }
    }

    let ani: number;
    const tick = () => {
      ctx.clearRect(0, 0, w, h);
      
      nodes.forEach(n => {
        nodes.forEach(o => {
          if (n === o) return;
          const dx = n.x - o.x, dy = n.y - o.y, d = Math.sqrt(dx*dx+dy*dy) || 1;
          if (d < 150) { n.vx += dx/d * 0.4; n.vy += dy/d * 0.4; }
        });
        n.vx += (w/2 - n.x) * 0.005; n.vy += (h/2 - n.y) * 0.005;
      });

      links.forEach(l => {
        const dx = l.t.x - l.s.x, dy = l.t.y - l.s.y, d = Math.sqrt(dx*dx+dy*dy) || 1;
        const targetD = 100;
        const force = (d - targetD) * 0.01 * l.weight;
        l.s.vx += dx/d * force; l.s.vy += dy/d * force;
        l.t.vx -= dx/d * force; l.t.vy -= dy/d * force;
      });

      nodes.forEach(n => {
        n.vx *= 0.9; n.vy *= 0.9;
        n.x += n.vx; n.y += n.vy;
      });

      links.forEach(l => {
        ctx.beginPath(); ctx.moveTo(l.s.x, l.s.y); ctx.lineTo(l.t.x, l.t.y);
        ctx.strokeStyle = theme === 'dark' ? `rgba(6, 182, 212, ${l.weight * 0.1})` : `rgba(0, 0, 0, ${l.weight * 0.05})`;
        ctx.lineWidth = l.weight * 0.5;
        ctx.stroke();
      });

      nodes.forEach(n => {
        const isSel = n.symbol === selectedId;
        ctx.beginPath(); ctx.arc(n.x, n.y, isSel ? n.r + 5 : n.r, 0, Math.PI * 2);
        ctx.fillStyle = isSel ? (theme === 'dark' ? '#fff' : '#000') : n.color;
        ctx.shadowBlur = isSel ? 20 : 0; ctx.shadowColor = theme === 'dark' ? '#fff' : '#000';
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = theme === 'dark' ? '#fff' : '#000';
        ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(n.symbol, n.x, n.y + (isSel ? n.r + 15 : n.r + 12));
      });

      ani = requestAnimationFrame(tick);
    };
    tick();

    const onClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const hit = nodes.find(n => Math.sqrt((n.x - mx)**2 + (n.y - my)**2) < 20);
      onSelect(hit || null);
    };
    canvas.addEventListener('click', onClick);
    return () => { cancelAnimationFrame(ani); canvas.removeEventListener('click', onClick); };
  }, [targets, selectedId, theme]);

  return (
    <div ref={containerRef} className="w-full h-full relative">
      <canvas ref={canvasRef} className="w-full h-full cursor-grab active:cursor-grabbing" />
      <div className={`absolute bottom-6 right-6 p-4 rounded-2xl border backdrop-blur-md ${theme === 'dark' ? 'bg-slate-900/80 border-slate-800' : 'bg-white/80 border-slate-200'} space-y-2`}>
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-[#c084fc]" />
          <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">High Potential Targets (0.6)</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-[#22d3ee]" />
          <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Active Candidates</span>
        </div>
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full border ${theme === 'dark' ? 'bg-white border-slate-500' : 'bg-slate-900 border-slate-400'}`} />
          <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Selected Focus</span>
        </div>
      </div>
    </div>
  );
};

const GeneTerrain = ({ targets, onSelect, selectedId, theme }: { targets: Target[], onSelect: (t: Target | null) => void, selectedId: string | undefined, theme: Theme }) => {
  const glCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const shadersRef = useRef<{ [key: string]: WebGLProgram }>({});
  
  const [viewport, setViewport] = useState({ scale: 1.0, offset: { x: 0, y: 0 } });
  const [currentLayer, setCurrentLayer] = useState<TerrainLayer>('gaussian');
  const [isolineSpacing, setIsolineSpacing] = useState(0.2);
  const [lineThickness, setLineThickness] = useState(0.02);
  const [isLassoActive, setIsLassoActive] = useState(false);
  const [lassoPoints, setLassoPoints] = useState<{x:number, y:number}[]>([]);
  const [dragging, setDragging] = useState(false);
  const [lastMouse, setLastMouse] = useState<{x:number, y:number} | null>(null);

  const mappedTargets = useMemo(() => {
    return targets.map((t, i) => {
      const jitterX = Math.sin(i * 123.456) * 15;
      const jitterY = Math.cos(i * 123.456) * 15;
      const x = (t.geneticScore || 0) * 700 + 50 + jitterX;
      const y = (t.targetScore || 0) * 500 + 50 + jitterY;
      const e_star = t.combinedExpression || 0;
      const val = (0.45 * (t.geneticScore || 0)) + (0.25 * e_star) + (0.30 * (t.targetScore || 0));
      return { ...t, x, y, value: (val - 0.5) * 2.0 };
    });
  }, [targets]);

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

    const pointsData = new Float32Array(1024 * 4);
    const valuesData = new Float32Array(1024 * 4);
    mappedTargets.forEach((t, i) => {
      pointsData[i*4] = t.x!;
      pointsData[i*4+1] = t.y!;
      valuesData[i*4] = t.value!;
    });

    const pointsTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, pointsTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1024, 1, 0, gl.RGBA, gl.FLOAT, pointsData);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    const valuesTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, valuesTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1024, 1, 0, gl.RGBA, gl.FLOAT, valuesData);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    gl.uniform1i(gl.getUniformLocation(prog, "pointsTexture"), 0);
    gl.uniform1i(gl.getUniformLocation(prog, "valuesTexture"), 1);
    gl.uniform1i(gl.getUniformLocation(prog, "pointCount"), mappedTargets.length);
    gl.uniform1f(gl.getUniformLocation(prog, "sigma"), getSigmaForZoom(viewport.scale));
    gl.uniform2f(gl.getUniformLocation(prog, "resolution"), 800, 600);
    gl.uniform2f(gl.getUniformLocation(prog, "offset"), viewport.offset.x, viewport.offset.y);
    gl.uniform1f(gl.getUniformLocation(prog, "scale"), viewport.scale);
    
    if (currentLayer === 'discrete') {
      gl.uniform1f(gl.getUniformLocation(prog, "lineThickness"), lineThickness);
      gl.uniform1f(gl.getUniformLocation(prog, "isolineSpacing"), isolineSpacing);
    }

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const pos = gl.getAttribLocation(prog, "position");
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

    gl.viewport(0, 0, 800, 600);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.deleteTexture(pointsTex);
    gl.deleteTexture(valuesTex);
    gl.deleteBuffer(buf);

    const ctx = overlayCanvasRef.current?.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, 800, 600);
      ctx.setTransform(viewport.scale, 0, 0, viewport.scale, viewport.offset.x, viewport.offset.y);

      if (lassoPoints.length > 0) {
        ctx.beginPath(); ctx.moveTo(lassoPoints[0].x, lassoPoints[0].y);
        lassoPoints.forEach(p => ctx.lineTo(p.x, p.y));
        ctx.strokeStyle = '#06b6d4'; ctx.lineWidth = 2 / viewport.scale; ctx.stroke();
        if (!isLassoActive) { ctx.fillStyle = 'rgba(6, 182, 212, 0.1)'; ctx.fill(); }
      }

      mappedTargets.forEach(t => {
        const isSelected = t.id === selectedId;
        ctx.beginPath(); ctx.arc(t.x!, t.y!, (isSelected ? 8 : 4) / viewport.scale, 0, Math.PI * 2);
        ctx.fillStyle = isSelected ? (theme === 'dark' ? '#fff' : '#000') : (theme === 'dark' ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.3)');
        ctx.fill();
        if (viewport.scale > 2) {
          ctx.font = `${10 / viewport.scale}px sans-serif`;
          ctx.fillStyle = theme === 'dark' ? '#fff' : '#000';
          ctx.textAlign = 'center'; ctx.fillText(t.symbol, t.x!, t.y! + 12 / viewport.scale);
        }
      });
    }
  }, [mappedTargets, viewport, currentLayer, isolineSpacing, lineThickness, lassoPoints, isLassoActive, selectedId, theme]);

  useEffect(() => {
    const canvas = glCanvasRef.current;
    if (canvas) {
      glRef.current = canvas.getContext('webgl', { preserveDrawingBuffer: true });
      glRef.current?.getExtension('OES_texture_float');
    }
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [draw]);

  const handleMouseDown = (e: React.MouseEvent) => {
    const rect = overlayCanvasRef.current!.getBoundingClientRect();
    const x = (e.clientX - rect.left - viewport.offset.x) / viewport.scale;
    const y = (e.clientY - rect.top - viewport.offset.y) / viewport.scale;
    if (isLassoActive) setLassoPoints([{ x, y }]);
    else {
      const hit = mappedTargets.find(t => isPointInCircle(x, y, t.x!, t.y!, 10 / viewport.scale));
      if (hit) onSelect(hit);
      else { 
        setDragging(true); 
        setLastMouse({ x: e.clientX, y: e.clientY }); 
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = overlayCanvasRef.current!.getBoundingClientRect();
    const x = (e.clientX - rect.left - viewport.offset.x) / viewport.scale;
    const y = (e.clientY - rect.top - viewport.offset.y) / viewport.scale;
    if (isLassoActive && lassoPoints.length > 0) setLassoPoints(prev => [...prev, { x, y }]);
    else if (dragging && lastMouse) {
      const dx = e.clientX - lastMouse.x;
      const dy = e.clientY - lastMouse.y;
      setViewport(prev => ({ 
        ...prev, 
        offset: { x: prev.offset.x + dx, y: prev.offset.y + dy } 
      }));
      setLastMouse({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseUp = () => {
    if (isLassoActive && lassoPoints.length > 2) {
      const selected = mappedTargets.filter(t => isPointInPolygon({x: t.x!, y: t.y!}, lassoPoints));
      if (selected.length > 0) onSelect(selected[0]);
      setIsLassoActive(false);
    }
    setDragging(false); setLastMouse(null);
  };

  const handleZoomToLevel = (level: number) => {
    setViewport(prev => ({ ...prev, scale: level, offset: { x: 0, y: 0 } }));
  };

  return (
    <div className={`relative w-full h-full rounded-[3rem] overflow-hidden border ${theme === 'dark' ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
      <canvas ref={glCanvasRef} width={800} height={600} className="absolute inset-0 w-full h-full" />
      <canvas 
        ref={overlayCanvasRef} 
        width={800} height={600} 
        className={`absolute inset-0 w-full h-full ${dragging ? 'cursor-grabbing' : (isLassoActive ? 'cursor-crosshair' : 'cursor-grab')}`}
        onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}
        onWheel={e => setViewport(prev => ({ ...prev, scale: Math.max(0.1, Math.min(10, prev.scale * (e.deltaY > 0 ? 0.9 : 1.1))) }))}
      />
      <div className="absolute top-8 left-8 flex flex-col gap-4">
        <div className={`p-2 rounded-3xl border backdrop-blur-md flex flex-col gap-2 ${theme === 'dark' ? 'bg-slate-900/60 border-slate-700' : 'bg-white/60 border-slate-300'}`}>
          {[ { id: 'gaussian', icon: Globe2 }, { id: 'discrete', icon: Layers }, { id: 'water', icon: FlaskConical }, { id: 'sky', icon: Microscope } ].map(l => (
            <button key={l.id} onClick={() => setCurrentLayer(l.id as TerrainLayer)} className={`p-3 rounded-2xl transition-all ${currentLayer === l.id ? 'bg-cyan-500 text-white shadow-lg scale-105' : 'text-slate-400 hover:bg-slate-500/10'}`}><l.icon className="w-5 h-5" /></button>
          ))}
        </div>
      </div>
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-3 p-3 rounded-[2rem] border backdrop-blur-md bg-slate-900/40 border-slate-800 shadow-2xl">
        <button onClick={() => setViewport({ scale: 1.0, offset: { x: 0, y: 0 } })} className="p-3 rounded-full hover:bg-slate-500/20 text-slate-400" title="Fit to screen">
          <RotateCcw className="w-5 h-5" />
        </button>
        <div className="w-px h-6 bg-slate-800 mx-1" />
        {[1, 2, 4].map(lvl => (
          <button key={lvl} onClick={() => handleZoomToLevel(lvl)} className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${viewport.scale === lvl ? 'bg-cyan-500 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-500/10'}`}>
            {lvl}x
          </button>
        ))}
      </div>
      <div className="absolute bottom-8 right-8 flex gap-4">
        <button onClick={() => setIsLassoActive(!isLassoActive)} className={`p-4 rounded-full shadow-2xl transition-all ${isLassoActive ? 'bg-cyan-500 text-white scale-110' : 'bg-white text-slate-900'}`}>
          <Search className="w-6 h-6" />
        </button>
        <div className="flex bg-white rounded-full shadow-2xl overflow-hidden">
          <button onClick={() => setViewport(v => ({ ...v, scale: Math.min(10, v.scale * 1.2) }))} className="p-4 border-r hover:bg-slate-100 text-slate-900"><ZoomIn className="w-6 h-6" /></button>
          <button onClick={() => setViewport(v => ({ ...v, scale: Math.max(0.1, v.scale * 0.8) }))} className="p-4 hover:bg-slate-100 text-slate-900"><ZoomOut className="w-6 h-6" /></button>
        </div>
      </div>
    </div>
  );
};

// --- Literature ---
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
  if (loading) return <div className="flex items-center gap-3 py-4 animate-pulse"><Loader2 className="w-4 h-4 animate-spin text-cyan-500" /><span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Scanning PubMed...</span></div>;
  if (!stats) return null;
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom duration-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-slate-500">
          <BookOpen className="w-5 h-5 text-cyan-500" />
          <h4 className="text-[12px] font-black uppercase tracking-[0.4em]">Literature evidence</h4>
        </div>
        <a href={stats.searchLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-500 text-[9px] font-black uppercase tracking-widest hover:bg-cyan-500 hover:text-white transition-all">
          View All <ExternalLink className="w-3 h-3" />
        </a>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className={`p-4 rounded-2xl border ${theme === 'dark' ? 'bg-slate-950/20 border-slate-800/50' : 'bg-slate-50 border-slate-200'}`}>
          <div className="text-[9px] font-black text-slate-500 uppercase mb-1 tracking-widest whitespace-normal leading-tight">Direct evidence (title/abstract-level)</div>
          <div className={`text-xl font-black font-mono ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{stats.total.toLocaleString()}</div>
        </div>
        <a href={stats.primarySearchLink} target="_blank" rel="noopener noreferrer" className={`p-4 rounded-2xl border transition-all hover:border-cyan-500/50 ${theme === 'dark' ? 'bg-cyan-500/5 border-cyan-500/20' : 'bg-cyan-50 border-cyan-100'}`}>
          <div className="text-[9px] font-black text-cyan-500/70 uppercase mb-1 tracking-widest whitespace-normal leading-tight flex items-center justify-between">Primary gene–disease studies (2024-25) <ExternalLink className="w-2.5 h-2.5" /></div>
          <div className="text-xl font-black text-cyan-500 font-mono">{stats.recent.toLocaleString()}</div>
        </a>
      </div>
      <div className="space-y-3">
        {stats.topPapers.map(p => (
          <a key={p.id} href={`https://pubmed.ncbi.nlm.nih.gov/${p.id}/`} target="_blank" rel="noopener noreferrer" className={`flex items-start gap-3 p-4 rounded-2xl border transition-all hover:translate-x-1 ${theme === 'dark' ? 'bg-slate-950/40 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
            <FileText className="w-4 h-4 text-cyan-500 shrink-0 mt-0.5" />
            <div className="space-y-1 overflow-hidden">
              <p className={`text-[11px] font-bold leading-relaxed line-clamp-2 uppercase tracking-tight whitespace-normal ${theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}`}>{p.title}</p>
              <div className="text-[9px] font-mono text-slate-500">PMID: {p.id}</div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
};

// --- Drug Landscape ---
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
    fetch(); return () => { active = false; };
  }, [targetId]);
  if (loading) return <div className="flex items-center gap-3 py-4 animate-pulse"><Loader2 className="w-4 h-4 animate-spin text-cyan-500" /><span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">DrugBank Sync...</span></div>;
  const approved = drugs.filter(d => d.phase === 4);
  const experimental = drugs.filter(d => d.phase < 4);
  return (
    <div className="space-y-10">
      <div className="flex items-center gap-4 text-slate-500"><Pill className="w-5 h-5 text-cyan-500" /><h4 className="text-[12px] font-black uppercase tracking-[0.4em]">Drug Landscape</h4></div>
      <div className="space-y-8">
        <div className="space-y-4">
          <div className="flex items-center gap-3 px-1"><ShieldCheck className="w-3.5 h-3.5 text-emerald-500" /><span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Approved Modalities</span></div>
          {approved.length > 0 ? approved.map(d => (
            <div key={d.id} className={`p-4 rounded-3xl border ${theme === 'dark' ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-emerald-50 border-emerald-200'}`}><div className="flex items-center justify-between mb-2"><span className="text-[12px] font-black text-emerald-500 uppercase tracking-tight">{d.name}</span><span className="px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[8px] font-black uppercase">PHASE IV</span></div><p className="text-[10px] font-bold text-slate-500 uppercase">{d.mechanism}</p></div>
          )) : <div className="p-4 rounded-3xl border border-dashed border-slate-800 text-[10px] text-slate-600 font-black uppercase text-center opacity-40">No Approved Pharmacotherapy</div>}
        </div>
        <div className="space-y-4">
          <div className="flex items-center gap-3 px-1"><FlaskConical className="w-3.5 h-3.5 text-amber-500" /><span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Experimental pipeline</span></div>
          <div className="space-y-3 max-h-40 overflow-y-auto pr-2 scrollbar-thin">
            {experimental.map(d => (
              <div key={d.id} className={`p-4 rounded-3xl border ${theme === 'dark' ? 'bg-slate-950/40 border-slate-800' : 'bg-white border-slate-200'}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-[11px] font-black uppercase tracking-tight ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>{d.name}</span>
                  <span className={`px-2 py-0.5 rounded-full text-white text-[8px] font-black uppercase ${d.phase === 3 ? 'bg-amber-600' : 'bg-blue-600'}`}>Phase {d.phase || 'E'}</span>
                </div>
                <p className="text-[10px] font-bold text-slate-500 uppercase">{d.mechanism}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Main App ---

const App = () => {
  const [theme, setTheme] = useState<Theme>('dark');
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('pharm_user'));
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [loading, setLoading] = useState(false);
  const [researchState, setResearchState] = useState<ResearchContext>({ 
    activeDisease: null, targets: [], enrichment: [], limit: 30, currentPage: 0, focusSymbol: null 
  });
  const [messages, setMessages] = useState<Message[]>([ { role: 'assistant', content: "Discovery Platform Active. Initializing Alzheimer's Research Protocol. Enter a Clinical Query to map the GET Signal.", timestamp: new Date() } ]);
  const [chatInput, setChatInput] = useState("");
  const [isChatting, setIsChatting] = useState(false);
  
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);

  const chatScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight; }, [messages]);

  const handleToolExecution = useCallback(async (name: string, args: any) => {
    setLoading(true);
    try {
      switch (name) {
        case 'search_diseases': {
          const options = await api.searchDiseases(args.query);
          if (options.length === 0) return `No clinical hits for "${args.query}".`;
          if (options.length === 1) {
            const opt = options[0];
            const genes = await api.getGenes(opt.id, 30, 0);
            const enrichment = await api.getEnrichment(genes.map(g => g.symbol));
            setResearchState(prev => ({ ...prev, targets: genes, enrichment, activeDisease: opt, focusSymbol: genes[0]?.symbol || null, currentPage: 0 }));
            return `Resolved focus to "${opt.name}". Baseline expression and genetic evidence signals integrated. Discovery Topography available.`;
          }
          return { content: `Found ${options.length} subtypes. Select focus:`, options };
        }
        case 'get_genes': {
          const genes = await api.getGenes(args.id, 30, 0);
          const enrichment = await api.getEnrichment(genes.map(g => g.symbol));
          setResearchState(prev => ({ ...prev, targets: genes, enrichment, activeDisease: { id: args.id, name: args.name }, focusSymbol: genes[0]?.symbol || null, currentPage: 0 }));
          return `Mapped first 30 targets for ${args.name}. GET-Signal discovery protocol enabled. All tissue baseline signals synchronized.`;
        }
        case 'load_more_genes': {
          if (!researchState.activeDisease) return "Protocol Error: No active condition identified.";
          const nextPage = researchState.currentPage + 1;
          const newGenes = await api.getGenes(researchState.activeDisease.id, 30, nextPage);
          if (newGenes.length === 0) return "Registry exhausted: No further associations found.";
          const allGenes = [...researchState.targets, ...newGenes];
          const enrichment = await api.getEnrichment(allGenes.map(g => g.symbol));
          setResearchState(prev => ({ ...prev, targets: allGenes, enrichment, currentPage: nextPage }));
          return `Batch ${nextPage + 1} synchronized. Full evidence profiles populated.`;
        }
        case 'update_view': {
          setViewMode(args.mode);
          return `Switched visualization to ${args.mode}. Topography reflects evidence weights.`;
        }
        default: return "Acknowledged.";
      }
    } catch (err) { return "Discovery Error."; } finally { setLoading(false); }
  }, [researchState]);

  const handleChat = async (e: React.FormEvent) => {
    e.preventDefault(); if (!chatInput.trim() || isChatting) return;
    const userMsg: Message = { role: 'user', content: chatInput, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]); setChatInput(""); setIsChatting(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const tools = [
        { name: 'search_diseases', parameters: { type: Type.OBJECT, properties: { query: { type: Type.STRING } }, required: ['query'] } },
        { name: 'get_genes', parameters: { type: Type.OBJECT, properties: { id: { type: Type.STRING }, name: { type: Type.STRING } }, required: ['id', 'name'] } },
        { name: 'load_more_genes', parameters: { type: Type.OBJECT, properties: {} } },
        { name: 'update_view', parameters: { type: Type.OBJECT, properties: { mode: { type: Type.STRING, enum: ['list', 'enrichment', 'graph', 'terrain'] } }, required: ['mode'] } }
      ];
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: [...messages, userMsg].map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] })),
        config: { tools: [{ functionDeclarations: tools as any }], systemInstruction: "GetGene Clinical Agent. Specialized in Alzheimer's Target Discovery. Use 'search_diseases' first. Use 'get_genes' once ID is known. Interpret GET (Genetics, Expression, Tractability) signals. Maintain hypothesis-generating tone." }
      });
      if (response.functionCalls?.length) {
        for (const fc of response.functionCalls) {
          const res = await handleToolExecution(fc.name, fc.args);
          setMessages(prev => [...prev, { role: 'assistant', content: typeof res === 'string' ? res : res.content, options: typeof res === 'string' ? undefined : res.options, timestamp: new Date() }]);
        }
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: response.text || "Synchronizing...", timestamp: new Date() }]);
      }
    } catch (e) { setMessages(prev => [...prev, { role: 'assistant', content: "Sync failed.", timestamp: new Date() }]); } finally { setIsChatting(false); }
  };

  const handleSelectOption = async (opt: DiseaseInfo) => {
    setMessages(prev => [...prev, { role: 'user', content: `Focus: ${opt.name}`, timestamp: new Date() }]);
    const res = await handleToolExecution('get_genes', { id: opt.id, name: opt.name });
    setMessages(prev => [...prev, { role: 'assistant', content: typeof res === 'string' ? res : res.content, timestamp: new Date() }]);
  };

  if (!isAuthenticated) return <SignInPage theme={theme} toggleTheme={() => setTheme(t=>t==='dark'?'light':'dark')} onSignIn={e => { localStorage.setItem('pharm_user', e); setIsAuthenticated(true); }} />;

  return (
    <div className={`h-screen flex flex-col transition-all duration-500 ${theme === 'dark' ? 'bg-slate-950 text-slate-200' : 'bg-slate-50 text-slate-900'}`}>
      <header className={`px-8 py-4 flex items-center justify-between border-b transition-colors ${theme === 'dark' ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
        <div className="flex items-center gap-6">
          <button 
            onClick={() => setIsLeftSidebarOpen(!isLeftSidebarOpen)} 
            className={`p-2 rounded-xl transition-all ${theme === 'dark' ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-100 text-slate-600'}`}
          >
            <PanelLeft className={`w-5 h-5 ${isLeftSidebarOpen ? 'text-cyan-500' : ''}`} />
          </button>
          <div className="flex items-center gap-3">
            <Atom className="w-8 h-8 text-cyan-500" />
            <h1 className="text-2xl font-black tracking-tighter hidden sm:block">Get<span className="text-cyan-500">Gene</span></h1>
          </div>
          {researchState.activeDisease && (
            <div className="px-5 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-500 text-[9px] font-black uppercase tracking-[0.1em] hidden md:block">
              {researchState.activeDisease.name} - GET SIGNAL ENABLED
            </div>
          )}
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => setTheme(t=>t==='dark'?'light':'dark')} className="p-2.5 hover:bg-slate-500/10 rounded-xl transition-all">
            {theme === 'dark' ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5" />}
          </button>
          <button 
            onClick={() => setIsRightSidebarOpen(!isRightSidebarOpen)} 
            className={`p-2 rounded-xl transition-all ${theme === 'dark' ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-100 text-slate-600'}`}
          >
            <PanelRight className={`w-5 h-5 ${isRightSidebarOpen ? 'text-cyan-500' : ''}`} />
          </button>
          <div className="w-px h-6 bg-slate-800 mx-2 hidden sm:block" />
          <button onClick={() => { localStorage.removeItem('pharm_user'); setIsAuthenticated(false); }} className="flex items-center gap-2 p-2 hover:text-rose-500 transition-all text-slate-500">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden relative">
        <aside className={`border-r flex flex-col shrink-0 transition-all duration-300 ease-in-out overflow-hidden ${isLeftSidebarOpen ? 'w-[400px]' : 'w-0 opacity-0 pointer-events-none border-r-0'} ${theme === 'dark' ? 'bg-slate-900/30 border-slate-800' : 'bg-white border-slate-200'}`}>
           <div className="p-6 border-b text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 whitespace-nowrap">Research Terminal</div>
           <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-thin">
              {messages.map((m, i) => (
                <div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className={`max-w-[95%] p-6 rounded-[2rem] text-[13px] leading-relaxed shadow-sm ${m.role === 'user' ? 'bg-cyan-600 text-white' : (theme === 'dark' ? 'bg-slate-800 border border-slate-700' : 'bg-slate-100 border border-slate-200 text-slate-800')}`}>
                    {m.content}
                    {m.options && (
                      <div className="mt-4 space-y-2">
                        {m.options.map(o => (
                          <button key={o.id} onClick={() => handleSelectOption(o)} className="w-full p-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-left text-[11px] font-black uppercase hover:bg-cyan-500/30 transition-all">{o.name}</button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {isChatting && (
                <div className="flex items-center gap-4 text-cyan-500 px-4">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-[11px] font-black tracking-widest uppercase">Querying...</span>
                </div>
              )}
           </div>
           <form onSubmit={handleChat} className="p-6 border-t">
              <div className="relative">
                <input type="text" value={chatInput} onChange={e=>setChatInput(e.target.value)} placeholder="Search disease..." className={`w-full p-6 pr-16 text-sm rounded-[2rem] border outline-none focus:border-cyan-500 transition-all ${theme === 'dark' ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200 text-slate-900'}`} />
                <button type="submit" className="absolute right-3 top-3 p-4 rounded-full bg-cyan-600 text-white shadow-lg hover:bg-cyan-500 transition-all"><Send className="w-5 h-5" /></button>
              </div>
           </form>
        </aside>

        <section className="flex-1 flex flex-col p-6 sm:p-10 overflow-hidden">
           <div className="flex items-center justify-between mb-8 overflow-x-auto pb-2">
              <div className={`flex p-2 rounded-[2rem] border shrink-0 ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
                {[ 
                   {id:'list',i:List,l:'List'}, 
                   {id:'enrichment',i:BarChart3,l:'Enrich'}, 
                   {id:'graph',i:Share2,l:'Interaction Graph'}, 
                   {id:'terrain',i:Globe2,l:'Gene Terrain'} 
                ].map(t => (
                  <button key={t.id} onClick={() => setViewMode(t.id as any)} className={`px-6 sm:px-8 py-3 rounded-[1.5rem] text-[10px] sm:text-[11px] font-black uppercase tracking-[0.2em] sm:tracking-[0.3em] flex items-center gap-3 transition-all ${viewMode === t.id ? 'bg-cyan-500 text-white shadow-lg' : 'text-slate-500 hover:text-cyan-400'}`}><t.i className="w-4 h-4" /> {t.l}</button>
                ))}
              </div>
              {!isLeftSidebarOpen && (
                <button onClick={() => setIsLeftSidebarOpen(true)} className={`p-3 rounded-full hidden sm:flex border ${theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-500 hover:text-white' : 'bg-white border-slate-200 text-slate-400 hover:text-cyan-600'}`}><MessageSquare className="w-5 h-5" /></button>
              )}
           </div>

           <div className={`flex-1 rounded-[3rem] sm:rounded-[4rem] border overflow-hidden relative shadow-2xl transition-all duration-300 ${theme === 'dark' ? 'bg-slate-900/40 border-slate-800' : 'bg-white border-slate-200'}`}>
              {loading && <div className="absolute inset-0 bg-slate-950/30 backdrop-blur-xl z-50 flex flex-col items-center justify-center gap-8"><Loader2 className="w-16 h-16 animate-spin text-cyan-500" /></div>}
              {researchState.targets.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center opacity-20 gap-8 text-center p-10">
                  <DatabaseZap className="w-32 h-32 sm:w-40 sm:h-40 text-cyan-500" />
                  <p className="text-sm font-black uppercase tracking-[0.4em] sm:tracking-[0.6em]">Awaiting Discovery Protocol</p>
                </div>
              ) : (
                <>
                  {viewMode === 'list' && (
                    <div className="h-full overflow-auto scrollbar-thin">
                      <table className="w-full text-left border-collapse">
                        <thead className={`sticky top-0 z-10 text-[10px] sm:text-[11px] font-black uppercase border-b text-slate-500 transition-colors ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                          <tr>
                            <th className="p-4 sm:p-6 pl-8 sm:pl-12">GENE</th>
                            <th className="p-4 sm:p-6 hidden lg:table-cell">Description</th>
                            <th className="p-4 sm:p-6 text-center">G (Genetics)</th>
                            <th className="p-4 sm:p-6 text-center">E (Expression)</th>
                            <th className="p-4 sm:p-6 text-center">T (Drug)</th>
                            <th className="p-4 sm:p-6 pr-8 sm:pr-12 text-right">Score</th>
                          </tr>
                        </thead>
                        <tbody className={`divide-y transition-colors ${theme === 'dark' ? 'divide-slate-800/20' : 'divide-slate-200'}`}>
                          {researchState.targets.map(t => (
                            <tr key={t.id} onClick={()=>setResearchState(p=>({...p, focusSymbol: t.symbol}))} className={`cursor-pointer transition-all hover:bg-cyan-500/10 ${researchState.focusSymbol === t.symbol ? (theme === 'dark' ? 'bg-cyan-500/15 border-l-4 border-cyan-500' : 'bg-cyan-50 border-l-4 border-cyan-500') : ''}`}>
                              <td className="p-4 sm:p-6 pl-8 sm:pl-12 font-black text-cyan-500">{t.symbol}</td>
                              <td className={`p-4 sm:p-6 text-[10px] sm:text-[11px] uppercase truncate max-w-[150px] sm:max-w-[200px] hidden lg:table-cell ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>{t.name}</td>
                              <td className={`p-4 sm:p-6 text-center font-mono ${theme === 'dark' ? 'text-slate-200' : 'text-slate-900'}`}>{t.geneticScore.toFixed(2)}</td>
                              <td className={`p-4 sm:p-6 text-center font-mono ${theme === 'dark' ? 'text-slate-200' : 'text-slate-900'}`}>{Math.max(t.expressionScore || 0, t.baselineExpression || 0).toFixed(2)}</td>
                              <td className={`p-4 sm:p-6 text-center font-mono ${theme === 'dark' ? 'text-slate-200' : 'text-slate-900'}`}>{t.targetScore.toFixed(2)}</td>
                              <td className={`p-4 sm:p-6 pr-8 sm:pr-12 text-right font-mono font-black ${theme === 'dark' ? 'text-cyan-400' : 'text-cyan-600'}`}>{(t.overallScore * 1).toFixed(4)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {viewMode === 'enrichment' && (
                    <div className="p-10 sm:p-16 h-full overflow-auto space-y-12">
                      <h4 className="text-[12px] sm:text-[14px] font-black uppercase tracking-[0.3em] sm:tracking-[0.4em] text-slate-500">KEGG Enrichment Profile</h4>
                      <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-12 gap-y-12">
                        {researchState.enrichment.map((e, i) => (
                          <div key={i} className="space-y-3">
                            <div className="flex justify-between text-[10px] sm:text-[11px] uppercase font-black">
                              <span className={`truncate max-w-[70%] ${theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}`}>{e.term}</span>
                              <span className="text-cyan-500 font-mono">p: {e.pValue.toExponential(2)}</span>
                            </div>
                            <div className={`h-2 rounded-full overflow-hidden ${theme === 'dark' ? 'bg-slate-800' : 'bg-slate-100'}`}>
                              <div className="h-full bg-cyan-600 shadow-[0_0_15px_rgba(6,182,212,0.6)] transition-all duration-1000" style={{width:`${Math.min(100, e.combinedScore/1.5)}%`}} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {viewMode === 'graph' && <KnowledgeGraph targets={researchState.targets} selectedId={researchState.focusSymbol || undefined} onSelect={(t)=>setResearchState(p=>({...p, focusSymbol: t?.symbol || null}))} theme={theme} />}
                  {viewMode === 'terrain' && <GeneTerrain targets={researchState.targets} selectedId={researchState.targets.find(t=>t.symbol===researchState.focusSymbol)?.id} onSelect={(t)=>setResearchState(p=>({...p, focusSymbol: t?.symbol || null}))} theme={theme} />}
                </>
              )}
           </div>
        </section>

        {researchState.focusSymbol && (
          <aside className={`border-l p-8 sm:p-12 flex flex-col gap-10 overflow-y-auto scrollbar-thin shadow-2xl transition-all duration-300 ease-in-out whitespace-normal overflow-hidden ${isRightSidebarOpen ? 'w-[480px]' : 'w-0 opacity-0 pointer-events-none border-l-0'} ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
             {(() => {
               const t = researchState.targets.find(x => x.symbol === researchState.focusSymbol);
               if (!t) return null;
               return (
                 <>
                   <div className="space-y-4">
                     <div className={`flex items-center justify-between border-b pb-6 ${theme === 'dark' ? 'border-slate-800' : 'border-slate-100'}`}>
                       <h3 className="text-5xl sm:text-6xl font-black text-cyan-500 tracking-tighter">{t.symbol}</h3>
                       <div className={`text-[9px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full ${theme === 'dark' ? 'text-slate-500 bg-slate-800' : 'text-slate-400 bg-slate-50'}`}>GET SIGNAL ENABLED</div>
                     </div>
                     <p className="text-[13px] sm:text-[14px] font-bold text-slate-500 uppercase leading-relaxed text-wrap">{t.name}</p>
                   </div>
                   <div className="grid grid-cols-2 gap-4 sm:gap-6">
                     {[ 
                       {l:'G (Genetics)',v:t.geneticScore, c:'emerald'}, 
                       {l:'E* (Baseline)',v:t.combinedExpression || t.expressionScore || 0, c:'blue'}, 
                       {l:'T (Drug Fit)',v:t.targetScore, c:'amber'}, 
                       {l:'Overall Score',v:t.overallScore, c:'cyan'} 
                     ].map(s=>(
                       <div key={s.l} className={`p-4 sm:p-6 rounded-[1.5rem] sm:rounded-[2rem] border shadow-inner ${theme === 'dark' ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-100'}`}>
                         <div className="text-[9px] font-black text-slate-500 uppercase mb-2 sm:mb-3 tracking-widest">{s.l}</div>
                         <div className={`text-2xl sm:text-3xl font-black font-mono text-${s.c}-500`}>{s.v.toFixed(3)}</div>
                       </div>
                     ))}
                   </div>
                   <DrugLandscape targetId={t.id} theme={theme} />
                   <LiteratureStats symbol={t.symbol} diseaseName={researchState.activeDisease?.name || "Alzheimer's"} theme={theme} />
                   <div className="space-y-4">
                      <div className="flex items-center gap-4 text-slate-500">
                        <Network className="w-5 h-5 text-cyan-500" />
                        <h4 className="text-[11px] font-black uppercase tracking-widest">Signaling Pathways</h4>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {t.pathways.slice(0, 10).map((p,i)=>(
                          <span key={i} className={`px-4 py-1.5 rounded-full border text-[9px] font-black uppercase tracking-tighter ${theme === 'dark' ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-500' : 'bg-cyan-50 border-cyan-200 text-cyan-600'}`}>
                            {p.label}
                          </span>
                        ))}
                      </div>
                   </div>
                 </>
               )
             })()}
          </aside>
        )}
      </main>

      <footer className={`h-8 border-t flex items-center justify-between px-6 text-[10px] font-mono transition-colors ${theme === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-500' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
        <div className="flex gap-6 overflow-hidden">
          <span className="flex items-center gap-1.5 shrink-0"><DatabaseZap className="w-3 h-3" /> NODE: OT_BASELINE_EXPR</span>
          <span className="flex items-center gap-1.5 shrink-0 hidden sm:flex"><Network className="w-3 h-3" /> HYPOTHESIS: ALZ_GET_V1</span>
        </div>
        <div className="flex gap-6 items-center">
          <span className="text-cyan-500 font-bold uppercase tracking-widest hidden lg:block">Hypothesis Generation Engine</span>
          <span className="bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded border border-emerald-500/20 uppercase font-black">GET-Active</span>
        </div>
      </footer>
    </div>
  );
};

const SignInPage = ({ theme, toggleTheme, onSignIn }: { theme: Theme, toggleTheme: () => void, onSignIn: (user: string) => void }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  return (
    <div className={`h-screen flex items-center justify-center transition-all ${theme === 'dark' ? 'bg-slate-950 text-slate-200' : 'bg-slate-50 text-slate-900'}`}>
      <div className={`w-full max-w-md p-10 rounded-[3rem] border animate-in fade-in zoom-in duration-500 ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-2xl'}`}>
        <div className="flex flex-col items-center gap-6 mb-12">
          <div className="p-5 bg-cyan-500/10 rounded-full">
            <Atom className="w-14 h-14 text-cyan-500 animate-pulse" />
          </div>
          <h1 className="text-4xl font-black tracking-tighter">Get<span className="text-cyan-500">Gene</span></h1>
          <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.4em]">Alzheimer's precision discovery</p>
        </div>
        <form onSubmit={e=>{e.preventDefault(); if(password===HARDCODED_PASSWORD) onSignIn("Researcher");}} className="space-y-6">
          <div className="space-y-4">
            <input 
              type="email" 
              value={email} 
              onChange={e=>setEmail(e.target.value)} 
              className={`w-full p-5 rounded-3xl border text-center font-bold outline-none focus:border-cyan-500 transition-all ${theme === 'dark' ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200 text-slate-900'}`} 
              placeholder="Researcher ID / Email" 
            />
            <input 
              type="password" 
              value={password} 
              onChange={e=>setPassword(e.target.value)} 
              className={`w-full p-5 rounded-3xl border text-center font-bold outline-none focus:border-cyan-500 transition-all ${theme === 'dark' ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200 text-slate-900'}`} 
              placeholder="••••••••" 
            />
          </div>
          <button 
            type="submit" 
            className="w-full p-5 bg-cyan-600 text-white rounded-3xl font-black uppercase text-xs tracking-[0.2em] hover:bg-cyan-500 transition-all shadow-lg active:scale-95 flex items-center justify-center gap-3"
          >
            <ShieldCheck className="w-4 h-4" />
            Sign In
          </button>
        </form>
        
        <div className="mt-12 flex flex-col items-center gap-4">
          <button onClick={toggleTheme} className="p-3 hover:bg-slate-500/10 rounded-full transition-all text-slate-500">
            {theme === 'dark' ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5" />}
          </button>
        </div>
      </div>
    </div>
  );
};

const rootElement = document.getElementById('root');
if (rootElement) createRoot(rootElement).render(<App />);
