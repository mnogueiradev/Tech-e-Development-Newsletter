export default function Footer() {
  const currentYear = new Date().getFullYear();
  
  return (
    <footer className="border-t border-brand-border bg-brand-dark">
      <div className="max-w-7xl mx-auto py-10 px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center">
            <span className="text-lg font-heading font-bold text-white tracking-tight">
              Tech & Dev<span className="text-brand-accent">.</span>
            </span>
          </div>
          <p className="text-sm text-brand-muted">
            &copy; {currentYear} Tech & Development Newsletter.
          </p>
        </div>
      </div>
    </footer>
  );
}
