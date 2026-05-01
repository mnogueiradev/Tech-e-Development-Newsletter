import SubscribeForm from "@/components/SubscribeForm";

// Dados dos benefícios exibidos na seção abaixo do hero
const benefits = [
  {
    icon: "📰",
    title: "Notícias diárias de tecnologia",
    description:
      "Receba as principais notícias de tecnologia e desenvolvimento direto no seu email, todos os dias.",
  },
  {
    icon: "⚡",
    title: "Curadoria rápida e objetiva",
    description:
      "9 notícias selecionadas de fontes confiáveis, sem enrolação. Leitura rápida e direto ao ponto.",
  },
  {
    icon: "🛡️",
    title: "Grátis e sem spam",
    description:
      "Newsletter 100% gratuita. Sem spam, sem anúncios invasivos. Apenas conteúdo de qualidade.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col">
      {/* Hero Section */}
      <section className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950">
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight leading-tight mb-6">
          <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
            Tech & Development
          </span>
          <br />
          Newsletter
        </h1>

        <p className="text-lg sm:text-xl text-gray-400 max-w-2xl mb-10">
          Fique por dentro das últimas novidades de tecnologia e desenvolvimento.
          Curadoria diária das 9 notícias mais relevantes, direto no seu email.
        </p>

        <SubscribeForm />
      </section>

      {/* Benefits Section */}
      <section className="bg-gray-900 py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-12">
            Por que se inscrever?
          </h2>

          <div className="grid gap-8 sm:grid-cols-3">
            {benefits.map((b) => (
              <div
                key={b.title}
                className="rounded-xl border border-gray-800 bg-gray-850 p-6 text-center hover:border-indigo-500/50 transition-colors"
              >
                <span className="text-4xl mb-4 block">{b.icon}</span>
                <h3 className="text-lg font-semibold mb-2">{b.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">
                  {b.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-950 py-8 px-6 text-center text-sm text-gray-600 border-t border-gray-800">
        <p>
          © {new Date().getFullYear()} Tech & Development Newsletter. Todos os
          direitos reservados.
        </p>
      </footer>
    </main>
  );
}
