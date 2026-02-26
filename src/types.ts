export interface Receita {
  id: number;
  mes: string;
  cliente: string;
  valor: number;
  status: string;
}

export interface Despesa {
  id: number;
  mes: string;
  nome_despesa: string;
  valor: number;
  status: string;
  tipo: "FIXA" | "VARIÁVEL";
}

export interface ResumoMensal {
  mes: string;
  entradas: number;
  saidas: number;
  saldo: number;
}

export interface ResumoAnual {
  id: number;
  total_entradas: number;
  total_saidas: number;
  saldo_atual: number;
}

export interface DashboardData {
  resumoAnual: ResumoAnual | null;
  mensal: ResumoMensal[];
  receitas: Receita[];
  despesas: Despesa[];
}
