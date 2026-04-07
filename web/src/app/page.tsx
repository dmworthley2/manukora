import Link from "next/link";

export default function Home() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">Welcome to Manukora</h1>
        <p className="text-lg text-muted-foreground mb-8">
          Start by uploading your data
        </p>
        <Link href="/data-sources" className="inline-block">
          <button className="px-8 py-3 bg-primary text-primary-foreground rounded-md font-semibold hover:bg-primary/90">
            Go to Data Sources
          </button>
        </Link>
      </div>
    </div>
  );
}
