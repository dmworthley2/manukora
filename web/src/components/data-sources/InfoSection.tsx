export function InfoSection() {
  return (
    <section className="mt-24 grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
      {/* Left: Info */}
      <div className="order-2 md:order-1">
        <h3 className="text-3xl font-bold mb-4">Precision Data Ingestion</h3>
        <p className="text-muted-foreground text-base leading-relaxed mb-6">
          Our S&OP engine processes data with clinical precision, ensuring every
          dataset is tracked from ingestion to analysis. We preserve the narrative
          of your data.
        </p>
        <div className="flex gap-8">
          <div>
            <p className="text-2xl font-bold text-primary">99.8%</p>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Data Accuracy
            </p>
          </div>
          <div>
            <p className="text-2xl font-bold text-primary">&lt; 2s</p>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Processing Latency
            </p>
          </div>
        </div>
      </div>

      {/* Right: Image placeholder */}
      <div className="order-1 md:order-2">
        <div className="rounded-lg overflow-hidden h-[300px] bg-muted flex items-center justify-center">
          <p className="text-muted-foreground">Data visualization</p>
        </div>
      </div>
    </section>
  );
}
