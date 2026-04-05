"use client";

import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";

interface StatsCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  color?: string;
}

export default function StatsCard({ label, value, icon: Icon, trend, color = "bg-blue-500" }: StatsCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02 }}
      className="glass p-6 rounded-3xl relative overflow-hidden"
    >
      <div className={`absolute top-0 right-0 w-24 h-24 ${color} opacity-10 rounded-full -translate-y-8 translate-x-8 blur-2xl`} />
      
      <div className="flex items-center justify-between mb-4">
        <div className={`p-3 rounded-2xl ${color} bg-opacity-20`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
        {trend && (
          <span className="text-xs font-semibold px-2 py-1 rounded-lg bg-green-500/10 text-green-400 border border-green-500/20">
            {trend}
          </span>
        )}
      </div>

      <h3 className="text-slate-400 text-sm font-medium mb-1">{label}</h3>
      <p className="text-3xl font-bold text-white tracking-tight">{value}</p>
    </motion.div>
  );
}
