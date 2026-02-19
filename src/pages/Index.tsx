import { useState } from 'react';
import { Shield, Fingerprint, Lock, Search } from 'lucide-react';
import { WatermarkTool } from '@/components/WatermarkTool';
import { VerificationTool } from '@/components/VerificationTool';
import { BookmarkletSection } from '@/components/BookmarkletSection';
import { AuditLedger } from '@/components/AuditLedger';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const Index = () => {
  const params = new URLSearchParams(window.location.search);
  const imageUrl = params.get('image');
  const verifyUrl = params.get('verify');
  const initialTab = verifyUrl ? 'verify' : 'watermark';
  const [activeTab, setActiveTab] = useState(initialTab);
  const [verifyImageDataUrl, setVerifyImageDataUrl] = useState<string | null>(null);

  const handleVerifyWatermarked = (dataUrl: string) => {
    setVerifyImageDataUrl(dataUrl);
    setActiveTab('verify');
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Header */}
      <header className="border-b border-border bg-card">
        <div className="container max-w-5xl mx-auto px-4 py-8">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 rounded-xl bg-primary/10 border border-primary/20">
              <Shield className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">
                Image Guardian
              </h1>
              <p className="text-muted-foreground">
                Invisible DWT-based image watermarking & verification
              </p>
            </div>
          </div>

          {/* Feature badges */}
          <div className="flex flex-wrap gap-3 mt-6">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted border border-border text-sm">
              <Fingerprint className="w-4 h-4 text-primary" />
              <span className="text-foreground">Frequency Domain Embedding</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted border border-border text-sm">
              <Lock className="w-4 h-4 text-primary" />
              <span className="text-foreground">SHA-256 Audit Trail</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted border border-border text-sm">
              <Search className="w-4 h-4 text-primary" />
              <span className="text-foreground">Cloud Registry Verification</span>
            </div>
          </div>
          
          {/* Link to Chat */}
          <div className="mt-4">
            <a href="/" className="text-primary hover:underline text-sm">
              ← Back to Image Generator
            </a>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container max-w-5xl mx-auto px-4 py-8">
        <div className="grid gap-8 lg:grid-cols-[1fr,380px]">
          {/* Left Column - Main Tool */}
          <div className="space-y-6">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="w-full grid grid-cols-2">
                <TabsTrigger value="watermark" className="flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  Watermark
                </TabsTrigger>
                <TabsTrigger value="verify" className="flex items-center gap-2">
                  <Search className="w-4 h-4" />
                  Verify
                </TabsTrigger>
              </TabsList>

              <TabsContent value="watermark" className="mt-6 space-y-6">
                <BookmarkletSection />
                <WatermarkTool initialImageUrl={imageUrl} onVerify={handleVerifyWatermarked} />
              </TabsContent>

              <TabsContent value="verify" className="mt-6">
                <VerificationTool initialImageUrl={verifyUrl} initialImageDataUrl={verifyImageDataUrl} />
              </TabsContent>
            </Tabs>
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
              <h3 className="font-medium text-primary mb-2">3. Cloud Verification</h3>
              <p className="text-muted-foreground">
                SHA-256 hash stored in Cloud registry. Verify any image by extracting watermark and comparing hashes.
              </p>
            </div>
          </div>
        </section>

        {/* Verification Flow */}
        <section className="mt-8 glass-panel p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Verification Process</h2>
          <div className="grid md:grid-cols-6 gap-4 text-sm">
            <div className="text-center">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-2">
                <span className="font-bold text-primary">1</span>
              </div>
              <p className="text-muted-foreground">Upload Image</p>
            </div>
            <div className="text-center">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-2">
                <span className="font-bold text-primary">2</span>
              </div>
              <p className="text-muted-foreground">Extract DWT</p>
            </div>
            <div className="text-center">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-2">
                <span className="font-bold text-primary">3</span>
              </div>
              <p className="text-muted-foreground">Hash Image</p>
            </div>
            <div className="text-center">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-2">
                <span className="font-bold text-primary">4</span>
              </div>
              <p className="text-muted-foreground">Registry Lookup</p>
            </div>
            <div className="text-center">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-2">
                <span className="font-bold text-primary">5</span>
              </div>
              <p className="text-muted-foreground">Compare</p>
            </div>
            <div className="text-center">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-2">
                <span className="font-bold text-primary">6</span>
              </div>
              <p className="text-muted-foreground">Result</p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-12">
        <div className="container max-w-5xl mx-auto px-4 py-6 text-center text-sm text-muted-foreground">
          Watermarks are invisible to the human eye but can be extracted with the same DWT process.
        </div>
      </footer>
    </div>
  );
};

export default Index;
