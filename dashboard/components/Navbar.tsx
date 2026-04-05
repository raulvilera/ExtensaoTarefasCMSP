"use client";

import { LayoutDashboard, Users, History, Settings } from "lucide-react";
import Link from "next/link";

export default function Navbar() {
  return (
    <nav className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[95%] max-w-5xl">
      <div className="glass rounded-2xl px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-accent rounded-lg flex items-center justify-center animate-pulse">
            <LayoutDashboard className="text-white w-5 h-5" />
          </div>
          <span className="font-bold text-xl tracking-tight hidden sm:block">
            CMSP <span className="text-accent">Insight</span>
          </span>
        </div>

        <div className="flex items-center gap-6 text-sm font-medium text-slate-400">
          <Link href="/" className="hover:text-white transition-colors flex items-center gap-2">
            <LayoutDashboard size={18} />
            <span className="hidden md:block">Geral</span>
          </Link>
          <Link href="/alunos" className="hover:text-white transition-colors flex items-center gap-2">
            <Users size={18} />
            <span className="hidden md:block">Alunos</span>
          </Link>
          <Link href="/historico" className="hover:text-white transition-colors flex items-center gap-2">
            <History size={18} />
            <span className="hidden md:block">Histórico</span>
          </Link>
        </div>

        <button className="p-2 hover:bg-white/10 rounded-xl transition-colors">
          <Settings className="w-5 h-5" />
        </button>
      </div>
    </nav>
  );
}
