import { LucideIcon } from "lucide-react";

interface CardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  status?: "success" | "error" | "warning" | "neutral";
}

export function StatCard({ title, value, subtitle, icon: Icon, status = "neutral" }: CardProps) {
  const statusColors = {
    success: "text-green-400 bg-green-400/10",
    error: "text-red-400 bg-red-400/10",
    warning: "text-yellow-400 bg-yellow-400/10",
    neutral: "text-blue-400 bg-blue-400/10",
  };

  return (
    <div className="bg-white/5 border border-white/10 p-5 rounded-2xl hover:bg-white/10 transition-colors">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-gray-400 text-sm font-medium">{title}</h3>
        <div className={`p-2 rounded-lg ${statusColors[status]}`}>
          <Icon size={18} />
        </div>
      </div>
      <div>
        <h2 className="text-2xl font-bold text-white">{value}</h2>
        {subtitle && <p className="text-gray-500 text-xs mt-1">{subtitle}</p>}
      </div>
    </div>
  );
}
