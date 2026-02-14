import { useState, useCallback, useEffect } from 'react';
import { Upload, Wand2, Download, Shield, Clock, Hash, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import {
  embedWatermark,
  loadImageAsDataUrl,
  downloadImage,
  saveLedgerEntry,
  WatermarkResult,
} from '@/lib/watermark';

interface WatermarkToolProps {
  initialImageUrl?: string | null;
}

export function WatermarkTool({ initialImageUrl }: WatermarkToolProps) {
  const { user } = useAuth();
  const [prompt, setPrompt] = useState('');
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [result, setResult] = useState<WatermarkResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [copied, setCopied] = useState(false);

  // Auto-populate creator ID from authenticated user's email
  const creatorId = user?.email ?? '';

  // Check for image URL in query params (from bookmarklet) or prop
  useEffect(() => {
    const url = initialImageUrl || new URLSearchParams(window.location.search).get('image');
    if (url) {
      handleImageUrl(url);
    }
  }, [initialImageUrl]);

  const handleImageUrl = async (url: string) => {
    try {
      const dataUrl = await loadImageAsDataUrl(url);
      setSourceImage(dataUrl);
      toast.success('Image loaded from URL');
    } catch {
      toast.error('Failed to load image from URL');
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
          };
          reader.readAsDataURL(file);
          break;
        }
      }
    }
  }, []);

  const handleWatermark = async () => {
    if (!sourceImage) {
      toast.error('Please upload an image first');
      return;
    }

    if (!creatorId.trim()) {
      toast.error('Please enter a Creator ID');
      return;
    }

    setIsProcessing(true);
    try {
      const timestamp = new Date().toISOString();
      const watermarkResult = await embedWatermark(sourceImage, {
        creatorId: creatorId.trim(),
        timestamp,
        prompt: prompt.trim() || undefined,
      });

      saveLedgerEntry(watermarkResult.ledgerEntry);
      setResult(watermarkResult);
      toast.success('Watermark embedded successfully!');
    } catch (error) {
      console.error('Watermark error:', error);
      toast.error('Failed to embed watermark');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = () => {
    if (!result) return;
    const filename = `watermarked_${Date.now()}.png`;
    downloadImage(result.watermarkedImageUrl, filename);
    toast.success('Image downloaded');
  };

  const copyHash = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.hash);
    setCopied(true);
    toast.success('Hash copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Creator ID Input */}
      <div className="glass-panel p-6">
        <label className="block text-sm font-medium text-foreground/80 mb-2">
          Creator ID
        </label>
        <Input
          value={creatorId}
          readOnly
          className="bg-input/50 border-border/50 opacity-70 cursor-not-allowed"
        />
        <p className="text-xs text-muted-foreground mt-2">
          Automatically set from your account email
        </p>
      </div>

      {/* Image Source Tabs */}
      <Tabs defaultValue="upload" className="w-full">
        <TabsList className="w-full grid grid-cols-2 bg-muted/30">
          <TabsTrigger value="upload" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Upload className="w-4 h-4 mr-2" />
            Upload Image
          </TabsTrigger>
          <TabsTrigger value="generate" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Wand2 className="w-4 h-4 mr-2" />
            Generate (Coming Soon)
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="mt-4">
          <div
            className="glass-panel p-8 border-2 border-dashed border-border/50 hover:border-primary/50 transition-colors cursor-pointer text-center"
            onPaste={handlePaste}
            tabIndex={0}
          >
            <input
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
              id="file-upload"
            />
            <label htmlFor="file-upload" className="cursor-pointer block">
              <Upload className="w-12 h-12 mx-auto mb-4 text-primary/60" />
              <p className="text-foreground/80 font-medium">
                Drop image here, click to upload, or paste from clipboard
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Supports PNG, JPG, WebP
              </p>
            </label>
          </div>
          
          {/* URL Input */}
          <div className="mt-4 flex gap-2">
            <Input
              id="image-url-input"
              placeholder="Or enter image URL..."
              className="bg-input/50 border-border/50 focus:border-primary"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const input = e.target as HTMLInputElement;
                  if (input.value.trim()) {
                    handleImageUrl(input.value.trim());
                    input.value = '';
                  }
                }
              }}
            />
            <Button
              variant="outline"
              onClick={() => {
                const input = document.getElementById('image-url-input') as HTMLInputElement;
                if (input?.value.trim()) {
                  handleImageUrl(input.value.trim());
                  input.value = '';
                }
              }}
            >
              Load
            </Button>
          </div>

          {/* Prompt field for metadata */}
          <div className="mt-4">
            <label className="block text-sm font-medium text-foreground/80 mb-2">
              AI Prompt (optional)
            </label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Enter the prompt used to generate this image..."
              className="bg-input/50 border-border/50 focus:border-primary min-h-[80px]"
            />
          </div>
        </TabsContent>

        <TabsContent value="generate" className="mt-4">
          <Card className="glass-panel p-8 text-center">
            <Wand2 className="w-12 h-12 mx-auto mb-4 text-secondary/60" />
            <p className="text-foreground/80 font-medium">
              AI Image Generation requires Cloud backend
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Connect Lovable Cloud to enable AI image generation with automatic watermarking
            </p>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Image Preview */}
      {sourceImage && (
        <div className="glass-panel p-4 border-primary/30 animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-foreground/80">Source Image</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSourceImage(null);
                setResult(null);
              }}
              className="text-destructive hover:text-destructive/80"
            >
              Remove
            </Button>
          </div>
          <div className="relative rounded-lg overflow-hidden bg-muted/20">
            <img
              src={sourceImage}
              alt="Source"
              className="max-w-full h-auto mx-auto max-h-[300px] object-contain"
            />
          </div>
        </div>
      )}

      {/* Watermark Button */}
      {sourceImage && !result && (
        <Button
          onClick={handleWatermark}
          disabled={isProcessing || !creatorId.trim()}
          className="w-full h-14 text-lg font-semibold bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          {isProcessing ? (
            <>
              <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-2" />
              Embedding Watermark...
            </>
          ) : (
            <>
              <Shield className="w-5 h-5 mr-2" />
              Embed Invisible Watermark
            </>
          )}
        </Button>
      )}

      {/* Result */}
      {result && (
        <div className="space-y-4 animate-slide-up">
          <div className="glass-panel p-4 border-primary/30">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-primary">Watermarked Image</h3>
              <Button onClick={handleDownload} size="sm" className="bg-primary hover:bg-primary/90">
                <Download className="w-4 h-4 mr-2" />
                Download
              </Button>
            </div>
            <div className="relative rounded-lg overflow-hidden bg-muted/20">
              <img
                src={result.watermarkedImageUrl}
                alt="Watermarked"
                className="max-w-full h-auto mx-auto max-h-[300px] object-contain"
              />
            </div>
          </div>

          {/* Audit Info */}
          <Card className="glass-panel p-4">
            <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center">
              <Shield className="w-4 h-4 mr-2 text-primary" />
              Audit Trail
            </h4>
            <div className="space-y-2 font-mono text-xs">
              <div className="flex items-start gap-2 text-muted-foreground">
                <Clock className="w-4 h-4 mt-0.5 text-primary" />
                <span>{result.ledgerEntry.timestamp}</span>
              </div>
              <div className="flex items-start gap-2 text-muted-foreground">
                <Hash className="w-4 h-4 mt-0.5 text-primary" />
                <span className="break-all">{result.hash.slice(0, 32)}...</span>
                <Button variant="ghost" size="sm" onClick={copyHash} className="h-5 px-2">
                  {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
