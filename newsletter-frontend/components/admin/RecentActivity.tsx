import { Clock } from "lucide-react";

interface Activity {
  id: string;
  type: string;
  message: string;
  time: string;
}

export function RecentActivity({ activities }: { activities: Activity[] }) {
  if (!activities || activities.length === 0) {
    return (
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
        <h3 className="text-lg font-bold text-white mb-4">Atividade Recente</h3>
        <p className="text-gray-500 text-sm">Nenhuma atividade recente.</p>
      </div>
    );
  }

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
      <h3 className="text-lg font-bold text-white mb-4">Atividade Recente</h3>
      <div className="space-y-6 relative before:absolute before:inset-0 before:ml-2 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-white/10 before:to-transparent">
        {activities.map((activity, index) => (
          <div key={activity.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
            <div className="flex items-center justify-center w-5 h-5 rounded-full border border-white/20 bg-gray-900 text-gray-500 shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow">
              <span className="w-1.5 h-1.5 bg-blue-400 rounded-full"></span>
            </div>
            <div className="w-[calc(100%-2rem)] md:w-[calc(50%-1.5rem)] bg-white/5 p-3 rounded-lg border border-white/5 shadow">
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-white text-sm">
                  {activity.type === 'new_subscriber' ? 'Novo Inscrito' : 'Nova Notícia'}
                </span>
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  <Clock size={12} />
                  {new Date(activity.time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p className="text-gray-400 text-xs">{activity.message}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
