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

export type Theme = 'dark' | 'light';
export type ViewMode = 'list' | 'enrichment' | 'graph' | 'terrain';
export type TerrainLayer = 'gaussian' | 'discrete' | 'water' | 'sky';

export interface ResearchContext {
  activeDisease: DiseaseInfo | null;
  targets: Target[];
  enrichment: EnrichmentResult[];
  limit: number;
  currentPage: number;
  focusSymbol: string | null;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  options?: DiseaseInfo[];
}
