import { useState, useCallback, useEffect } from 'react';
import { Upload, Search, Shield, CheckCircle, XCircle, Hash, User, Clock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { loadImageAsDataUrl, extractWatermark, verifyImage, VerificationResult } from '@/lib/watermark';

type VerificationStep = 'idle' | 'uploading' | 'extracting' | 'hashing' | 'looking_up' | 'comparing' | 'complete';

const stepLabels: Record<VerificationStep, string> = {
  idle: 'Upload an image to verify',
  uploading: '1️⃣ Loading image...',
  extracting: '2️⃣ Extracting watermark (DWT)...',
  hashing: '3️⃣ Computing SHA-256 hash...',
  looking_up: '4️⃣ Querying registry...',
  comparing: '5️⃣ Comparing data...',
  complete: '6️⃣ Verification complete',
};

interface VerificationToolProps {
  initialImageUrl?: string | null;
  initialImageDataUrl?: string | null;
}

export function VerificationTool({ initialImageUrl, initialImageDataUrl }: VerificationToolProps) {
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<VerificationStep>('idle');
  const [result, setResult] = useState<VerificationResult | null>(null);

  useEffect(() => {
    const url = initialImageUrl || new URLSearchParams(window.location.search).get('verify');
    if (url) {
      handleImageUrl(url);
    }
  }, [initialImageUrl]);

  useEffect(() => {
    if (initialImageDataUrl) {
      setSourceImage(initialImageDataUrl);
      setResult(null);
      setCurrentStep('idle');
    }
  }, [initialImageDataUrl]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setSourceImage(reader.result as string);
      setResult(null);
      setCurrentStep('idle');
    };
    reader.readAsDataURL(file);
  }, []);

  const handleImageUrl = async (url: string) => {
    try {
      setCurrentStep('uploading');
      const dataUrl = await loadImageAsDataUrl(url);
      setSourceImage(dataUrl);
      setResult(null);
      setCurrentStep('idle');
      toast.success('Image loaded');
    } catch {
      toast.error('Failed to load image from URL');
      setCurrentStep('idle');
    }
  };

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = () => {
            setSourceImage(reader.result as string);
            setResult(null);
            setCurrentStep('idle');
          };
          reader.readAsDataURL(file);
          break;
        }
      }
    }
  }, []);

  const runVerification = async () => {
    if (!sourceImage) {
      toast.error('Please upload an image first');
      return;
    }
    try {
      setCurrentStep('uploading');
      await new Promise(r => setTimeout(r, 300));
      setCurrentStep('extracting');
      const extracted = await extractWatermark(sourceImage);
      await new Promise(r => setTimeout(r, 400));
      setCurrentStep('hashing');
      await new Promise(r => setTimeout(r, 300));
      setCurrentStep('looking_up');
      await new Promise(r => setTimeout(r, 300));
      setCurrentStep('comparing');
      const verificationResult = await verifyImage(sourceImage, extracted);
      await new Promise(r => setTimeout(r, 300));
      setCurrentStep('complete');
      setResult(verificationResult);

      if (verificationResult.status === 'genuine') {
        toast.success('Image is genuine!');
      } else {
        toast.error('Image may be tampered');
      }
    } catch (error) {
      console.error('Verification error:', error);
      toast.error('Verification failed');
      setCurrentStep('idle');
    }
  };

  const isProcessing = currentStep !== 'idle' && currentStep !== 'complete';

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Upload Section */}
      <div className="glass-panel p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <Search className="w-5 h-5 text-primary" />
          Verify Image Authenticity
        </h3>

        <div
          className="p-8 border-2 border-dashed border-border rounded-lg hover:border-primary/50 transition-colors cursor-pointer text-center bg-muted/30"
          onPaste={handlePaste}
          tabIndex={0}
        >
          <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" id="verify-file-upload" />
          <label htmlFor="verify-file-upload" className="cursor-pointer block">
            <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-foreground font-medium">Drop image here, click to upload, or paste</p>
            <p className="text-sm text-muted-foreground mt-2">Upload the image you want to verify</p>
          </label>
        </div>

        {/* URL Input */}
        <div className="mt-4 flex gap-2">
          <Input
            id="verify-url-input"
            placeholder="Or enter image URL..."
            className="bg-background"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const input = e.target as HTMLInputElement;
                if (input.value.trim()) { handleImageUrl(input.value.trim()); input.value = ''; }
              }
            }}
          />
          <Button variant="outline" onClick={() => {
            const input = document.getElementById('verify-url-input') as HTMLInputElement;
            if (input?.value.trim()) { handleImageUrl(input.value.trim()); input.value = ''; }
          }}>Load</Button>
        </div>
      </div>

      {/* Image Preview */}
      {sourceImage && (
        <div className="glass-panel p-4 animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-foreground">Image to Verify</h3>
            <Button variant="ghost" size="sm" onClick={() => { setSourceImage(null); setResult(null); setCurrentStep('idle'); }} className="text-destructive hover:text-destructive/80">Remove</Button>
          </div>
          <div className="relative rounded-lg overflow-hidden bg-muted/20">
            <img src={sourceImage} alt="Image to verify" className="max-w-full h-auto mx-auto max-h-[250px] object-contain" />
          </div>
        </div>
      )}

      {/* Verification Progress */}
      {isProcessing && (
        <Card className="p-6 bg-muted/30 border-primary/30 animate-fade-in">
          <div className="flex items-center gap-3">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
            <div>
              <p className="font-medium text-foreground">{stepLabels[currentStep]}</p>
              <p className="text-sm text-muted-foreground">Processing image verification...</p>
            </div>
          </div>
        </Card>
      )}

      {/* Verify Button */}
      {sourceImage && !isProcessing && currentStep !== 'complete' && (
        <Button onClick={runVerification} className="w-full h-14 text-lg font-semibold">
          <Shield className="w-5 h-5 mr-2" />
          Verify Image
        </Button>
      )}

      {/* Result */}
      {result && currentStep === 'complete' && (
        <div className="space-y-4 animate-slide-up">
          <Card className={`p-6 border-2 ${
            result.status === 'genuine' ? 'border-[hsl(142,76%,36%)] bg-[hsl(142,76%,36%,0.1)]' : 'border-destructive bg-destructive/10'
          }`}>
            <div className="flex flex-col items-center text-center">
              {result.status === 'genuine' ? <CheckCircle className="w-16 h-16 text-[hsl(142,76%,36%)]" /> : <XCircle className="w-16 h-16 text-destructive" />}
              <h3 className="text-xl font-bold mt-4 text-foreground">
                {result.status === 'genuine' ? '✅ Genuine Image' : '❌ Tampered Image'}
              </h3>
              <p className="text-muted-foreground mt-2 max-w-md">
                {result.status === 'genuine'
                  ? `Verified via ${result.confidence === 'exact_hash' ? 'exact hash match' : 'DWT metadata extraction'}. This image is authentic and tracked in the registry.`
                  : 'No matching record found in the registry. This image may be tampered or was never registered.'}
              </p>
            </div>
          </Card>

          {result.registryEntry && (
            <Card className="p-4 glass-panel">
              <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" />
                Registry Information
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <User className="w-4 h-4 text-primary" />
                  <span className="font-medium">Creator:</span>
                  <span>{result.registryEntry.creator_id}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="w-4 h-4 text-primary" />
                  <span className="font-medium">Timestamp:</span>
                  <span>{new Date(result.registryEntry.timestamp).toLocaleString()}</span>
                </div>
                <div className="flex items-start gap-2 text-muted-foreground">
                  <Hash className="w-4 h-4 text-primary mt-0.5" />
                  <span className="font-medium">Hash:</span>
                  <span className="font-mono text-xs break-all">{result.currentHash.slice(0, 32)}...</span>
                </div>
              </div>
            </Card>
          )}

          <Button variant="outline" onClick={() => { setSourceImage(null); setResult(null); setCurrentStep('idle'); }} className="w-full">
            Verify Another Image
          </Button>
        </div>
      )}
    </div>
  );
}
