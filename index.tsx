import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Layers
} from 'lucide-react';

// --- Configuration ---
const OPEN_TARGETS_API = 'https://api.platform.opentargets.org/api/v4/graphql';
const ENRICHR_API = 'https://maayanlab.cloud/Enrichr';
const HARDCODED_PASSWORD = "Sparc@2026";

// --- Types ---
interface Pathway { id: string; label: string; }
interface Target {
  id: string;
  symbol: string;
  name: string;
  overallScore: number;
  geneticScore: number;
  expressionScore: number;
  targetScore: number; 
  pathways: Pathway[];
}
interface DiseaseInfo { id: string; name: string; }
interface EnrichmentResult { term: string; pValue: number; combinedScore: number; genes: string[]; }
type Theme = 'dark' | 'light';
type ViewMode = 'list' | 'enrichment' | 'graph' | 'terrain';

interface ResearchContext {
  activeDisease: DiseaseInfo | null;
  targets: Target[];
  enrichment: EnrichmentResult[];
  limit: number;
  currentPage: number;
  focusSymbol: string | null;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  options?: DiseaseInfo[];
}

// --- API Service Logic ---

const api = {
  /** 
   * STAGE 1: DISAMBIGUATION LOGIC
   * Maps text to clinical IDs (EFO/MONDO).
   */
  async searchDiseases(query: string): Promise<DiseaseInfo[]> {
    const GQL_QUERY = `
      query SearchDisease($queryString: String!) {
        search(queryString: $queryString, entityNames: ["disease"], page: {index: 0, size: 25}) {
          hits {
            id
            name
            description
          }
        }
      }
    `;
    
    try {
      const res = await fetch(OPEN_TARGETS_API, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ 
          query: GQL_QUERY,
          variables: { queryString: query }
        }) 
      });
      
      const result = await res.json();
      let hits = result.data?.search?.hits || [];
      
      if (hits.length === 0) {
        const BROAD_QUERY = `
          query BroadSearch($queryString: String!) {
            search(queryString: $queryString, page: {index: 0, size: 25}) {
              hits { id name entity }
            }
          }
        `;
        const broadRes = await fetch(OPEN_TARGETS_API, { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify({ query: BROAD_QUERY, variables: { queryString: query } }) 
        });
        const broadResult = await broadRes.json();
        hits = (broadResult.data?.search?.hits || [])
          .filter((h: any) => h.entity === 'disease' || h.entity === 'phenotype');
      }

      return hits.map((h: any) => ({ id: h.id, name: h.name }));
    } catch (err) {
      console.error("Clinical Search Protocol Failure:", err);
      return [];
    }
  },

  /** 
   * STAGE 3: TARGET DISCOVERY LOGIC
   */
  async getGenes(efoId: string, size: number = 30, page: number = 0): Promise<Target[]> {
    let resolvedId = efoId;

    if (!efoId.includes('_') && !efoId.includes(':')) {
      const resolution = await this.searchDiseases(efoId);
      if (resolution.length > 0) {
        resolvedId = resolution[0].id;
      }
    }

    const GQL_QUERY = `
      query GetAssociatedTargets($resolvedId: String!, $size: Int!, $page: Int!) {
        disease(efoId: $resolvedId) {
          id
          name
          associatedTargets(page: {index: $page, size: $size}) {
            rows {
              target {
                id
                approvedSymbol
                approvedName
                pathways {
                  pathway
                }
              }
              score
              datatypeScores {
                id
                score
              }
            }
          }
        }
      }
    `;

    try {
      const res = await fetch(OPEN_TARGETS_API, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ 
          query: GQL_QUERY,
          variables: { resolvedId, size, page }
        }) 
      });
      const data = await res.json();
      const rows = data.data?.disease?.associatedTargets?.rows;
      if (!rows || rows.length === 0) return [];
      
      return rows.map((r: any) => ({
        id: r.target.id,
        symbol: r.target.approvedSymbol,
        name: r.target.approvedName,
        overallScore: r.score,
        geneticScore: r.datatypeScores.find((s:any) => s.id.includes('genetic'))?.score || 0,
        expressionScore: r.datatypeScores.find((s:any) => s.id.includes('rna'))?.score || 0,
        targetScore: r.datatypeScores.find((s:any) => s.id.includes('drug'))?.score || 0,
        pathways: r.target.pathways?.map((p:any) => ({ id: p.pathway, label: p.pathway })) || []
      }));
    } catch (err) {
      console.error("Target Discovery Protocol Failure:", err);
      return [];
    }
  },

  async getEnrichment(genes: string[]): Promise<EnrichmentResult[]> {
    if (genes.length === 0) return [];
    try {
      const formData = new FormData();
      formData.append('list', genes.join('\n'));
      const addRes = await fetch(`${ENRICHR_API}/addList`, { method: 'POST', body: formData });
      const addData = await addRes.json();
      const enRes = await fetch(`${ENRICHR_API}/enrich?userListId=${addData.userListId}&backgroundType=KEGG_2021_Human`);
      const enData = await enRes.json();
      return enData['KEGG_2021_Human']?.map((r: any) => ({ term: r[1], pValue: r[2], combinedScore: r[4], genes: r[5] })) || [];
    } catch (e) {
      return [];
    }
  }
};

// --- Utilities ---

const formatAssistantText = (text: string) => {
  return text
    .replace(/^#+\s*(.*)$/gm, '<h4 class="text-cyan-500 font-black uppercase text-[11px] mb-2 tracking-widest">$1</h4>')
    .replace(/\*\*(.*?)\*\*/g, '<span class="text-cyan-400 font-bold">$1</span>')
    .replace(/[\*#]/g, '')
    .replace(/\n/g, '<br />');
};

const formatPValue = (p: number) => {
  if (p < 0.0001) return p.toExponential(2);
  return p.toFixed(4);
};

// --- Visualization Components ---

const KnowledgeGraph = ({ targets, diseaseName, selectedId, onSelect, theme }: { targets: Target[], diseaseName: string, selectedId?: string, onSelect: (t: Target | null) => void, theme: Theme }) => {
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

    const root = { x: w / 2, y: h / 2, r: 32, label: diseaseName, color: '#f43f5e' };
    const nodes = targets.slice(0, 60).map(t => ({
      ...t, x: w/2 + (Math.random()-0.5)*400, y: h/2 + (Math.random()-0.5)*400,
      vx: 0, vy: 0, r: 12 + (t.overallScore * 14),
      color: t.overallScore > 0.6 ? '#a855f7' : '#0ea5e9'
    }));

    let ani: number;
    const tick = () => {
      ctx.clearRect(0, 0, w, h);
      const focusNode = nodes.find(n => n.id === selectedId);

      nodes.forEach(n => {
        nodes.forEach(o => { if (n !== o) { const dx = n.x - o.x, dy = n.y - o.y, d = Math.sqrt(dx*dx+dy*dy)||1; if (d < 90) { n.vx += dx/d*0.6; n.vy += dy/d*0.6; } } });
        const dxR = root.x - n.x, dyR = root.y - n.y, dR = Math.sqrt(dxR*dxR+dyR*dyR)||1;
        const targetD = 220; const pull = (dR - targetD) * 0.04; n.vx += dxR/dR*pull; n.vy += dyR/dR*pull;
        if (focusNode && focusNode !== n) {
          const shared = n.pathways.filter(p1 => focusNode.pathways.some(p2 => p1.id === p2.id)).length;
          if (shared > 0) { const dxF = focusNode.x-n.x, dyF = focusNode.y-n.y, dF = Math.sqrt(dxF*dxF+dyF*dyF)||1; n.vx += dxF/dF*0.2*shared; n.vy += dyF/dF*0.2*shared; }
        }
        n.vx *= 0.85; n.vy *= 0.85; n.x += n.vx; n.y += n.vy;
      });

      nodes.forEach(n => {
        const isSel = n.id === selectedId;
        const isPartner = focusNode && n.pathways.some(p1 => focusNode.pathways.some(p2 => p1.id === p2.id));
        ctx.globalAlpha = selectedId ? (isSel || isPartner ? 1.0 : 0.08) : 1.0;
        ctx.beginPath(); ctx.moveTo(root.x, root.y); ctx.lineTo(n.x, n.y);
        ctx.strokeStyle = theme === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.08)';
        ctx.stroke();
        ctx.beginPath(); ctx.arc(n.x, n.y, isSel ? n.r + 8 : n.r, 0, Math.PI*2);
        ctx.fillStyle = isSel ? '#fff' : n.color; ctx.fill();
        ctx.fillStyle = theme === 'dark' ? '#fff' : '#000'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(n.symbol, n.x, n.y + n.r + 18);
      });
      ctx.globalAlpha = 1.0;
      ctx.beginPath(); ctx.arc(root.x, root.y, root.r, 0, Math.PI*2); ctx.fillStyle = root.color; ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.fillText(root.label.substring(0, 15), root.x, root.y + 4);
      ani = requestAnimationFrame(tick);
    };
    tick();

    const onClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const hit = nodes.find(n => Math.sqrt((n.x-mx)**2 + (n.y-my)**2) < n.r + 20);
      onSelect(hit || null);
    };
    canvas.addEventListener('click', onClick);
    return () => { cancelAnimationFrame(ani); canvas.removeEventListener('click', onClick); };
  }, [targets, diseaseName, selectedId, theme]);

  return <div ref={containerRef} className="w-full h-full"><canvas ref={canvasRef} className="w-full h-full cursor-crosshair" /></div>;
};

const VisualLegend = ({ theme }: { theme: Theme }) => (
  <div className={`absolute bottom-6 right-6 p-4 rounded-2xl border backdrop-blur-md shadow-lg z-20 ${theme === 'dark' ? 'bg-slate-900/80 border-slate-800' : 'bg-white/80 border-slate-200'}`}>
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="w-3 h-3 rounded-full bg-[#22d3ee] shadow-[0_0_8px_rgba(34,211,238,0.5)]" />
        <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Target Profile</span>
      </div>
      <div className="flex items-center gap-3">
        <div className="w-3 h-3 rounded-full bg-[#c084fc] shadow-[0_0_8px_rgba(192,132,252,0.5)]" />
        <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">High Affinity</span>
      </div>
      <div className="flex items-center gap-3">
        <div className={`w-3 h-3 rounded-full border-2 ${theme === 'dark' ? 'bg-white border-[#22d3ee]' : 'bg-[#0e7490] border-[#22d3ee]'}`} />
        <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Selected Node</span>
      </div>
    </div>
  </div>
);

const GeneTerrain = ({ targets, onSelect, selectedId, theme }: { targets: Target[], onSelect: (t: Target) => void, selectedId: string | undefined, theme: Theme }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    
    const resize = () => {
      if (!containerRef.current) return;
      const { width, height } = containerRef.current.getBoundingClientRect();
      canvas.width = width * window.devicePixelRatio;
      canvas.height = height * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };
    resize();

    let nodes = targets.map((t, i) => ({ 
      ...t, 
      x: (Math.random() * 0.8 + 0.1) * (canvas.width / (window.devicePixelRatio || 1)), 
      y: (Math.random() * 0.8 + 0.1) * (canvas.height / (window.devicePixelRatio || 1)), 
      vx: 0, 
      vy: 0, 
      radius: 5 + (t.overallScore * 10) 
    }));
    
    const links: any[] = [];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const intersection = nodes[i].pathways.filter(p1 => nodes[j].pathways.some(p2 => p1.id === p2.id));
        if (intersection.length > 0) links.push({ source: i, target: j, strength: intersection.length });
      }
    }

    const onClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const hit = nodes.find(n => Math.sqrt((n.x - mx)**2 + (n.y - my)**2) < n.radius * 2);
      if (hit) onSelect(hit);
    };
    canvas.addEventListener('click', onClick);

    let animationId: number;
    const tick = () => {
      const w = canvas.width / window.devicePixelRatio;
      const h = canvas.height / window.devicePixelRatio;
      ctx.clearRect(0, 0, w, h);

      nodes.forEach(node => {
        nodes.forEach(other => {
          if (node === other) return;
          const dx = node.x - other.x; const dy = node.y - other.y;
          const d2 = dx*dx + dy*dy || 1;
          const force = 15 / d2;
          node.vx += dx * force; node.vy += dy * force;
        });
        node.vx += (w/2 - node.x) * 0.005; node.vy += (h/2 - node.y) * 0.005;
        node.vx *= 0.92; node.vy *= 0.92;
        node.x += node.vx; node.y += node.vy;
        
        node.x = Math.max(30, Math.min(w - 30, node.x));
        node.y = Math.max(30, Math.min(h - 30, node.y));
      });

      ctx.strokeStyle = theme === 'dark' ? 'rgba(34, 211, 238, 0.1)' : 'rgba(8, 145, 178, 0.15)';
      links.forEach(l => { 
        const s = nodes[l.source], t = nodes[l.target]; 
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(t.x, t.y); 
        ctx.lineWidth = Math.min(l.strength, 3);
        ctx.stroke(); 
      });

      nodes.forEach(node => {
        ctx.beginPath(); ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        if (node.id === selectedId) {
          ctx.fillStyle = theme === 'dark' ? '#fff' : '#0e7490';
          ctx.strokeStyle = '#22d3ee';
          ctx.lineWidth = 3;
          ctx.stroke();
        } else {
          ctx.fillStyle = node.overallScore > 0.6 ? '#c084fc' : '#22d3ee';
        }
        ctx.fill();
        
        ctx.fillStyle = theme === 'dark' ? 'rgba(255, 255, 255, 0.7)' : 'rgba(15, 23, 42, 0.9)';
        ctx.font = node.id === selectedId ? 'bold 10px sans-serif' : '9px sans-serif'; 
        ctx.textAlign = 'center'; 
        ctx.fillText(`${node.symbol}: ${node.name.substring(0, 15)}${node.name.length > 15 ? '...' : ''}`, node.x, node.y + node.radius + 12);
      });
      animationId = requestAnimationFrame(tick);
    };
    tick(); return () => {
      cancelAnimationFrame(animationId);
      canvas.removeEventListener('click', onClick);
    };
  }, [targets, selectedId, theme, onSelect]);

  return (
    <div ref={containerRef} className={`relative w-full h-full rounded-lg overflow-hidden border transition-colors duration-300 ${theme === 'dark' ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
      <canvas ref={canvasRef} className="w-full h-full cursor-grab" />
      <VisualLegend theme={theme} />
    </div>
  );
};

// --- Authentication ---

const SignInPage = ({ theme, toggleTheme, onSignIn }: { theme: Theme, toggleTheme: () => void, onSignIn: (user: string) => void }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); if (password === HARDCODED_PASSWORD) onSignIn("research_principal"); else setError("Access Denied: Protocol Violation."); };
  return (
    <div className={`h-screen flex items-center justify-center transition-colors ${theme === 'dark' ? 'bg-slate-950 text-slate-200' : 'bg-slate-50 text-slate-900'}`}>
      <div className={`w-full max-w-md p-10 rounded-[3rem] border ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-2xl'}`}>
        <div className="flex flex-col items-center gap-6 mb-12"><div className="p-5 bg-cyan-500/10 rounded-full shadow-lg shadow-cyan-500/20"><Atom className="w-14 h-14 text-cyan-500 animate-pulse" /></div><h1 className="text-4xl font-black tracking-tighter">Get<span className="text-cyan-500">Gene</span></h1></div>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-slate-500 ml-4 tracking-widest">Email Address</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={`w-full p-5 rounded-3xl border outline-none text-center font-bold ${theme === 'dark' ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-transparent'}`} placeholder="user@uab.edu" />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-slate-500 ml-4 tracking-widest">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} className={`w-full p-5 rounded-3xl border outline-none text-center font-bold ${theme === 'dark' ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-transparent'}`} placeholder="••••••••" />
          </div>
          {error && <div className="text-rose-500 text-[10px] font-black uppercase text-center animate-bounce">{error}</div>}
          <button type="submit" className="w-full p-5 bg-cyan-600 text-white rounded-3xl font-black uppercase text-xs tracking-widest shadow-xl hover:bg-cyan-500 transition-all hover:scale-[1.02]">Sign In</button>
        </form>
        <button onClick={toggleTheme} className="mt-10 mx-auto block p-3 hover:bg-slate-500/10 rounded-full">{theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}</button>
      </div>
    </div>
  );
};

// --- Main Research Platform ---

const App = () => {
  const [theme, setTheme] = useState<Theme>('dark');
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('pharm_user'));
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [loading, setLoading] = useState(false);
  const [researchState, setResearchState] = useState<ResearchContext>({ 
    activeDisease: null, 
    targets: [], 
    enrichment: [], 
    limit: 30, 
    currentPage: 0,
    focusSymbol: null 
  });
  const [messages, setMessages] = useState<Message[]>([ { role: 'assistant', content: "Welcome to GetGene Terminal - give me a disease query - source open targets kinda meaningful", timestamp: new Date() } ]);
  const [chatInput, setChatInput] = useState("");
  const [isChatting, setIsChatting] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight; }, [messages]);

  const handleToolExecution = useCallback(async (name: string, args: any) => {
    setLoading(true);
    try {
      switch (name) {
        case 'search_diseases': {
          const options = await api.searchDiseases(args.query);
          if (options.length === 0) return `Bio-Index search for "${args.query}" yielded 0 significant hits. Please try a specific medical synonym.`;
          
          if (options.length === 1) {
            const opt = options[0];
            const genes = await api.getGenes(opt.id, 30, 0);
            const enrichment = await api.getEnrichment(genes.map(g => g.symbol));
            const topGene = genes.length > 0 ? genes[0].symbol : null;
            setResearchState(prev => ({ 
              ...prev, 
              targets: genes, 
              enrichment, 
              activeDisease: opt, 
              focusSymbol: topGene,
              currentPage: 0 
            }));
            return `Clinical Mapping: Resolved focus to "${opt.name}" (EFO ID: ${opt.id}). Automatically loading genomic associations and focusing on top-priority target ${topGene}. All analysis functions are now operational. Initial batch of 30 genes loaded.`;
          }

          return { content: `Scanning complete. Found ${options.length} clinical subtypes for "${args.query}". Please select the exact focus:`, options };
        }
        case 'get_genes': {
          const genes = await api.getGenes(args.id, 30, 0);
          if (genes.length === 0) return `Clinical Profile Sync Error: The term "${args.name}" (ID: ${args.id}) has no direct associations in the current release. I will attempt to resolve this name to a parent category for broader discovery.`;
          const enrichment = await api.getEnrichment(genes.map(g => g.symbol));
          const topGene = genes.length > 0 ? genes[0].symbol : null;
          setResearchState(prev => ({ 
            ...prev, 
            targets: genes, 
            enrichment, 
            activeDisease: { id: args.id, name: args.name }, 
            focusSymbol: topGene,
            currentPage: 0 
          }));
          return `Target Discovery Cycle Finished. Mapped first 30 associations for ${args.name}. Automatically focusing on candidate ${topGene} to populate the analysis sidebar.`;
        }
        case 'load_more_genes': {
          const currentDisease = researchState.activeDisease;
          if (!currentDisease) return "Protocol Error: No active disease profile identified. Please search for a condition first.";
          
          const nextPage = researchState.currentPage + 1;
          const newGenes = await api.getGenes(currentDisease.id, 30, nextPage);
          
          if (newGenes.length === 0) return "End of Registry: No further genomic associations detected for this condition.";
          
          setResearchState(prev => ({ 
            ...prev, 
            targets: [...prev.targets, ...newGenes], 
            currentPage: nextPage 
          }));
          
          const updatedTargets = [...researchState.targets, ...newGenes];
          const enrichment = await api.getEnrichment(updatedTargets.map(g => g.symbol));
          setResearchState(prev => ({ ...prev, enrichment }));

          return `Expansion Complete: Batch ${nextPage + 1} synchronized. Added ${newGenes.length} additional gene associations. Total mapped genes: ${updatedTargets.length}.`;
        }
        case 'update_view': {
          setViewMode(args.mode);
          return `Visualization pipeline modified to ${args.mode}.`;
        }
        default: return "Protocol acknowledged.";
      }
    } catch (err: any) {
      return `Critical Protocol Error: ${err.message}`;
    } finally {
      setLoading(false);
    }
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
        config: { 
          tools: [{ functionDeclarations: tools as any }],
          systemInstruction: `You are GetGene Agentic AI, a clinical discovery researcher.
          
          DISCOVERY PROTOCOL:
          1. STAGE 1: Call 'search_diseases' first for any new condition mentioned.
          2. STAGE 2: If subtypes are returned, present them as clickable options.
          3. STAGE 3: Call 'get_genes' with the EFO ID to load the initial batch of 30 genes.
          4. BATCH DISCOVERY: If the user asks for more results, more genes, or the next batch, call 'load_more_genes'.
          5. AGENTIC RESOLUTION: If the user says "Focus on [name]", call 'get_genes' with that name. The system will internally resolve it to an ID.
          6. AUTO-FOCUS: When loading targets, always inform the user that the top candidate is being focused in the right-side analysis panel.
          7. TONE: Precise, scientific. No markdown headers.`
        }
      });

      if (response.functionCalls?.length) {
        for (const fc of response.functionCalls) {
          const res = await handleToolExecution(fc.name, fc.args);
          const msgContent = typeof res === 'string' ? res : res.content;
          const options = typeof res === 'string' ? undefined : res.options;
          setMessages(prev => [...prev, { role: 'assistant', content: msgContent, options, timestamp: new Date() }]);
        }
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: response.text || "Synchronizing data layers...", timestamp: new Date() }]);
      }
    } catch (e: any) { setMessages(prev => [...prev, { role: 'assistant', content: `Sync Error: ${e.message}.`, timestamp: new Date() }]); } finally { setIsChatting(false); }
  };

  const handleSelectOption = async (opt: DiseaseInfo) => {
    const userConfirm: Message = { role: 'user', content: `Resolve focusing on: ${opt.name}`, timestamp: new Date() };
    setMessages(prev => [...prev, userConfirm]);
    const res = await handleToolExecution('get_genes', { id: opt.id, name: opt.name });
    const msgContent = typeof res === 'string' ? res : res.content;
    setMessages(prev => [...prev, { role: 'assistant', content: msgContent, timestamp: new Date() }]);
  };

  if (!isAuthenticated) return <SignInPage theme={theme} toggleTheme={() => setTheme(t=>t==='dark'?'light':'dark')} onSignIn={e => { localStorage.setItem('pharm_user', e); setIsAuthenticated(true); }} />;

  return (
    <div className={`h-screen flex flex-col transition-colors duration-500 ${theme === 'dark' ? 'bg-slate-950 text-slate-200' : 'bg-slate-50 text-slate-900'}`}>
      <header className={`px-8 py-5 flex items-center justify-between border-b ${theme === 'dark' ? 'bg-slate-900/80 border-slate-800 backdrop-blur-md' : 'bg-white/90 border-slate-200 backdrop-blur-md shadow-sm'}`}>
        <div className="flex items-center gap-10">
          <div className="flex items-center gap-3"><Atom className="w-8 h-8 text-cyan-500 shadow-cyan-500/50" /><h1 className="text-2xl font-black tracking-tighter">Get<span className="text-cyan-500">Gene</span></h1></div>
          {researchState.activeDisease && <div className="px-5 py-2 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-500 text-[10px] font-black uppercase tracking-[0.2em] shadow-xl shadow-cyan-500/10 animate-in fade-in slide-in-from-left duration-700">{researchState.activeDisease.name} PROFILE ACTIVE</div>}
        </div>
        <div className="flex items-center gap-6">
          <button onClick={() => setTheme(t=>t==='dark'?'light':'dark')} className="p-3 hover:bg-slate-500/10 rounded-2xl transition-all active:scale-95">{theme === 'dark' ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5" />}</button>
          <button onClick={() => { localStorage.removeItem('pharm_user'); setIsAuthenticated(false); }} className="p-3 hover:text-rose-500 transition-all"><LogOut className="w-5 h-5" /></button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        <aside className={`w-[400px] border-r flex flex-col shrink-0 ${theme === 'dark' ? 'bg-slate-900/30 border-slate-800' : 'bg-white'}`}>
           <div className="p-6 border-b text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 flex items-center justify-between">
             <div className="flex items-center gap-3 font-bold"><MessageSquare className="w-5 h-5 text-cyan-500" /> Research Intelligence</div>
             <div className="flex gap-2"><div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse shadow-lg shadow-emerald-500/50" /></div>
           </div>
           <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-thin">
              {messages.map((m, i) => (
                <div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className={`max-w-[95%] p-6 rounded-[2.5rem] text-[14px] leading-[1.6] shadow-md transition-all ${m.role === 'user' ? 'bg-cyan-600 text-white rounded-tr-none' : (theme === 'dark' ? 'bg-slate-800 text-slate-200 rounded-tl-none border border-slate-700/50' : 'bg-slate-100 text-slate-800 rounded-tl-none')}`}>
                    <div dangerouslySetInnerHTML={{ __html: formatAssistantText(m.content) }} />
                    {m.options && (
                      <div className="mt-8 space-y-3">
                        {m.options.map(opt => (
                          <button key={opt.id} onClick={() => handleSelectOption(opt)} className="w-full p-5 rounded-[1.5rem] bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-left text-[11px] font-black uppercase transition-all flex items-center justify-between group active:scale-[0.98]">
                            <span className="truncate pr-6">{opt.name}</span> <ChevronRight className="w-4.5 h-4.5 group-hover:translate-x-2 shrink-0 transition-transform text-cyan-500" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="text-[10px] font-black uppercase text-slate-500 mt-2.5 px-3 opacity-50 tracking-[0.2em]">{m.timestamp.toLocaleTimeString()}</span>
                </div>
              ))}
              {isChatting && <div className="flex items-center gap-4 text-cyan-500 px-4"><Loader2 className="w-5 h-5 animate-spin" /><span className="text-[11px] font-black uppercase tracking-[0.3em]">Mapping Bio-Signatures...</span></div>}
           </div>
           <form onSubmit={handleChat} className="p-6 border-t"><div className="relative"><input type="text" value={chatInput} onChange={e=>setChatInput(e.target.value)} placeholder="Submit clinical search..." className={`w-full p-6 pr-16 text-sm rounded-[2rem] border outline-none transition-all ${theme === 'dark' ? 'bg-slate-950 border-slate-800 text-white focus:border-cyan-500' : 'bg-slate-100 border-transparent focus:bg-white focus:shadow-2xl'}`} /><button type="submit" disabled={isChatting} className={`absolute right-3 top-3 p-4 rounded-full transition-all ${isChatting ? 'bg-slate-500 cursor-not-allowed' : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-xl shadow-cyan-900/40 active:scale-90'}`}><Send className="w-5 h-5" /></button></div></form>
        </aside>

        <section className="flex-1 flex flex-col p-10 overflow-hidden">
           <div className="flex items-center justify-between mb-10">
              <div className={`flex p-2 rounded-[2rem] border ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
                {[ {id:'list',i:List,l:'GET list'}, {id:'enrichment',i:BarChart3,l:'Enrichment'}, {id:'graph',i:Share2,l:'Pathways'}, {id:'terrain',i:Layers,l:'Terrain'} ].map(t => (
                  <button key={t.id} onClick={() => setViewMode(t.id as any)} className={`px-8 py-3 rounded-[1.5rem] text-[11px] font-black uppercase tracking-[0.3em] flex items-center gap-4 transition-all ${viewMode === t.id ? 'bg-cyan-500 text-white shadow-2xl shadow-cyan-500/30 scale-105' : 'text-slate-500 hover:text-cyan-500'}`}><t.i className="w-4.5 h-4.5" /> {t.l}</button>
                ))}
              </div>
           </div>

           <div className={`flex-1 rounded-[4rem] border overflow-hidden relative ${theme === 'dark' ? 'bg-slate-900/40 border-slate-800' : 'bg-white border-slate-200 shadow-2xl'}`}>
              {loading && <div className="absolute inset-0 bg-slate-950/30 backdrop-blur-xl z-50 flex flex-col items-center justify-center gap-8 animate-in fade-in duration-300"><div className="relative"><Loader2 className="w-16 h-16 animate-spin text-cyan-500" /><div className="absolute inset-0 bg-cyan-500/20 blur-2xl animate-pulse" /></div><span className="text-[12px] font-black uppercase tracking-[0.5em] text-cyan-500">Retrieving Genomic Data Layer...</span></div>}
              {researchState.targets.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center opacity-30 gap-12 group">
                  <div className="relative"><DatabaseZap className="w-40 h-40 text-cyan-500 group-hover:scale-110 transition-transform duration-1000" /><div className="absolute inset-0 bg-cyan-500 blur-[100px] opacity-10" /></div>
                  <p className="text-sm font-black uppercase tracking-[0.6em] text-center max-w-[450px] leading-[2.5]">Awaiting Discovery Protocol Initialization</p>
                </div>
              ) : (
                <>
                  {viewMode === 'list' && (
                    <div className="h-full overflow-auto scrollbar-thin">
                      <table className="w-full text-left border-collapse">
                        <thead className={`sticky top-0 z-10 text-[11px] font-black uppercase border-b backdrop-blur-2xl ${theme === 'dark' ? 'bg-slate-900/90 text-slate-500 border-slate-800' : 'bg-slate-50/90'}`}>
                          <tr><th className="p-6 pl-12">GENE</th><th className="p-6">Description</th><th className="p-6 text-center">Genetics</th><th className="p-6 text-center">Expression</th><th className="p-6 text-center">Target score</th><th className="p-6 pr-12 text-right">Overall Score</th></tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/10">
                          {researchState.targets.map(t => (
                            <tr key={t.id} onClick={()=>setResearchState(p=>({...p, focusSymbol: t.symbol}))} className={`cursor-pointer transition-all hover:bg-cyan-500/10 ${researchState.focusSymbol === t.symbol ? 'bg-cyan-500/15 border-l-4 border-cyan-500' : ''}`}>
                              <td className="p-6 pl-12 font-black text-base tracking-tighter text-cyan-500">{t.symbol}</td>
                              <td className="p-6 text-[12px] text-slate-500 font-bold max-w-[300px] truncate uppercase tracking-tight">{t.name}</td>
                              <td className="p-6 text-center"><div className="px-4 py-1.5 rounded-xl border border-emerald-500/20 text-emerald-500 text-[11px] font-mono shadow-inner bg-emerald-500/5">{t.geneticScore > 0 ? t.geneticScore.toFixed(2) : '-'}</div></td>
                              <td className="p-6 text-center"><div className="px-4 py-1.5 rounded-xl border border-blue-500/20 text-blue-500 text-[11px] font-mono shadow-inner bg-blue-500/5">{t.expressionScore > 0 ? t.expressionScore.toFixed(2) : '-'}</div></td>
                              <td className="p-6 text-center"><div className="px-4 py-1.5 rounded-xl border border-amber-500/20 text-amber-500 text-[11px] font-mono shadow-inner bg-amber-500/5">{t.targetScore > 0 ? t.targetScore.toFixed(2) : '-'}</div></td>
                              <td className="p-6 pr-12 text-right font-black font-mono text-cyan-400 text-sm tracking-[0.2em]">{t.overallScore > 0 ? t.overallScore.toFixed(4) : '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {viewMode === 'enrichment' && (
                    <div className="p-16 h-full overflow-auto space-y-16">
                      <div className="flex items-center gap-6 border-b border-slate-800/10 pb-8"><FlaskConical className="w-8 h-8 text-cyan-500 shadow-xl shadow-cyan-500/20" /><h4 className="text-[14px] font-black uppercase tracking-[0.4em] text-slate-500">KEGG Pathway Enrichment Profile</h4></div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-24 gap-y-16">
                        {researchState.enrichment.slice(0, 12).map((e, i) => (
                          <div key={i} className="space-y-6 group transition-all hover:translate-x-3">
                            <div className="flex justify-between items-baseline text-[13px]">
                              <span className="font-black truncate max-w-[350px] group-hover:text-cyan-500 transition-colors uppercase tracking-tight">{e.term}</span>
                              <span className="font-mono text-cyan-500 font-bold opacity-60">p: {formatPValue(e.pValue)}</span>
                            </div>
                            <div className="h-2 w-full bg-slate-800/10 rounded-full overflow-hidden shadow-inner"><div className="h-full bg-cyan-600 rounded-full transition-all duration-1000 shadow-[0_0_15px_rgba(6,182,212,0.6)]" style={{width:`${Math.min(100, e.combinedScore/1.5)}%`}} /></div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {viewMode === 'graph' && <KnowledgeGraph targets={researchState.targets} diseaseName={researchState.activeDisease?.name || ""} selectedId={researchState.targets.find(t=>t.symbol===researchState.focusSymbol)?.id} onSelect={(t)=>setResearchState(p=>({...p, focusSymbol: t?.symbol || null}))} theme={theme} />}
                  {viewMode === 'terrain' && <GeneTerrain targets={researchState.targets} selectedId={researchState.targets.find(t=>t.symbol===researchState.focusSymbol)?.id} onSelect={(t)=>setResearchState(p=>({...p, focusSymbol: t?.symbol || null}))} theme={theme} />}
                </>
              )}
           </div>
        </section>

        {researchState.focusSymbol && (
          <aside className={`w-[480px] border-l p-12 flex flex-col gap-12 overflow-y-auto scrollbar-thin transition-all animate-in slide-in-from-right duration-700 ${theme === 'dark' ? 'bg-slate-900 border-slate-800 shadow-[-30px_0_60px_rgba(0,0,0,0.6)]' : 'bg-white shadow-[-15px_0_50px_rgba(0,0,0,0.08)]'}`}>
             {(() => {
               const t = researchState.targets.find(x => x.symbol === researchState.focusSymbol);
               if (!t) return null;
               return (
                 <>
                   <div className="space-y-4">
                     <div className="flex items-center justify-between border-b border-slate-800/20 pb-6"><h3 className="text-6xl font-black text-cyan-500 tracking-tighter drop-shadow-2xl animate-in zoom-in-50 duration-500">{t.symbol}</h3><div className="text-[11px] font-black text-slate-500 uppercase tracking-widest bg-slate-500/10 px-6 py-2 rounded-full border border-slate-800/20">Bio-Marker Profile</div></div>
                     <p className="text-[15px] font-bold text-slate-500 uppercase leading-relaxed pt-2 opacity-90">{t.name}</p>
                   </div>

                   <div className="grid grid-cols-2 gap-6">
                     {[ {l:'Genomic Assoc',v:t.geneticScore, c:'emerald'}, {l:'RNA Signal',v:t.expressionScore, c:'blue'}, {l:'Drug Fit',v:t.targetScore, c:'amber'}, {l:'Cumulative',v:t.overallScore, c:'cyan'} ].map(s=>(
                       <div key={s.l} className="p-7 rounded-[3rem] bg-slate-950/20 border border-slate-800/50 hover:border-cyan-500/40 hover:bg-cyan-500/5 transition-all shadow-2xl group">
                         <div className="text-[11px] font-black text-slate-500 uppercase mb-4 tracking-[0.2em] group-hover:text-cyan-500 transition-colors">{s.l}</div>
                         <div className={`text-3xl font-black font-mono text-${s.c}-500 group-hover:scale-110 transition-transform`}>{s.v > 0 ? s.v.toFixed(3) : '-'}</div>
                       </div>
                     ))}
                   </div>

                   <div className="space-y-8 pt-12 border-t border-slate-800/30">
                     <div className="flex items-center gap-4 text-slate-500"><Network className="w-5 h-5 text-cyan-500" /><h4 className="text-[12px] font-black uppercase tracking-[0.4em]">Integrated Signaling Nodes</h4></div>
                     <div className="flex flex-wrap gap-4">{t.pathways.length > 0 ? t.pathways.map((p,i)=>(
                       <span key={i} className="px-5 py-2.5 rounded-[1.5rem] bg-cyan-500/10 border border-cyan-500/30 text-cyan-500 text-[11px] font-black uppercase tracking-tight hover:bg-cyan-500/30 hover:shadow-lg hover:shadow-cyan-500/10 transition-all cursor-default shadow-sm">{p.label}</span>
                     )) : <span className="text-[11px] font-black uppercase opacity-20 italic">No specific signaling pathways identified</span>}</div>
                   </div>

                   <div className="mt-auto opacity-10 flex justify-center py-16 relative group">
                      <Atom className="w-40 h-40 text-cyan-500 animate-[spin_15s_linear_infinite] group-hover:scale-125 transition-transform duration-1000" />
                      <div className="absolute inset-0 flex items-center justify-center"><Dna className="w-12 h-12 text-cyan-500" /></div>
                   </div>
                 </>
               )
             })()}
          </aside>
        )}
      </main>
    </div>
  );
};

const rootElement = document.getElementById('root');
if (rootElement) createRoot(rootElement).render(<App />);