import express from "express";
import { createServer as createViteServer } from "vite";
import { Client } from "@notionhq/client";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // Notion Export Endpoint
  app.post("/api/export/notion", async (req, res) => {
    const { targets, disease } = req.body;
    const notionToken = process.env.NOTION_TOKEN;
    let databaseId = process.env.NOTION_DATABASE_ID || "fdc47e2c2e0b4c5fb79d62c4b76ec8f1";

    // Robust ID extraction: if it's a URL, extract the 32-char UUID
    if (databaseId.includes("notion.so/")) {
      const parts = databaseId.split("/");
      const lastPart = parts[parts.length - 1].split("?")[0];
      databaseId = lastPart;
    }

    if (!notionToken || !databaseId) {
      return res.status(400).json({ 
        error: "Notion configuration missing. Please set NOTION_TOKEN and NOTION_DATABASE_ID in environment variables." 
      });
    }

    console.log(`Using Notion Database ID: ${databaseId}`);
    const notion = new Client({ auth: notionToken });

    try {
      console.log(`Exporting ${targets.length} targets to Notion for disease: ${disease?.name}`);
      
      const results = [];
      const errors = [];
      
      // Export in batches to be safe
      const prioritizedTargets = targets
        .filter((t: any) => !t.usefulness || !Object.values(t.usefulness).includes('not-useful'))
        .sort((a: any, b: any) => {
          const aUseful = Object.values(a.usefulness || {}).filter(s => s === 'useful').length;
          const bUseful = Object.values(b.usefulness || {}).filter(s => s === 'useful').length;
          return bUseful - aUseful;
        });

      for (const target of prioritizedTargets.slice(0, 20)) { 
        try {
          const usefulSources = Object.entries(target.usefulness || {})
            .filter(([_, status]) => status === 'useful')
            .map(([source]) => source.charAt(0).toUpperCase() + source.slice(1))
            .join(", ");

          const response = await notion.pages.create({
            parent: { database_id: databaseId },
            properties: {
              Name: {
                title: [{ text: { content: target.symbol } }],
              },
              Disease: {
                rich_text: [{ text: { content: disease?.name || "Unknown" } }],
              },
              GeneticScore: {
                number: target.geneticScore || 0,
              },
              OverallScore: {
                number: target.overallScore || 0,
              },
              TargetScore: {
                number: target.targetScore || 0,
              },
              Expression: {
                number: target.combinedExpression || 0,
              },
              SupportingEvidence: {
                rich_text: [{ text: { content: usefulSources || "None" } }],
              }
            },
          });
          results.push(response.id);
        } catch (err: any) {
          console.error(`Failed to export target ${target.symbol}:`, err.message);
          errors.push(`${target.symbol}: ${err.message}`);
        }
      }

      if (results.length === 0 && errors.length > 0) {
        return res.status(500).json({ 
          error: "All export attempts failed. Common issues: 1. Database not shared with integration. 2. Property names/types mismatch. 3. Invalid token.",
          details: errors.slice(0, 3)
        });
      }

      res.json({ success: true, count: results.length, partialErrors: errors.length > 0 ? errors.slice(0, 3) : undefined });
    } catch (error: any) {
      console.error("Notion Export Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
    app.get("*", (req, res) => {
      res.sendFile(path.resolve(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
