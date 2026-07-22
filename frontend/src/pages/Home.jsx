import Hero from '../components/Hero';
import TodayEdition from '../components/TodayEdition';
import Footer from '../components/Footer';

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col bg-brand-dark">
      <div className="flex-1 relative z-10">
        <Hero />
        <TodayEdition />
      </div>
      <Footer />
    </main>
  );
}
