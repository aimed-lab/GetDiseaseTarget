import { Target, DrugInfo, DiseaseInfo, EnrichmentResult, PubMedStats, ClinicalSample, ExpressionRow, DrillDownData } from './types';
import { GoogleGenAI } from "@google/genai";

const OPEN_TARGETS_API = 'https://api.platform.opentargets.org/api/v4/graphql';
const ENRICHR_API = 'https://maayanlab.cloud/Enrichr';
const PUBMED_API = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

export const api = {
  async searchDiseases(query: string): Promise<DiseaseInfo[]> {
    const GQL_QUERY = `
      query SearchDisease($queryString: String!) {
        search(queryString: $queryString, entityNames: ["disease"], page: {index: 0, size: 25}) {
          hits { id name score description }
        }
      }
    `;

    const executeSearch = async (searchTerm: string) => {
      try {
        const res = await fetch(OPEN_TARGETS_API, { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify({ query: GQL_QUERY, variables: { queryString: searchTerm } }) 
        });
        const result = await res.json();
        return result.data?.search?.hits || [];
      } catch (err) { return []; }
    };

    // Stage 1: Direct Search
    let hits = await executeSearch(query);

    // Stage 2: Semantic Correction Fallback
    // If no hits found or query looks like a misspelling (imprecise), use Gemini to normalize
    if (hits.length === 0 || query.length < 4 || /^[A-Z\s]+$/.test(query)) {
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const correctionResponse = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: `Identify the single most likely standard clinical disease name for the following potentially misspelled or imprecise term: "${query}". Return only the corrected name string, nothing else.`,
        });
        
        const correctedQuery = correctionResponse.text?.trim();
        if (correctedQuery && correctedQuery.toLowerCase() !== query.toLowerCase()) {
          const secondHits = await executeSearch(correctedQuery);
          if (secondHits.length > 0) {
            hits = secondHits;
          }
        }
      } catch (e) {
        console.error("Semantic correction failed", e);
      }
    }

    return hits.map((h: any) => ({ id: h.id, name: h.name, score: h.score }));
  },

  async getGenes(efoId: string, size: number = 30, page: number = 0): Promise<Target[]> {
    const GQL_QUERY = `
      query GetAssociatedTargets($efoId: String!, $size: Int!, $page: Int!) {
        disease(efoId: $efoId) {
          associatedTargets(page: {index: $page, size: $size}) {
            rows {
              target { 
                id 
                approvedSymbol 
                approvedName 
                pathways { pathway }
                expressions {
                  tissue { label }
                  rna { value }
                }
              }
              score
              datatypeScores { id score }
            }
          }
        }
      }
    `;
    try {
      const res = await fetch(OPEN_TARGETS_API, { 
        method: 'POST', headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ query: GQL_QUERY, variables: { efoId, size, page } }) 
      });
      const data = await res.json();
      const rows = data.data?.disease?.associatedTargets?.rows || [];
      const seen = new Set();
      const uniqueTargets: Target[] = [];
      for (const r of rows) {
        if (!seen.has(r.target.id)) {
          seen.add(r.target.id);
          const geneticScore = r.datatypeScores.find((s:any) => s.id.includes('genetic'))?.score || 0;
          const expressionScore = r.datatypeScores.find((s:any) => s.id.includes('rna'))?.score || 0;
          const targetScore = r.datatypeScores.find((s:any) => s.id.includes('drug'))?.score || 0;
          const literatureScore = r.datatypeScores.find((s:any) => s.id.includes('literature'))?.score || 0;
          const clinicalScore = r.datatypeScores.find((s:any) => s.id.includes('known_drug'))?.score || 0;
          const noveltyScore = 1 - literatureScore;

          const expressions = r.target.expressions || [];
          const brainTissues = ['brain', 'cortex', 'hippocampus', 'cerebellum'];
          const relevant = expressions.filter((e: any) => 
            brainTissues.some(bt => e.tissue.label.toLowerCase().includes(bt))
          );
          let baselineValue = 0;
          if (relevant.length > 0) {
            const avgTPM = relevant.reduce((acc: number, curr: any) => acc + (curr.rna?.value || 0), 0) / relevant.length;
            baselineValue = Math.min(1, Math.log10(avgTPM + 1) / 2);
          }

          uniqueTargets.push({
            id: r.target.id,
            symbol: r.target.approvedSymbol,
            name: r.target.approvedName,
            overallScore: r.score,
            geneticScore,
            expressionScore,
            literatureScore,
            clinicalScore,
            noveltyScore,
            baselineExpression: baselineValue,
            combinedExpression: Math.max(expressionScore, baselineValue),
            targetScore,
            pathways: r.target.pathways?.map((p:any) => ({ id: p.pathway, label: p.pathway })) || []
          });
        }
      }
      return uniqueTargets;
    } catch (err) { return []; }
  },

  async getTargetDrugs(ensemblId: string): Promise<DrugInfo[]> {
    const GQL_QUERY = `query GetTargetDrugs($ensemblId: String!) { target(ensemblId: $ensemblId) { knownDrugs { rows { drug { id name mechanismsOfAction { rows { mechanismOfAction } } } status phase } } } }`;
    try {
      const res = await fetch(OPEN_TARGETS_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: GQL_QUERY, variables: { ensemblId } }) });
      const data = await res.json();
      const rows = data.data?.target?.knownDrugs?.rows || [];
      const seen = new Set();
      const uniqueDrugs: DrugInfo[] = [];
      for (const r of rows) {
        if (!seen.has(r.drug.id)) {
          seen.add(r.drug.id);
          uniqueDrugs.push({
            id: r.drug.id,
            name: r.drug.name,
            phase: r.phase,
            status: r.status,
            mechanism: r.drug.mechanismsOfAction?.rows[0]?.mechanismOfAction || "Unknown Mechanism"
          });
        }
      }
      return uniqueDrugs;
    } catch (e) { return []; }
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
    } catch (e) { return []; }
  },

  async getPubMedStats(symbol: string, diseaseName: string): Promise<PubMedStats> {
    const apiKeyParam = process.env.NCBI_API_KEY ? `&api_key=${process.env.NCBI_API_KEY}` : '';
    const baseQuery = `("${diseaseName}"[Title/Abstract]) AND ("${symbol}"[Title/Abstract])`;
    const recentQuery = `${baseQuery} AND ("2024"[Date - Publication] : "2025"[Date - Publication])`;

    const searchLink = `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(recentQuery)}&sort=pubdate`;
    const primarySearchLink = searchLink;

    try {
      const [totalData, recentData] = await Promise.all([
        fetch(`${PUBMED_API}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(baseQuery)}&retmode=json${apiKeyParam}`)
          .then(r => r.json()),
        fetch(`${PUBMED_API}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(recentQuery)}&retmode=json${apiKeyParam}`)
          .then(r => r.json())
      ]);

      const total = parseInt(totalData.esearchresult.count || '0');
      const recent = parseInt(recentData.esearchresult.count || '0');
      const recentIds = (recentData.esearchresult.idlist ?? []).slice(0, 3).join(',');

      let topPapers: { title: string; id: string }[] = [];
      if (recentIds) {
        const summaryData = await fetch(
          `${PUBMED_API}/esummary.fcgi?db=pubmed&id=${recentIds}&retmode=json${apiKeyParam}`
        ).then(r => r.json());

        topPapers = (summaryData.result.uids ?? [])
          .slice(0, 3)
          .map((k: string) => ({
            title: summaryData.result[k]?.title ?? 'Untitled',
            id: k
          }));
      }

      return { total, recent, topPapers, searchLink, primarySearchLink };
    } catch (e) {
      console.error(`PubMed fetch failed [${symbol}/${diseaseName}]:`, e);
      return { total: 0, recent: 0, topPapers: [], searchLink, primarySearchLink };
    }
  },

  async getDrillDownData(symbol: string, diseaseName: string): Promise<DrillDownData> {
    const drillDown: DrillDownData = {
      trial_count: 0,
      max_phase: 'N/A',
      active_trial_present: false,
      paper_count: 0,
      recent_paper_count: 0,
      latest_publication_date: 'N/A'
    };

    try {
      // 1. ClinicalTrials.gov API v2
      try {
        const fields = [
          'protocolSection.identificationModule.nctId',
          'protocolSection.statusModule.overallStatus',
          'protocolSection.designModule.phases',
          'protocolSection.designModule.studyType',
          'protocolSection.conditionsModule.conditions',
          'protocolSection.armsInterventionsModule.interventions',
          'protocolSection.sponsorCollaboratorsModule.leadSponsor.class'
        ].join(',');

        const ctUrl = `https://clinicaltrials.gov/api/v2/studies?query.cond=${encodeURIComponent(
          diseaseName
        )}&query.term=${encodeURIComponent(symbol)}&pageSize=100&countTotal=true&fields=${fields}`;

        const ctRes = await fetch(ctUrl);

        if (ctRes.ok) {
          const ctData = await ctRes.json();
          const studies = ctData.studies || [];

          // 1. Trial count
          drillDown.trial_count = ctData.totalCount ?? studies.length;

          // 2. Filter for Interventional Studies
          const interventionalStudies = studies.filter((s: any) =>
            s.protocolSection?.designModule?.studyType === 'INTERVENTIONAL'
          );
          drillDown.interventional_count = interventionalStudies.length;

          // 3. Max phase and breakdown (ONLY on interventional studies)
          const phaseOrder = ['EARLY_PHASE1', 'PHASE1', 'PHASE2', 'PHASE3', 'PHASE4'];
          let maxPhaseIdx = -1;
          const phaseBreakdown: Record<string, number> = { 'EARLY_PHASE1': 0, 'PHASE1': 0, 'PHASE2': 0, 'PHASE3': 0, 'PHASE4': 0 };
          const conditionsMap: Record<string, number> = {};
          const drugsMap: Record<string, number> = {};
          const sponsorMap: Record<string, number> = {};

          interventionalStudies.forEach((s: any) => {
            const phases = s.protocolSection?.designModule?.phases || [];
            phases.forEach((p: string) => {
              const idx = phaseOrder.indexOf(p);
              if (idx > maxPhaseIdx) maxPhaseIdx = idx;
              if (phaseBreakdown[p] !== undefined) phaseBreakdown[p]++;
            });

            // Conditions
            const conds = s.protocolSection?.conditionsModule?.conditions || [];
            conds.forEach((c: string) => {
              conditionsMap[c] = (conditionsMap[c] || 0) + 1;
            });

            // Drugs (Better approach: filter by type)
            const interventions = s.protocolSection?.armsInterventionsModule?.interventions || [];
            interventions
              .filter((i: any) => i.type === 'DRUG' || i.type === 'BIOLOGICAL')
              .forEach((i: any) => {
                const name = i.name.trim();
                drugsMap[name] = (drugsMap[name] || 0) + 1;
              });
          });

          // Sponsors (Dynamic calculation on all studies)
          studies.forEach((s: any) => {
            const cls = s.protocolSection?.sponsorCollaboratorsModule?.leadSponsor?.class;
            if (cls) {
              // normalize FED/U_S_FED → NIH bucket
              const label = (cls === 'NIH' || cls === 'FED' || cls === 'U_S_FED') 
                ? 'NIH' 
                : cls; // INDUSTRY, OTHER, INDIV, NETWORK stay as-is
              sponsorMap[label] = (sponsorMap[label] || 0) + 1;
            }
          });

          drillDown.max_phase = maxPhaseIdx >= 0 ? phaseOrder[maxPhaseIdx] : 'N/A';
          drillDown.phase_breakdown = phaseBreakdown;
          drillDown.top_conditions = Object.entries(conditionsMap).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count }));
          drillDown.top_drugs = Object.entries(drugsMap).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count }));
          drillDown.sponsor_breakdown = sponsorMap;

          // 4. Active trial present
          const activeStatuses = [
            'RECRUITING',
            'ACTIVE_NOT_RECRUITING',
            'ENROLLING_BY_INVITATION'
          ];

          drillDown.active_trial_present = studies.some((s: any) =>
            activeStatuses.includes(s.protocolSection?.statusModule?.overallStatus)
          );
        }
      } catch (err) {
        console.error('ClinicalTrials fetch failed:', err);
      }

      // 3. AI Summary
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const prompt = `Based on the following clinical trial data for the gene ${symbol} in the context of ${diseaseName}:
        - Total Trials: ${drillDown.trial_count}
        - Max Phase: ${drillDown.max_phase}
        - Phase Breakdown: ${JSON.stringify(drillDown.phase_breakdown)}
        - Top Conditions: ${JSON.stringify(drillDown.top_conditions)}
        - Top Drugs: ${JSON.stringify(drillDown.top_drugs)}
        - Sponsor Breakdown: ${JSON.stringify(drillDown.sponsor_breakdown)}
        
        Generate a concise, professional clinical insight (2-3 sentences). Focus on validation level, commercial interest, and standard-of-care potential. Do not use placeholders.`;
        
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: prompt,
        });
        drillDown.clinical_summary = response.text?.trim();
      } catch (e) {
        console.error("AI Clinical Summary failed", e);
      }

      // 4. Europe PMC
      const currentYear = new Date().getFullYear();
      const threeYearsAgo = currentYear - 3;
      const epQuery = `${symbol} AND "${diseaseName}"`;
      const epRecentQuery = `${symbol} AND "${diseaseName}" AND FIRST_PDATE:[${threeYearsAgo}-01-01 TO ${currentYear}-12-31]`;
      
      const [epTotalRes, epRecentRes] = await Promise.all([
        fetch(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(epQuery)}&format=json&pageSize=1&sort_date:y`),
        fetch(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(epRecentQuery)}&format=json&pageSize=1`)
      ]);

      if (epTotalRes.ok) {
        const epTotalData = await epTotalRes.json();
        drillDown.paper_count = epTotalData.hitCount || 0;
        if (epTotalData.resultList?.result?.length > 0) {
          const firstResult = epTotalData.resultList.result[0];
          drillDown.latest_publication_date = firstResult.firstPubDate || firstResult.pubYear || 'N/A';
        }
      }

      if (epRecentRes.ok) {
        const epRecentData = await epRecentRes.json();
        drillDown.recent_paper_count = epRecentData.hitCount || 0;
      }

    } catch (e) {
      console.error("Drill down fetch failed:", e);
    }

    return drillDown;
  },

  async getTcgaClinical(cancerType: string, offset: number = 0): Promise<any[]> {
    try {
      const res = await fetch(`https://aimed.uab.edu/apex/gtkb/clinical_data/pancan/${cancerType.toLowerCase()}?offset=${offset}`);
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = await res.json();
      return data.items || data.rows || (Array.isArray(data) ? data : []);
    } catch (e) { 
      console.error("getTcgaClinical failed:", e);
      return []; 
    }
  },

  async getTcgaExpressionPage(cancerType: string, genes: string[], offset: number): Promise<{ items: any[], hasMore: boolean }> {
    try {
      const genesParam = genes.join(',');
      const res = await fetch(`https://aimed.uab.edu/apex/gtkb/gene_exp/data?condition=${cancerType.toLowerCase()}&genes=${genesParam}&row_limit=10000`);
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = await res.json();
      return {
        items: data.result || data.items || data.rows || (Array.isArray(data) ? data : []),
        hasMore: data.hasMore || false
      };
    } catch (e) { 
      console.error("getTcgaExpressionPage failed:", e);
      return { items: [], hasMore: false }; 
    }
  }
};