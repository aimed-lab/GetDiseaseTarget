export interface Pathway {
  id: string;
  label: string;
}

export interface DrillDownData {
  trial_count: number;
  max_phase: string;
  active_trial_present: boolean;
  paper_count: number;
  recent_paper_count: number;
  latest_publication_date: string;
}

export interface Target {
  id: string;
  symbol: string;
  name: string;
  overallScore: number;
  geneticScore: number;
  expressionScore: number;
  literatureScore?: number;
  clinicalScore?: number;
  noveltyScore?: number;
  baselineExpression?: number; 
  combinedExpression?: number; 
  targetScore: number; 
  pathways: Pathway[];
  drillDown?: DrillDownData;
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
  score?: number;
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
  sample_type?: string;
  _primary_disease?: string;
  age_at_initial_pathologic_diagnosis?: string;
  gender?: string;
  vital_status: string;
  ajcc_pathologic_tumor_stage?: string;
  race?: string;
  os_time?: string;
  os?: string; // Overall survival indicator (0=High/Alive, 1=Low/Dead)
}

export interface ExpressionRow {
  sampleid?: string;
  gene_symbol: string;
  value: string;
}

export interface SurvivalMetrics {
  [symbol: string]: {
    meanHigh: number;
    meanLow: number;
    nHigh: number;
    nLow: number;
    nUsedHigh: number;
    nUsedLow: number;
    log1pHigh: number;
    log1pLow: number;
    highDiff: number;
    lowDiff: number;
    highStatus: 'up' | 'down' | 'neutral';
    lowStatus: 'up' | 'down' | 'neutral';
  };
}

export type Theme = 'dark' | 'light';
export type ViewMode = 'list' | 'correlation' | 'enrichment' | 'graph' | 'terrain' | 'survival' | 'raw';
export type TerrainLayer = 'gaussian' | 'discrete' | 'water' | 'sky';

export interface FilterCondition {
  field: string;
  operator: string;
  value?: number;
  value2?: number;
  boolValue?: boolean;
  stringValue?: string;
}

export interface SortCondition {
  field: string;
  direction: 'asc' | 'desc';
}

export interface ResearchContext {
  activeDisease: DiseaseInfo | null;
  targets: Target[];
  enrichment: EnrichmentResult[];
  limit: number;
  currentPage: number;
  focusSymbol: string | null;
  activeRace?: string;
  activeGender?: string;
  activeAgeGroup?: string;
  lastAnalyzedRace?: string;
  lastAnalyzedGender?: string;
  lastAnalyzedAgeGroup?: string;
  availableRaces?: string[];
  availableGenders?: string[];
  availableAgeGroups?: string[];
  survivalMetrics?: SurvivalMetrics;
  isAnalyzingSurvival?: boolean;
  medianOs?: number;
  filters: FilterCondition[];
  sorts: SortCondition[];
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  options?: DiseaseInfo[];
  filterOptions?: { label: string; scoreType: string; threshold: number; operator: 'gt' | 'lt' }[];
  toolCall?: string;
}