export interface Pathway {
  id: string;
  label: string;
}

export interface Target {
  id: string;
  symbol: string;
  name: string;
  overallScore: number;
  geneticScore: number;
  expressionScore: number;
  baselineExpression?: number; 
  combinedExpression?: number; 
  targetScore: number; 
  pathways: Pathway[];
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  value?: number;
  delta?: number;
  normalizedDelta?: number;
}

export interface DrugInfo {
  name: string;
  id: string;
  phase: number;
  mechanism: string;
  status: string;
}

export interface DiseaseInfo {
  id: string;
  name: string;
}

export interface EnrichmentResult {
  term: string;
  pValue: number;
  combinedScore: number;
  genes: string[];
}

export interface PubMedStats {
  total: number;
  recent: number;
  topPapers: { title: string; id: string; }[];
  searchLink: string;
  primarySearchLink: string;
}

export interface ClinicalSample {
  sampleid: string;
  sample_type: string;
  _primary_disease: string;
  age_at_initial_pathologic_diagnosis: string;
  gender: string;
  vital_status: string;
  ajcc_pathologic_tumor_stage: string;
  os_time: string;
  os?: string; // Overall survival indicator (0=High/Alive, 1=Low/Dead)
}

export interface ExpressionRow {
  sampleid: string;
  gene_symbol: string;
  value: string;
}

export interface SurvivalMetrics {
  [symbol: string]: {
    meanHigh: number;
    meanLow: number;
    highDiff: number;
    lowDiff: number;
    highStatus: 'up' | 'down' | 'neutral';
    lowStatus: 'up' | 'down' | 'neutral';
  };
}

export type Theme = 'dark' | 'light';
export type ViewMode = 'list' | 'correlation' | 'enrichment' | 'graph' | 'terrain' | 'raw' | 'survival';
export type TerrainLayer = 'gaussian' | 'discrete' | 'water' | 'sky';

export interface ResearchContext {
  activeDisease: DiseaseInfo | null;
  targets: Target[];
  enrichment: EnrichmentResult[];
  limit: number;
  currentPage: number;
  focusSymbol: string | null;
  survivalMetrics?: SurvivalMetrics;
  isAnalyzingSurvival?: boolean;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  options?: DiseaseInfo[];
}