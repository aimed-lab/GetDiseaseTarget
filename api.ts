
import { Target, DrugInfo, DiseaseInfo, EnrichmentResult, PubMedStats, ClinicalSample, ExpressionRow } from './types';

const OPEN_TARGETS_API = 'https://api.platform.opentargets.org/api/v4/graphql';
const ENRICHR_API = 'https://maayanlab.cloud/Enrichr';
const PUBMED_API = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

export const api = {
  async searchDiseases(query: string): Promise<DiseaseInfo[]> {
    const GQL_QUERY = `
      query SearchDisease($queryString: String!) {
        search(queryString: $queryString, entityNames: ["disease"], page: {index: 0, size: 25}) {
          hits { id name description }
        }
      }
    `;
    try {
      const res = await fetch(OPEN_TARGETS_API, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ query: GQL_QUERY, variables: { queryString: query } }) 
      });
      const result = await res.json();
      let hits = result.data?.search?.hits || [];
      return hits.map((h: any) => ({ id: h.id, name: h.name }));
    } catch (err) { return []; }
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
      
      return rows.map((r: any) => {
        const geneticScore = r.datatypeScores.find((s:any) => s.id.includes('genetic'))?.score || 0;
        const expressionScore = r.datatypeScores.find((s:any) => s.id.includes('rna'))?.score || 0;
        const targetScore = r.datatypeScores.find((s:any) => s.id.includes('drug'))?.score || 0;

        // Upfront Baseline Brain Expression Processing
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

        return {
          id: r.target.id,
          symbol: r.target.approvedSymbol,
          name: r.target.approvedName,
          overallScore: r.score,
          geneticScore,
          expressionScore,
          baselineExpression: baselineValue,
          combinedExpression: Math.max(expressionScore, baselineValue),
          targetScore,
          pathways: r.target.pathways?.map((p:any) => ({ id: p.pathway, label: p.pathway })) || []
        };
      });
    } catch (err) { return []; }
  },

  async getTargetDrugs(ensemblId: string): Promise<DrugInfo[]> {
    const GQL_QUERY = `query GetTargetDrugs($ensemblId: String!) { target(ensemblId: $ensemblId) { knownDrugs { rows { drug { id name mechanismsOfAction { rows { mechanismOfAction } } } status phase } } } }`;
    try {
      const res = await fetch(OPEN_TARGETS_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: GQL_QUERY, variables: { ensemblId } }) });
      const data = await res.json();
      const rows = data.data?.target?.knownDrugs?.rows || [];
      return rows.map((r: any) => ({
        id: r.drug.id,
        name: r.drug.name,
        phase: r.phase,
        status: r.status,
        mechanism: r.drug.mechanismsOfAction?.rows[0]?.mechanismOfAction || "Unknown Mechanism"
      }));
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
    const query = `(${diseaseName}[Title/Abstract]) AND (${symbol}[Gene])`;
    const searchLink = `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(diseaseName)}+AND+${encodeURIComponent(symbol)}&filter=years.2024-2025&sort=pubdate`;
    const primarySearchLink = `https://pubmed.ncbi.nlm.nih.gov/?term=(${encodeURIComponent(`"${diseaseName}"`)}[Title/Abstract])AND${encodeURIComponent(symbol)}[Gene]AND("2024"[Date+-+Publication]+:+ "2025"[Date+-+Publication])&sort=pubdate`;
    try {
      const totalSearch = await fetch(`${PUBMED_API}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmode=json`);
      const totalData = await totalSearch.json();
      const total = parseInt(totalData.esearchresult.count || "0");
      
      const recentQuery = `${query} AND ("2024"[Date - Publication] : "2025"[Date - Publication])`;
      const recentSearch = await fetch(`${PUBMED_API}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(recentQuery)}&retmode=json`);
      const recentData = await recentSearch.json();
      const recent = parseInt(recentData.esearchresult.count || "0");
      const recentIds = recentData.esearchresult.idlist.slice(0, 3).join(',');
      
      let topPapers = [];
      if (recentIds) {
        const summarySearch = await fetch(`${PUBMED_API}/esummary.fcgi?db=pubmed&id=${recentIds}&retmode=json`);
        const summaryData = await summarySearch.json();
        topPapers = Object.keys(summaryData.result).filter(k => k !== 'uids').map(k => ({ title: summaryData.result[k].title, id: k }));
      }
      return { total, recent, topPapers, searchLink, primarySearchLink };
    } catch (e) { 
      return { total: 0, recent: 0, topPapers: [], searchLink, primarySearchLink: searchLink }; 
    }
  },

  async getBrcaClinical(offset: number = 0): Promise<ClinicalSample[]> {
    try {
      const res = await fetch(`https://aimed.uab.edu/apex/gtkb/clinical_data/pancan/brca?offset=${offset}`);
      const data = await res.json();
      return data.items || [];
    } catch (e) { return []; }
  },

  async getBrcaExpression(sampleId: string): Promise<ExpressionRow[]> {
    try {
      const res = await fetch(`https://aimed.uab.edu/apex/gtkb/gene_exp/pancan/brca/${sampleId}`);
      const data = await res.json();
      return data.items || [];
    } catch (e) { return []; }
  }
};
