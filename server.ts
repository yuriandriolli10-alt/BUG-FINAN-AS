import express from "express";
import fileUpload from "express-fileupload";
import * as xlsx from "xlsx";
import Database from "better-sqlite3";
import { createServer as createViteServer } from "vite";
import path from "path";

const app = express();
const PORT = 3000;
const db = new Database("finance.db");

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS receitas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mes TEXT,
    cliente TEXT,
    valor REAL,
    status TEXT
  );

  CREATE TABLE IF NOT EXISTS despesas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mes TEXT,
    nome_despesa TEXT,
    valor REAL,
    status TEXT,
    tipo TEXT
  );

  CREATE TABLE IF NOT EXISTS resumo_anual (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    total_entradas REAL,
    total_saidas REAL,
    saldo_atual REAL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// Set a default sheet URL if it doesn't exist
db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)")
  .run("sheet_url", "https://docs.google.com/spreadsheets/d/123o-txQsbM9gf1aOG8sjlTb7M5WAdkptky4ulO4ixHo/export?format=xlsx");


app.use(express.json());
app.use(fileUpload());

const MESES = [
  "JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO",
  "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"
];

// Helper to clean numeric values from Excel
const parseCurrency = (val: any): number => {
  if (typeof val === "number") return val;
  if (val === undefined || val === null) return 0;
  
  let s = String(val).trim();
  if (s === "" || s.toLowerCase() === "null") return 0;
  
  // Keep only digits, comma and dot
  s = s.replace(/[^\d,.]/g, "");
  if (s === "") return 0;

  if (s.includes(",")) {
    // Brazilian format: 1.234,56 -> 1234.56
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    // No comma. Could be 1.234 (milhar) or 12.34 (decimal)
    const parts = s.split(".");
    if (parts.length > 1) {
      const lastPart = parts[parts.length - 1];
      if (lastPart.length === 3) {
        s = s.replace(/\./g, "");
      }
    }
  }
  
  const num = parseFloat(s);
  return isNaN(num) ? 0 : num;
};

const processWorkbook = (workbook: xlsx.WorkBook) => {
  db.prepare("DELETE FROM receitas").run();
  db.prepare("DELETE FROM despesas").run();
  db.prepare("DELETE FROM resumo_anual").run();

  MESES.forEach(mes => {
    const sheet = workbook.Sheets[mes];
    if (!sheet) return;

    const data: any[][] = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true });
    
    // Find Entradas Section
    let entHeaderRow = -1;
    let entNameCol = -1;
    let entValueCol = -1;
    let entStatusCol = -1;

    for (let r = 0; r < Math.min(data.length, 20); r++) {
      const row = data[r];
      if (!row) continue;
      for (let c = 0; c < row.length; c++) {
        const val = String(row[c] || "").toUpperCase().trim();
        if (val.includes("CLIENTES/ENTRADA") || val === "CLIENTES") {
          entHeaderRow = r;
          entNameCol = c;
          // Look for VALOR and STATUS in this row or the next one
          const searchRows = [data[r], data[r+1]].filter(Boolean);
          searchRows.forEach(sRow => {
            sRow.forEach((cell, idx) => {
              const sVal = String(cell || "").toUpperCase().trim();
              if (sVal.includes("VALOR") && entValueCol === -1) entValueCol = idx;
              if (sVal.includes("STATUS") && entStatusCol === -1) entStatusCol = idx;
            });
          });
          // Fallback: If VALOR not found, assume it's Column B (index 1) if names are in A (index 0)
          if (entValueCol === -1) entValueCol = entNameCol + 1;
          if (entStatusCol === -1) entStatusCol = entNameCol + 2;
          break;
        }
      }
      if (entHeaderRow !== -1) break;
    }

    // Find Saídas Section
    let saiHeaderRow = -1;
    let saiNameCol = -1;
    let saiValueCol = -1;
    let saiStatusCol = -1;

    for (let r = 0; r < Math.min(data.length, 20); r++) {
      const row = data[r];
      if (!row) continue;
      for (let c = 0; c < row.length; c++) {
        const val = String(row[c] || "").toUpperCase().trim();
        if (val.includes("SAÍDA MENSAL") || val === "SAÍDAS") {
          saiHeaderRow = r;
          saiNameCol = c;
          const searchRows = [data[r], data[r+1]].filter(Boolean);
          searchRows.forEach(sRow => {
            sRow.forEach((cell, idx) => {
              const sVal = String(cell || "").toUpperCase().trim();
              if (sVal.includes("VALOR") && saiValueCol === -1) saiValueCol = idx;
              if (sVal.includes("STATUS") && saiStatusCol === -1) saiStatusCol = idx;
            });
          });
          if (saiValueCol === -1) saiValueCol = saiNameCol + 1;
          if (saiStatusCol === -1) saiStatusCol = saiNameCol + 2;
          break;
        }
      }
      if (saiHeaderRow !== -1) break;
    }

    data.forEach((row, idx) => {
      // Process Entradas
      if (entHeaderRow !== -1 && idx > entHeaderRow && row[entNameCol]) {
        const cliente = String(row[entNameCol]).trim();
        const isHeader = cliente.toUpperCase().includes("CLIENTES") || 
                         cliente.toUpperCase().includes("ENTRADA") ||
                         cliente.toUpperCase().includes("VALOR");
        
        if (cliente !== "" && !isHeader) {
          let rawValor = row[entValueCol];
          // If the identified column is empty, look for the first number to the right
          if (rawValor === "" || rawValor === undefined || parseCurrency(rawValor) === 0) {
            for (let i = entNameCol + 1; i < Math.min(entNameCol + 5, row.length); i++) {
              const v = parseCurrency(row[i]);
              if (v !== 0) {
                rawValor = row[i];
                break;
              }
            }
          }
          
          const valor = parseCurrency(rawValor);
          const status = String(row[entStatusCol] || "PENDENTE").trim();
          
          if (valor !== 0 || cliente.length > 2) {
            db.prepare("INSERT INTO receitas (mes, cliente, valor, status) VALUES (?, ?, ?, ?)").run(mes, cliente, valor, status);
          }
        }
      }

      // Process Saídas
      if (saiHeaderRow !== -1 && idx > saiHeaderRow && row[saiNameCol]) {
        const nome = String(row[saiNameCol]).trim();
        const isHeader = nome.toUpperCase().includes("SAÍDA") || 
                         nome.toUpperCase().includes("VALOR") ||
                         nome.toUpperCase().trim() === "CLIENTES";
        
        if (nome !== "" && !isHeader) {
          let rawValor = row[saiValueCol];
          if (rawValor === "" || rawValor === undefined || parseCurrency(rawValor) === 0) {
            for (let i = saiNameCol + 1; i < Math.min(saiNameCol + 5, row.length); i++) {
              const v = parseCurrency(row[i]);
              if (v !== 0) {
                rawValor = row[i];
                break;
              }
            }
          }

          const valor = parseCurrency(rawValor);
          const status = String(row[saiStatusCol] || "PENDENTE").trim();
          
          const fixas = ["ALUGUEL", "ENVATO", "SIMPLES", "CONTADOR", "INSS", "ICARO", "CHATGPT", "ADOBE"];
          const tipo = fixas.some(f => nome.toUpperCase().includes(f)) ? "FIXA" : "VARIÁVEL";

          if (valor !== 0 || nome.length > 2) {
            db.prepare("INSERT INTO despesas (mes, nome_despesa, valor, status, tipo) VALUES (?, ?, ?, ?, ?)").run(mes, nome, valor, status, tipo);
          }
        }
      }
    });
  });

  // 2. Parse CAIXA BUG Tab (Flexible name search)
  const caixaTabName = workbook.SheetNames.find(name => 
    name.toUpperCase().includes("CAIXA") || name.toUpperCase().includes("RESUMO")
  );
  
  const caixaSheet = caixaTabName ? workbook.Sheets[caixaTabName] : null;
  if (caixaSheet) {
    const data: any[][] = xlsx.utils.sheet_to_json(caixaSheet, { header: 1, defval: "", raw: true });
    let totalEntradas = 0;
    let totalSaidas = 0;
    let saldoAtual = 0;

    data.forEach(row => {
      row.forEach((cell, idx) => {
        const val = String(cell || "").toUpperCase().trim();
        const findValue = (startIdx: number) => {
          for (let i = startIdx; i < Math.min(startIdx + 5, row.length); i++) {
            const v = parseCurrency(row[i]);
            if (v !== 0) return v;
          }
          return 0;
        };

        if (val.includes("ENTRADA TOTAL") || val.includes("TOTAL ENTRADAS")) {
          totalEntradas = findValue(idx + 1);
        }
        if (val.includes("SAÍDA TOTAL") || val.includes("TOTAL SAÍDAS")) {
          totalSaidas = findValue(idx + 1);
        }
        if (val.includes("VALOR ATUAL") || val.includes("SALDO") || val.includes("CAIXA")) {
          const v = findValue(idx + 1);
          if (v !== 0) saldoAtual = v;
        }
      });
    });

    db.prepare("INSERT INTO resumo_anual (id, total_entradas, total_saidas, saldo_atual) VALUES (1, ?, ?, ?)").run(totalEntradas, totalSaidas, saldoAtual);
  }
};

app.post("/api/upload", (req, res) => {
  if (!req.files || !req.files.file) {
    return res.status(400).json({ error: "Nenhum arquivo enviado." });
  }

  const file = req.files.file as fileUpload.UploadedFile;
  const workbook = xlsx.read(file.data, { type: "buffer" });
  processWorkbook(workbook);
  res.json({ success: true });
});

app.post("/api/sync-google", async (req, res) => {
  try {
    const sheetUrlRow = db.prepare("SELECT value FROM settings WHERE key = 'sheet_url'").get() as { value: string };
    if (!sheetUrlRow || !sheetUrlRow.value) {
      throw new Error("URL da planilha não configurada.");
    }
    
    let url = sheetUrlRow.value;
    // Ensure the URL is in export format
    if (!url.includes("/export?format=xlsx")) {
      const sheetIdMatch = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (!sheetIdMatch) throw new Error("URL da planilha inválida.");
      const sheetId = sheetIdMatch[1];
      url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`;
    }

    const response = await fetch(url);
    if (!response.ok) throw new Error("Falha ao baixar planilha do Google. Verifique o link e as permissões de compartilhamento.");
    
    const buffer = await response.arrayBuffer();
    const workbook = xlsx.read(Buffer.from(buffer), { type: "buffer" });
    
    processWorkbook(workbook);
    res.json({ success: true });
  } catch (error: any) {
    console.error("Erro na sincronização:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/dashboard", (req, res) => {
  const receitas = db.prepare("SELECT * FROM receitas").all();
  const despesas = db.prepare("SELECT * FROM despesas").all();
  
  // Calculate totals dynamically from monthly data
  const totalEntradasCalc = receitas.reduce((acc: number, r: any) => acc + r.valor, 0);
  const totalSaidasCalc = despesas.reduce((acc: number, d: any) => acc + d.valor, 0);
  
  // Get data from summary table (CAIXA BUG)
  let resumoAnual = db.prepare("SELECT * FROM resumo_anual WHERE id = 1").get();
  
  if (!resumoAnual) {
    resumoAnual = {
      total_entradas: totalEntradasCalc,
      total_saidas: totalSaidasCalc,
      saldo_atual: totalEntradasCalc - totalSaidasCalc
    };
  } else {
    // Override totals with calculated ones to ensure they match the monthly tabs
    resumoAnual.total_entradas = totalEntradasCalc;
    resumoAnual.total_saidas = totalSaidasCalc;
    // If saldo_atual is zero, use the calculated difference
    if (resumoAnual.saldo_atual === 0) {
      resumoAnual.saldo_atual = totalEntradasCalc - totalSaidasCalc;
    }
  }

  // Aggregate monthly data for charts
  const mensal: any = {};
  MESES.forEach(m => {
    mensal[m] = { mes: m, entradas: 0, saidas: 0, saldo: 0 };
  });

  receitas.forEach((r: any) => {
    if (mensal[r.mes]) mensal[r.mes].entradas += r.valor;
  });
  despesas.forEach((d: any) => {
    if (mensal[d.mes]) mensal[d.mes].saidas += d.valor;
  });

  Object.values(mensal).forEach((m: any) => {
    m.saldo = m.entradas - m.saidas;
  });

  res.json({
    resumoAnual,
    mensal: Object.values(mensal),
    receitas,
    despesas
  });
});

app.get("/api/settings", (req, res) => {
  const sheetUrlRow = db.prepare("SELECT value FROM settings WHERE key = 'sheet_url'").get() as { value: string };
  res.json({ sheet_url: sheetUrlRow?.value || "" });
});

app.post("/api/settings", (req, res) => {
  const { sheet_url } = req.body;
  if (typeof sheet_url !== 'string') {
    return res.status(400).json({ error: "URL da planilha inválida." });
  }
  db.prepare("UPDATE settings SET value = ? WHERE key = 'sheet_url'").run(sheet_url);
  res.json({ success: true });
});


async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
