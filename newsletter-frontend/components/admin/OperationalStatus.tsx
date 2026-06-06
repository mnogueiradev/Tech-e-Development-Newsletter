import { Server, Database, Mail, Globe, ShieldCheck } from "lucide-react";

interface StatusProps {
  server: boolean;
  brave_api: boolean;
  resend: boolean;
  db: boolean;
  auth: boolean;
}

export function OperationalStatus({ status }: { status: StatusProps }) {
  const items = [
    { name: "Servidor (Node.js)", ok: status.server, icon: Server },
    { name: "Banco TiDB", ok: status.db, icon: Database },
    { name: "API Brave News", ok: status.brave_api, icon: Globe },
    { name: "Resend (Email)", ok: status.resend, icon: Mail },
    { name: "Autenticação", ok: status.auth, icon: ShieldCheck },
  ];

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
      <h3 className="text-lg font-bold text-white mb-4">Status Operacional</h3>
      <div className="space-y-3">
        {items.map((item, i) => (
          <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-black/20 border border-white/5">
            <div className="flex items-center gap-3">
              <item.icon size={18} className="text-gray-400" />
              <span className="text-sm font-medium text-gray-300">{item.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-400">
                {item.ok ? "Operacional" : "Falha"}
              </span>
              <span className={`relative flex h-3 w-3`}>
                {item.ok && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>}
                <span className={`relative inline-flex rounded-full h-3 w-3 ${item.ok ? 'bg-green-500' : 'bg-red-500'}`}></span>
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
