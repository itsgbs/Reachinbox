'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: ReactNode;
  color: 'blue' | 'green' | 'red' | 'purple';
}

const colorMap = {
  blue: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  green: 'text-green-400 bg-green-400/10 border-green-400/20',
  red: 'text-red-400 bg-red-400/10 border-red-400/20',
  purple: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
};

export default function StatCard({ label, value, icon, color }: StatCardProps) {
  return (
    <div className="card p-5 flex items-center gap-4">
      <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center border', colorMap[color])}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-white">{Number(value).toLocaleString()}</p>
        <p className="text-xs text-gray-400 mt-0.5">{label}</p>
      </div>
    </div>
  );
}
