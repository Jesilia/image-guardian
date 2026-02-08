import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, Shield, ShieldCheck, Loader2, ImageIcon, Download, Check, Copy, Search, Bookmark, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { embedWatermark, downloadImage } from '@/lib/watermark';
import { VerifyPanel } from '@/components/VerifyPanel';
import { BookmarkletSection } from '@/components/BookmarkletSection';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  imageUrl?: string;
  isWatermarked?: boolean;
  watermarkHash?: string;
  timestamp: string;
}

export default function ImageChat() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [autoWatermark, setAutoWatermark] = useState(true);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [verifyImageUrl, setVerifyImageUrl] = useState<string | null>(null);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Redirect to auth if not logged in
  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth', { replace: true });
    }
  }, [user, loading, navigate]);

  // Handle query params for bookmarklet integration
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const verifyUrl = params.get('verify');
    if (verifyUrl) {
      setVerifyImageUrl(verifyUrl);
      setVerifyOpen(true);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || !user) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('generate-image', {
        body: { prompt: userMessage.content },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      let finalImageUrl = data.imageUrl;
      let isWatermarked = false;
      let watermarkHash: string | undefined;

      if (autoWatermark && finalImageUrl) {
        try {
          const timestamp = new Date().toISOString();
          const result = await embedWatermark(finalImageUrl, {
            creatorId: user.email || user.id,
            timestamp,
            prompt: userMessage.content,
          });

          finalImageUrl = result.watermarkedImageUrl;
          isWatermarked = true;
          watermarkHash = result.hash;

          await supabase.from('watermark_registry').insert({
            creator_id: user.email || user.id,
            timestamp,
            prompt: userMessage.content,
            image_hash: result.hash,
          });

          toast.success('Image generated and watermarked!');
        } catch (wmError) {
          console.error('Watermark error:', wmError);
          toast.warning('Image generated but watermarking failed');
        }
      } else {
        toast.success('Image generated!');
      }

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.description || 'Here is your generated image:',
        imageUrl: finalImageUrl,
        isWatermarked,
        watermarkHash,
        timestamp: new Date().toISOString(),
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Generation error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to generate image';
      
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Sorry, I couldn't generate that image. ${errorMessage}`,
        timestamp: new Date().toISOString(),
      };
      
      setMessages(prev => [...prev, assistantMessage]);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = (imageUrl: string) => {
    downloadImage(imageUrl, `generated_${Date.now()}.png`);
    toast.success('Image downloaded');
  };

  const copyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    toast.success('Hash copied');
    setTimeout(() => setCopiedHash(null), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <ImageIcon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="font-semibold text-foreground">Image Guardian AI</h1>
              <p className="text-xs text-muted-foreground">Generate, protect & verify images</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <Sheet open={verifyOpen} onOpenChange={setVerifyOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm">
                  <Search className="w-4 h-4 mr-1" />
                  Verify
                </Button>
              </SheetTrigger>
              <SheetContent className="w-[400px] sm:w-[450px]">
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-2">
                    <Search className="w-5 h-5 text-primary" />
                    Verify Image
                  </SheetTitle>
                </SheetHeader>
                <div className="mt-4">
                  <VerifyPanel initialImageUrl={verifyImageUrl} />
                </div>
              </SheetContent>
            </Sheet>

            <Link to="/tools">
              <Button variant="ghost" size="sm">
                <Bookmark className="w-4 h-4 mr-1" />
                Tools
              </Button>
            </Link>

            <div className="flex items-center gap-2">
              <Switch id="auto-watermark" checked={autoWatermark} onCheckedChange={setAutoWatermark} />
              <Label htmlFor="auto-watermark" className="text-sm flex items-center gap-1">
                <Shield className="w-4 h-4" />
                Auto-watermark
              </Label>
            </div>

            <Button variant="ghost" size="sm" onClick={signOut} title="Sign out">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-12">
              <ImageIcon className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
              <h2 className="text-lg font-medium text-foreground mb-2">Start creating</h2>
              <p className="text-muted-foreground text-sm max-w-md mx-auto">
                Describe the image you want to generate. With auto-watermark enabled, 
                your images will be protected and verifiable.
              </p>
              <div className="mt-6">
                <BookmarkletSection />
              </div>
            </div>
          )}

          {messages.map((message) => (
            <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
              }`}>
                <p className="text-sm">{message.content}</p>
                
                {message.imageUrl && (
                  <div className="mt-3 space-y-2">
                    <div className="relative rounded-lg overflow-hidden bg-background/50">
                      <img src={message.imageUrl} alt="Generated" className="max-w-full h-auto max-h-[400px] object-contain" />
                      {message.isWatermarked && (
                        <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-full bg-primary text-primary-foreground text-xs">
                          <ShieldCheck className="w-3 h-3" />
                          Protected
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Button variant="secondary" size="sm" onClick={() => handleDownload(message.imageUrl!)}>
                        <Download className="w-4 h-4 mr-1" />
                        Download
                      </Button>
                      
                      {message.watermarkHash && (
                        <Button variant="ghost" size="sm" onClick={() => copyHash(message.watermarkHash!)} className="font-mono text-xs">
                          {copiedHash === message.watermarkHash ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}
                          {message.watermarkHash.slice(0, 12)}...
                        </Button>
                      )}
                    </div>
                  </div>
                )}
                
                <p className="text-xs opacity-60 mt-2">
                  {new Date(message.timestamp).toLocaleTimeString()}
                </p>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-2xl px-4 py-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating image...
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="border-t border-border p-4 bg-card">
        <div className="max-w-4xl mx-auto space-y-3">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Describe the image you want to generate..."
              disabled={isLoading}
              className="flex-1"
            />
            <Button type="submit" disabled={isLoading || !input.trim()}>
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </form>
          
          <p className="text-xs text-muted-foreground text-center">
            Signed in as <span className="font-medium">{user.email}</span>
            {autoWatermark && ' • Images will be watermarked with UTC timestamp'}
          </p>
        </div>
      </div>
    </div>
  );
}
