import { Shield, Fingerprint, Lock } from 'lucide-react';
import { WatermarkTool } from '@/components/WatermarkTool';
import { BookmarkletSection } from '@/components/BookmarkletSection';
import { AuditLedger } from '@/components/AuditLedger';

const Index = () => {
  return (
    <div className="min-h-screen bg-background grid-pattern scanline">
      {/* Hero Header */}
      <header className="relative border-b border-border/30">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent" />
        <div className="container max-w-4xl mx-auto px-4 py-8 relative">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 rounded-xl bg-primary/10 border border-primary/30 animate-glow-pulse">
              <Shield className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground neon-text animate-flicker">
                Stealth Watermark
              </h1>
              <p className="text-muted-foreground">
                Invisible DWT-based image watermarking
              </p>
            </div>
          </div>

          {/* Feature badges */}
          <div className="flex flex-wrap gap-3 mt-6">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/30 border border-border/50 text-sm">
              <Fingerprint className="w-4 h-4 text-primary" />
              <span className="text-foreground/80">Frequency Domain Embedding</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/30 border border-border/50 text-sm">
              <Lock className="w-4 h-4 text-secondary" />
              <span className="text-foreground/80">SHA-256 Audit Trail</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container max-w-4xl mx-auto px-4 py-8">
        <div className="grid gap-8 lg:grid-cols-[1fr,380px]">
          {/* Left Column - Main Tool */}
          <div className="space-y-6">
            <BookmarkletSection />
            <WatermarkTool />
          </div>

          {/* Right Column - Audit Ledger */}
          <div className="lg:sticky lg:top-8 lg:self-start">
            <AuditLedger />
          </div>
        </div>

        {/* Technical Info */}
        <section className="mt-12 glass-panel p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">How It Works</h2>
          <div className="grid md:grid-cols-3 gap-6 text-sm">
            <div>
              <h3 className="font-medium text-primary mb-2">1. DWT Transform</h3>
              <p className="text-muted-foreground">
                Image is converted to YCbCr color space. Haar wavelet transform separates frequency components.
              </p>
            </div>
            <div>
              <h3 className="font-medium text-primary mb-2">2. Steganographic Embedding</h3>
              <p className="text-muted-foreground">
                Binary watermark is embedded into LH (horizontal detail) coefficients with α=0.02 for invisibility.
              </p>
            </div>
            <div>
              <h3 className="font-medium text-primary mb-2">3. Audit Trail</h3>
              <p className="text-muted-foreground">
                SHA-256 hash of the final image is computed and stored with creator ID and timestamp.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/30 mt-12">
        <div className="container max-w-4xl mx-auto px-4 py-6 text-center text-sm text-muted-foreground">
          Watermarks are invisible to the human eye but can be extracted with the same DWT process.
        </div>
      </footer>
    </div>
  );
};

export default Index;
