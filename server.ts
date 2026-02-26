import express from "express";
import fileUpload from "express-fileupload";
import * as xlsx from "xlsx";
import { createServer as createViteServer } from "vite";
import path from "path";

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));
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
  
  s = s.replace(/[^\d,.]/g, "");
  if (s === "") return 0;

  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
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
  const receitas: any[] = [];
  const despesas: any[] = [];
  let resumoAnual: any = null;

  MESES.forEach(mes => {
    const sheet = workbook.Sheets[mes];
    if (!sheet) return;

    const data: any[][] = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true });
    
    let entHeaderRow = -1, entNameCol = -1, entValueCol = -1, entStatusCol = -1;
    for (let r = 0; r < Math.min(data.length, 20); r++) {
      const row = data[r];
      if (!row) continue;
      for (let c = 0; c < row.length; c++) {
        const val = String(row[c] || "").toUpperCase().trim();
        if (val.includes("CLIENTES/ENTRADA") || val === "CLIENTES") {
          entHeaderRow = r;
          entNameCol = c;
          const searchRows = [data[r], data[r+1]].filter(Boolean);
          searchRows.forEach(sRow => {
            sRow.forEach((cell, idx) => {
              const sVal = String(cell || "").toUpperCase().trim();
              if (sVal.includes("VALOR") && entValueCol === -1) entValueCol = idx;
              if (sVal.includes("STATUS") && entStatusCol === -1) entStatusCol = idx;
            });
          });
          if (entValueCol === -1) entValueCol = entNameCol + 1;
          if (entStatusCol === -1) entStatusCol = entNameCol + 2;
          break;
        }
      }
      if (entHeaderRow !== -1) break;
    }

    let saiHeaderRow = -1, saiNameCol = -1, saiValueCol = -1, saiStatusCol = -1;
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
      if (entHeaderRow !== -1 && idx > entHeaderRow && row[entNameCol]) {
        const cliente = String(row[entNameCol]).trim();
        const isHeader = cliente.toUpperCase().includes("CLIENTES") || cliente.toUpperCase().includes("ENTRADA") || cliente.toUpperCase().includes("VALOR");
        if (cliente !== "" && !isHeader) {
          let rawValor = row[entValueCol];
          if (rawValor === "" || rawValor === undefined || parseCurrency(rawValor) === 0) {
            for (let i = entNameCol + 1; i < Math.min(entNameCol + 5, row.length); i++) {
              const v = parseCurrency(row[i]);
              if (v !== 0) { rawValor = row[i]; break; }
            }
          }
          const valor = parseCurrency(rawValor);
          const status = String(row[entStatusCol] || "PENDENTE").trim();
          if (valor !== 0 || cliente.length > 2) {
            receitas.push({ id: receitas.length + 1, mes, cliente, valor, status });
          }
        }
      }

      if (saiHeaderRow !== -1 && idx > saiHeaderRow && row[saiNameCol]) {
        const nome = String(row[saiNameCol]).trim();
        const isHeader = nome.toUpperCase().includes("SAÍDA") || nome.toUpperCase().includes("VALOR") || nome.toUpperCase().trim() === "CLIENTES";
        if (nome !== "" && !isHeader) {
          let rawValor = row[saiValueCol];
          if (rawValor === "" || rawValor === undefined || parseCurrency(rawValor) === 0) {
            for (let i = saiNameCol + 1; i < Math.min(saiNameCol + 5, row.length); i++) {
              const v = parseCurrency(row[i]);
              if (v !== 0) { rawValor = row[i]; break; }
            }
          }
          const valor = parseCurrency(rawValor);
          const status = String(row[saiStatusCol] || "PENDENTE").trim();
          const fixas = ["ALUGUEL", "ENVATO", "SIMPLES", "CONTADOR", "INSS", "ICARO", "CHATGPT", "ADOBE"];
          const tipo = fixas.some(f => nome.toUpperCase().includes(f)) ? "FIXA" : "VARIÁVEL";
          if (valor !== 0 || nome.length > 2) {
            despesas.push({ id: despesas.length + 1, mes, nome_despesa: nome, valor, status, tipo });
          }
        }
      }
    });
  });

  const caixaTabName = workbook.SheetNames.find(name => name.toUpperCase().includes("CAIXA") || name.toUpperCase().includes("RESUMO"));
  const caixaSheet = caixaTabName ? workbook.Sheets[caixaTabName] : null;
  if (caixaSheet) {
    const data: any[][] = xlsx.utils.sheet_to_json(caixaSheet, { header: 1, defval: "", raw: true });
    let totalEntradas = 0, totalSaidas = 0, saldoAtual = 0;
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
        if (val.includes("ENTRADA TOTAL") || val.includes("TOTAL ENTRADAS")) totalEntradas = findValue(idx + 1);
        if (val.includes("SAÍDA TOTAL") || val.includes("TOTAL SAÍDAS")) totalSaidas = findValue(idx + 1);
        if (val.includes("VALOR ATUAL") || val.includes("SALDO") || val.includes("CAIXA")) {
          const v = findValue(idx + 1);
          if (v !== 0) saldoAtual = v;
        }
      });
    });
    resumoAnual = { total_entradas: totalEntradas, total_saidas: totalSaidas, saldo_atual: saldoAtual };
  }

  const totalEntradasCalc = receitas.reduce((acc, r) => acc + r.valor, 0);
  const totalSaidasCalc = despesas.reduce((acc, d) => acc + d.valor, 0);
  
  if (!resumoAnual) {
    resumoAnual = { total_entradas: totalEntradasCalc, total_saidas: totalSaidasCalc, saldo_atual: totalEntradasCalc - totalSaidasCalc };
  } else {
    resumoAnual.total_entradas = totalEntradasCalc;
    resumoAnual.total_saidas = totalSaidasCalc;
    if (resumoAnual.saldo_atual === 0) {
      resumoAnual.saldo_atual = totalEntradasCalc - totalSaidasCalc;
    }
  }

  const mensal: any = {};
  MESES.forEach(m => { mensal[m] = { mes: m, entradas: 0, saidas: 0, saldo: 0 }; });
  receitas.forEach(r => { if (mensal[r.mes]) mensal[r.mes].entradas += r.valor; });
  despesas.forEach(d => { if (mensal[d.mes]) mensal[d.mes].saidas += d.valor; });
  Object.values(mensal).forEach((m: any) => { m.saldo = m.entradas - m.saidas; });

  return { resumoAnual, mensal: Object.values(mensal), receitas, despesas };
};

app.post("/api/process-sheet", async (req, res) => {
  const { url: sheetUrl, file: fileData } = req.body;

  try {
    let workbook: xlsx.WorkBook;

    if (sheetUrl) {
      let url = sheetUrl;
      if (!url.includes("/export?format=xlsx")) {
        const sheetIdMatch = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
        if (!sheetIdMatch) throw new Error("URL da planilha inválida.");
        const sheetId = sheetIdMatch[1];
        url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`;
      }
      const response = await fetch(url);
      if (!response.ok) throw new Error("Falha ao baixar planilha. Verifique o link e permissões.");
      const buffer = await response.arrayBuffer();
      workbook = xlsx.read(Buffer.from(buffer), { type: "buffer" });
    } else if (fileData) {
      const buffer = Buffer.from(fileData, 'base64');
      workbook = xlsx.read(buffer, { type: 'buffer' });
    } else {
      return res.status(400).json({ error: "Nenhuma URL ou arquivo enviado." });
    }

    const data = processWorkbook(workbook);
    res.json(data);
  } catch (error: any) {
    console.error("Erro no processamento:", error);
    res.status(500).json({ error: error.message });
  }
});

// API routes are defined above this line

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    // Fallback to index.html for SPA routing, ensuring API routes are not overridden
    app.get(/^(?!\/api\/).*$/, (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
