"use client";

import Navbar from "@/components/Navbar";
import StatsCard from "@/components/StatsCard";
import { Users, BookOpen, CheckCircle, AlertCircle, Search, Filter } from "lucide-react";
import { motion } from "framer-motion";

export default function Home() {
  return (
    <main className="min-h-screen pt-32 pb-12 px-6 lg:px-12">
      <Navbar />
      
      <div className="max-w-7xl mx-auto space-y-12">
        {/* Hero Section */}
        <div className="space-y-4">
          <motion.h1 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-4xl md:text-6xl font-black bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent"
          >
            Visão Geral das <br /> <span className="text-accent italic">Atividades CMSP</span>
          </motion.h1>
          <p className="text-slate-400 max-w-xl text-lg">
            Acompanhe o desempenho das suas turmas em tempo real com relatórios detalhados e insights inteligentes.
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatsCard 
            label="Total de Alunos" 
            value="156" 
            icon={Users} 
            color="bg-blue-600" 
            trend="+12%" 
          />
          <StatsCard 
            label="Tarefa Ativas" 
            value="08" 
            icon={BookOpen} 
            color="bg-purple-600" 
          />
          <StatsCard 
            label="Média de Entrega" 
            value="78%" 
            icon={CheckCircle} 
            color="bg-emerald-600" 
            trend="+3.4%" 
          />
          <StatsCard 
            label="Pendências Críticas" 
            value="14" 
            icon={AlertCircle} 
            color="bg-rose-600" 
          />
        </div>

        {/* Main Content Area */}
        <div className="glass rounded-[2.5rem] overflow-hidden">
          <div className="p-8 border-b border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <h2 className="text-2xl font-bold">Relatório Estendido</h2>
              <p className="text-slate-500 text-sm">Listagem detalhada de todos os alunos e notas.</p>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="relative group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-accent transition-colors" />
                <input 
                  type="text" 
                  placeholder="Buscar aluno..." 
                  className="bg-white/5 border border-white/10 rounded-2xl py-3 pl-12 pr-6 outline-none focus:border-accent/50 focus:bg-white/10 transition-all w-full md:w-64"
                />
              </div>
              <button className="p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all">
                <Filter className="w-5 h-5 text-slate-400" />
              </button>
            </div>
          </div>

          <div className="p-8 min-h-[400px] flex items-center justify-center text-slate-500">
            <div className="text-center space-y-4">
              <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto animate-float">
                <Search className="w-8 h-8 opacity-20" />
              </div>
              <p>Nenhum dado carregado ainda. <br /> <span className="text-accent cursor-pointer hover:underline">Sincronize com o Google Sheets</span> para ver as notas.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Decorative Blur Elements */}
      <div className="fixed top-0 right-0 -z-10 w-[500px] h-[500px] bg-blue-600/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="fixed bottom-0 left-0 -z-10 w-[500px] h-[500px] bg-purple-600/10 blur-[120px] rounded-full pointer-events-none" />
    </main>
  );
}
