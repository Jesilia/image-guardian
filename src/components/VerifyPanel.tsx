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

interface VerifyPanelProps {
  initialImageUrl?: string | null;
}

export function VerifyPanel({ initialImageUrl }: VerifyPanelProps) {
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<VerificationStep>('idle');
  const [result, setResult] = useState<VerificationResult | null>(null);

  useEffect(() => {
    if (initialImageUrl) {
      loadImageFromUrl(initialImageUrl);
    }
  }, [initialImageUrl]);

  const loadImageFromUrl = async (url: string) => {
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

      if (verificationResult.status === 'genuine') toast.success('Image is genuine!');
      else toast.error('Image may be tampered');
    } catch (error) {
      console.error('Verification error:', error);
      toast.error('Verification failed');
      setCurrentStep('idle');
    }
  };

  const isProcessing = currentStep !== 'idle' && currentStep !== 'complete';

  return (
    <div className="space-y-4">
      {/* Upload */}
      <div
        className="p-6 border-2 border-dashed border-border rounded-lg hover:border-primary/50 transition-colors cursor-pointer text-center bg-muted/30"
        onPaste={handlePaste}
        tabIndex={0}
      >
        <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" id="verify-panel-upload" />
        <label htmlFor="verify-panel-upload" className="cursor-pointer block">
          <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
          <p className="text-foreground font-medium text-sm">Drop, click, or paste an image</p>
        </label>
      </div>

      {/* URL */}
      <div className="flex gap-2">
        <Input
          id="verify-panel-url"
          placeholder="Or paste image URL..."
          className="bg-background text-sm"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const input = e.target as HTMLInputElement;
              if (input.value.trim()) { loadImageFromUrl(input.value.trim()); input.value = ''; }
            }
          }}
        />
        <Button variant="outline" size="sm" onClick={() => {
          const input = document.getElementById('verify-panel-url') as HTMLInputElement;
          if (input?.value.trim()) { loadImageFromUrl(input.value.trim()); input.value = ''; }
        }}>Load</Button>
      </div>

      {/* Preview */}
      {sourceImage && (
        <div className="rounded-lg overflow-hidden bg-muted/20 border border-border">
          <img src={sourceImage} alt="To verify" className="max-w-full h-auto mx-auto max-h-[200px] object-contain" />
        </div>
      )}

      {/* Progress */}
      {isProcessing && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-primary/30">
          <Loader2 className="w-5 h-5 text-primary animate-spin" />
          <p className="text-sm font-medium text-foreground">{stepLabels[currentStep]}</p>
        </div>
      )}

      {/* Verify Button */}
      {sourceImage && !isProcessing && currentStep !== 'complete' && (
        <Button onClick={runVerification} className="w-full">
          <Shield className="w-4 h-4 mr-2" />
          Verify Image
        </Button>
      )}

      {/* Result */}
      {result && currentStep === 'complete' && (
        <div className="space-y-3">
          <Card className={`p-4 border-2 ${
            result.status === 'genuine' ? 'border-[hsl(142,76%,36%)] bg-[hsl(142,76%,36%,0.1)]' :
            'border-destructive bg-destructive/10'
          }`}>
            <div className="flex items-center gap-3">
              {result.status === 'genuine' && <CheckCircle className="w-8 h-8 text-[hsl(142,76%,36%)]" />}
              {result.status === 'tampered' && <XCircle className="w-8 h-8 text-destructive" />}
              <div>
                <p className="font-bold text-foreground">
                  {result.status === 'genuine' ? '✅ Genuine' : '❌ Tampered'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {result.status === 'genuine'
                    ? `Verified via ${result.confidence === 'exact_hash' ? 'exact hash match' : 'DWT metadata'}. This image is authentic.`
                    : 'No matching record found. This image may be tampered or unregistered.'}
                </p>
              </div>
            </div>
          </Card>

          {result.registryEntry && (
            <div className="text-xs space-y-1 p-3 bg-muted/20 rounded-lg">
              <div className="flex items-center gap-2 text-muted-foreground">
                <User className="w-3 h-3 text-primary" />
                <span className="font-medium">Creator:</span>
                <span>{result.registryEntry.creator_id}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="w-3 h-3 text-primary" />
                <span className="font-medium">Timestamp:</span>
                <span>{new Date(result.registryEntry.timestamp).toLocaleString()}</span>
              </div>
              <div className="flex items-start gap-2 text-muted-foreground">
                <Hash className="w-3 h-3 text-primary mt-0.5" />
                <span className="font-medium">Hash:</span>
                <span className="font-mono break-all">{result.currentHash.slice(0, 24)}...</span>
              </div>
            </div>
          )}

          <Button variant="outline" size="sm" onClick={() => {
            setSourceImage(null);
            setResult(null);
            setCurrentStep('idle');
          }} className="w-full">
            Verify Another Image
          </Button>
        </div>
      )}
    </div>
  );
}
