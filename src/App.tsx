import { useState, useEffect, useMemo } from "react";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  LineChart, Line, PieChart, Pie, Cell, AreaChart, Area 
} from "recharts";
import { 
  Upload, TrendingUp, TrendingDown, Wallet, Calendar, 
  Filter, Download, ChevronRight, AlertCircle, CheckCircle2,
  Clock, DollarSign, LayoutDashboard, PieChart as PieChartIcon,
  Table as TableIcon, FileSpreadsheet, Settings, X, Save
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { DashboardData, ResumoMensal, Receita, Despesa } from "./types";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const COLORS = ["#00704A", "#27251F", "#D4E9E2", "#1E3932", "#006241"];

export default function App() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"geral" | "mensal" | "anual">("geral");
  const [selectedMonth, setSelectedMonth] = useState<string>("JANEIRO");
  const [uploading, setUploading] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/dashboard");
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("Erro ao buscar dados:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", e.target.files[0]);

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        await fetchDashboard();
      }
    } catch (err) {
      console.error("Erro no upload:", err);
    } finally {
      setUploading(false);
    }
  };

  const filteredReceitas = useMemo(() => {
    if (!data) return [];
    return data.receitas.filter(r => r.mes === selectedMonth);
  }, [data, selectedMonth]);

  const filteredDespesas = useMemo(() => {
    if (!data) return [];
    return data.despesas.filter(d => d.mes === selectedMonth);
  }, [data, selectedMonth]);

  const monthlySummary = useMemo(() => {
    if (!data) return null;
    return data.mensal.find(m => m.mes === selectedMonth);
  }, [data, selectedMonth]);

  const despesaPorTipo = useMemo(() => {
    if (!data) return [];
    const counts = { FIXA: 0, VARIÁVEL: 0 };
    data.despesas.forEach(d => {
      if (d.mes === selectedMonth) {
        counts[d.tipo] += d.valor;
      }
    });
    return [
      { name: "Fixas", value: counts.FIXA },
      { name: "Variáveis", value: counts.VARIÁVEL }
    ];
  }, [data, selectedMonth]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL"
    }).format(val);
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#f7f7f7]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#00704A]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f7f7f7] font-sans text-[#27251F]">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-full w-64 bg-white border-r border-gray-200 z-20 hidden lg:block">
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 bg-[#00704A] rounded-full flex items-center justify-center">
            <DollarSign className="text-white w-6 h-6" />
          </div>
          <h1 className="font-bold text-xl tracking-tight">Bugstudios Finanças</h1>
        </div>
        
        <nav className="mt-6 px-4 space-y-2">
          <SidebarItem 
            icon={<LayoutDashboard size={20} />} 
            label="Visão Geral" 
            active={activeTab === "geral"} 
            onClick={() => setActiveTab("geral")} 
          />
          <SidebarItem 
            icon={<Calendar size={20} />} 
            label="Visão Mensal" 
            active={activeTab === "mensal"} 
            onClick={() => setActiveTab("mensal")} 
          />
        </nav>

        <div className="absolute bottom-8 left-0 w-full px-6 space-y-3">
          <button 
            onClick={async () => {
              setUploading(true);
              try {
                const res = await fetch("/api/sync-google", { method: "POST" });
                if (res.ok) await fetchDashboard();
              } catch (err) {
                console.error(err);
              } finally {
                setUploading(false);
              }
            }}
            disabled={uploading}
            className="flex items-center justify-center gap-2 w-full py-3 bg-white border border-[#00704A] text-[#00704A] hover:bg-green-50 rounded-xl cursor-pointer transition-all font-semibold text-sm disabled:opacity-50"
          >
            {uploading ? <div className="animate-spin rounded-full h-5 w-5 border-2 border-[#00704A] border-t-transparent" /> : <FileSpreadsheet size={18} />}
            Sincronizar Google
          </button>

          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="flex items-center justify-center gap-2 w-full py-3 bg-[#00704A] hover:bg-[#006241] text-white rounded-xl cursor-pointer transition-all shadow-lg shadow-green-900/10"
          >
            <Settings size={18} />
            <span className="font-semibold text-sm">Gerenciar Planilha</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="lg:ml-64 p-8">
        <SettingsModal 
          isOpen={isSettingsOpen} 
          onClose={() => setIsSettingsOpen(false)}
          onSave={async () => {
            // The sync is now triggered inside the modal, just refetch data
            await fetchDashboard();
            setIsSettingsOpen(false);
          }}
          onSyncStart={() => setUploading(true)}
          onSyncEnd={() => {
            fetchDashboard();
            setUploading(false);
            setIsSettingsOpen(false);
          }}
        />
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div>
            <h2 className="text-3xl font-bold text-[#27251F]">
              {activeTab === "geral" ? "Painel Executivo" : "Análise Mensal"}
            </h2>
            <p className="text-gray-500 mt-1">Bem-vindo ao controle financeiro da sua franquia.</p>
          </div>
          
          {activeTab === "mensal" && (
            <div className="flex items-center gap-3 bg-white p-2 rounded-xl border border-gray-200 shadow-sm">
              <Filter size={18} className="text-gray-400 ml-2" />
              <select 
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-transparent border-none focus:ring-0 text-sm font-medium pr-8"
              >
                {data?.mensal.map(m => (
                  <option key={m.mes} value={m.mes}>{m.mes}</option>
                ))}
              </select>
            </div>
          )}
        </header>

        {!data?.resumoAnual && !uploading && (
          <div className="bg-white rounded-3xl p-12 text-center border-2 border-dashed border-gray-200">
            <div className="bg-green-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
              <FileSpreadsheet className="text-[#00704A] w-10 h-10" />
            </div>
            <h3 className="text-2xl font-bold mb-2">Nenhum dado encontrado</h3>
            <p className="text-gray-500 max-w-md mx-auto mb-8">
              Faça o upload do arquivo Excel "FINAN BUG 2026" para gerar o seu dashboard financeiro interativo.
            </p>
            <label className="inline-flex items-center gap-2 px-8 py-4 bg-[#00704A] text-white rounded-2xl cursor-pointer hover:bg-[#006241] transition-all font-bold">
              <Upload size={20} />
              Selecionar Planilha
              <input type="file" className="hidden" accept=".xlsx" onChange={handleUpload} />
            </label>
          </div>
        )}

        {data && (
          <AnimatePresence mode="wait">
            {activeTab === "geral" && (
              <motion.div 
                key="geral"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                {/* KPI Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <KpiCard 
                    title="Saldo em Caixa" 
                    value={formatCurrency(data.resumoAnual?.saldo_atual || 0)} 
                    icon={<Wallet className="text-blue-600" />}
                    color="blue"
                    subtitle="Valor consolidado (CAIXA BUG)"
                  />
                  <KpiCard 
                    title="Entradas Totais" 
                    value={formatCurrency(data.resumoAnual?.total_entradas || 0)} 
                    icon={<TrendingUp className="text-emerald-600" />}
                    color="emerald"
                    subtitle="Acumulado anual"
                  />
                  <KpiCard 
                    title="Saídas Totais" 
                    value={formatCurrency(data.resumoAnual?.total_saidas || 0)} 
                    icon={<TrendingDown className="text-rose-600" />}
                    color="rose"
                    subtitle="Acumulado anual"
                  />
                  <KpiCard 
                    title="Resultado Líquido" 
                    value={formatCurrency((data.resumoAnual?.total_entradas || 0) - (data.resumoAnual?.total_saidas || 0))} 
                    icon={<TrendingUp className="text-amber-600" />}
                    color="amber"
                    subtitle="Lucro/Prejuízo anual"
                  />
                </div>

                {/* Main Charts */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="lg:col-span-2 bg-white p-8 rounded-3xl border border-gray-100 shadow-sm">
                    <div className="flex justify-between items-center mb-6">
                      <h3 className="font-bold text-lg">Evolução Mensal</h3>
                      <div className="flex gap-4 text-xs font-medium">
                        <div className="flex items-center gap-1.5">
                          <div className="w-3 h-3 rounded-full bg-[#00704A]" />
                          <span>Entradas</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-3 h-3 rounded-full bg-[#ef4444]" />
                          <span>Saídas</span>
                        </div>
                      </div>
                    </div>
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.mensal}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                          <XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} />
                          <Tooltip 
                            contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                            formatter={(val: number) => formatCurrency(val)}
                          />
                          <Bar dataKey="entradas" fill="#00704A" radius={[4, 4, 0, 0]} barSize={20} />
                          <Bar dataKey="saidas" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={20} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm">
                    <h3 className="font-bold text-lg mb-6">Saldo Acumulado</h3>
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data.mensal}>
                          <defs>
                            <linearGradient id="colorSaldo" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#00704A" stopOpacity={0.1}/>
                              <stop offset="95%" stopColor="#00704A" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                          <XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} />
                          <YAxis hide />
                          <Tooltip 
                            contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                            formatter={(val: number) => formatCurrency(val)}
                          />
                          <Area type="monotone" dataKey="saldo" stroke="#00704A" strokeWidth={3} fillOpacity={1} fill="url(#colorSaldo)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === "mensal" && (
              <motion.div 
                key="mensal"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-8"
              >
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <KpiCard 
                    title="Receita do Mês" 
                    value={formatCurrency(monthlySummary?.entradas || 0)} 
                    icon={<TrendingUp className="text-emerald-600" />}
                    color="emerald"
                  />
                  <KpiCard 
                    title="Despesas do Mês" 
                    value={formatCurrency(monthlySummary?.saidas || 0)} 
                    icon={<TrendingDown className="text-rose-600" />}
                    color="rose"
                  />
                  <KpiCard 
                    title="Lucro Mensal" 
                    value={formatCurrency(monthlySummary?.saldo || 0)} 
                    icon={<DollarSign className="text-amber-600" />}
                    color="amber"
                  />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm">
                    <h3 className="font-bold text-lg mb-6">Mix de Despesas</h3>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={despesaPorTipo}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey="value"
                          >
                            {despesaPorTipo.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(val: number) => formatCurrency(val)} />
                          <Legend verticalAlign="bottom" height={36}/>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm">
                    <h3 className="font-bold text-lg mb-6">Despesas Fixas</h3>
                    <div className="space-y-4 overflow-y-auto max-h-64 pr-2">
                      {filteredDespesas.filter(d => d.tipo === "FIXA").map(d => (
                        <div key={d.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-xl">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center border border-gray-100">
                              <CheckCircle2 size={16} className="text-green-600" />
                            </div>
                            <span className="font-medium text-sm">{d.nome_despesa}</span>
                          </div>
                          <span className="font-bold text-sm">{formatCurrency(d.valor)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                      <h3 className="font-bold">Entradas</h3>
                      <span className="text-xs font-medium px-2 py-1 bg-green-100 text-green-700 rounded-lg">
                        {filteredReceitas.length} registros
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50 text-gray-500 font-medium">
                          <tr>
                            <th className="px-6 py-4">Cliente/Origem</th>
                            <th className="px-6 py-4">Valor</th>
                            <th className="px-6 py-4">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {filteredReceitas.map(r => (
                            <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                              <td className="px-6 py-4 font-medium">{r.cliente}</td>
                              <td className="px-6 py-4">{formatCurrency(r.valor)}</td>
                              <td className="px-6 py-4">
                                <StatusBadge status={r.status} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                      <h3 className="font-bold">Saídas</h3>
                      <span className="text-xs font-medium px-2 py-1 bg-red-100 text-red-700 rounded-lg">
                        {filteredDespesas.length} registros
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50 text-gray-500 font-medium">
                          <tr>
                            <th className="px-6 py-4">Despesa</th>
                            <th className="px-6 py-4">Valor</th>
                            <th className="px-6 py-4">Tipo</th>
                            <th className="px-6 py-4">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {filteredDespesas.map(d => (
                            <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                              <td className="px-6 py-4 font-medium">{d.nome_despesa}</td>
                              <td className="px-6 py-4">{formatCurrency(d.valor)}</td>
                              <td className="px-6 py-4">
                                <span className={cn(
                                  "text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full",
                                  d.tipo === "FIXA" ? "bg-indigo-100 text-indigo-700" : "bg-gray-100 text-gray-600"
                                )}>
                                  {d.tipo}
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                <StatusBadge status={d.status} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </main>
    </div>
  );
}

function SidebarItem({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 w-full px-4 py-3 rounded-xl transition-all font-medium text-sm",
        active 
          ? "bg-[#00704A]/10 text-[#00704A]" 
          : "text-gray-500 hover:bg-gray-50 hover:text-[#27251F]"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function KpiCard({ title, value, icon, color, subtitle }: { title: string, value: string, icon: React.ReactNode, color: string, subtitle?: string }) {
  const colorMap: Record<string, string> = {
    blue: "bg-blue-50 text-blue-600",
    emerald: "bg-emerald-50 text-emerald-600",
    rose: "bg-rose-50 text-rose-600",
    amber: "bg-amber-50 text-amber-600",
  };

  return (
    <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-4">
        <div className={cn("p-3 rounded-2xl", colorMap[color])}>
          {icon}
        </div>
      </div>
      <div>
        <p className="text-gray-500 text-sm font-medium">{title}</p>
        <h4 className="text-2xl font-bold mt-1">{value}</h4>
        {subtitle && <p className="text-[10px] text-gray-400 mt-1 uppercase tracking-wider font-semibold">{subtitle}</p>}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const isPaid = status.toUpperCase().includes("PAGO") || status.toUpperCase().includes("OK");
  const isPending = status.toUpperCase().includes("PENDENTE");

  return (
    <span className={cn(
      "text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full",
      isPaid ? "bg-green-100 text-green-700" : isPending ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600"
    )}>
      {status}
    </span>
  );
}

function SettingsModal({ isOpen, onClose, onSave, onSyncStart, onSyncEnd }: { 
  isOpen: boolean, 
  onClose: () => void, 
  onSave: () => void, 
  onSyncStart: () => void, 
  onSyncEnd: () => void 
}) {
  const [sheetUrl, setSheetUrl] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const fetchSettings = async () => {
        const res = await fetch("/api/settings");
        const data = await res.json();
        setSheetUrl(data.sheet_url);
      };
      fetchSettings();
    }
  }, [isOpen]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheet_url: sheetUrl }),
      });
      if (res.ok) {
        onSave(); // Close modal immediately
        onSyncStart(); // Show loading indicator on main screen
        // Trigger a sync after saving
        try {
          await fetch("/api/sync-google", { method: "POST" });
        } finally {
          onSyncEnd(); // Refetch data and hide loading indicator
        }
      }
    } catch (err) {
      console.error("Erro ao salvar configurações:", err);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            className="bg-white rounded-2xl p-8 w-full max-w-lg shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold">Gerenciar Planilha Google</h3>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Cole o link da sua planilha do Google Sheets abaixo. Certifique-se de que a planilha está compartilhada como "Qualquer pessoa com o link pode ver".
            </p>
            <div className="mb-6">
              <label htmlFor="sheet-url" className="text-xs font-bold text-gray-500 mb-2 block">URL da Planilha</label>
              <input 
                id="sheet-url"
                type="text" 
                value={sheetUrl}
                onChange={(e) => setSheetUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/..."
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#00704A] focus:border-transparent transition"
              />
            </div>
            <div className="flex justify-end gap-4">
              <button 
                onClick={onClose}
                className="px-6 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-semibold text-sm hover:bg-gray-200 transition"
              >
                Cancelar
              </button>
              <button 
                onClick={handleSave}
                disabled={isSaving}
                className="px-6 py-2.5 bg-[#00704A] text-white rounded-lg font-semibold text-sm hover:bg-[#006241] transition flex items-center gap-2 disabled:opacity-50"
              >
                {isSaving ? <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" /> : <Save size={16} />}
                Salvar e Sincronizar
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
