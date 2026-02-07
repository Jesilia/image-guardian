import { useState, useRef, useEffect } from 'react';
import { Send, Shield, ShieldCheck, Loader2, ImageIcon, Download, Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { embedWatermark, downloadImage } from '@/lib/watermark';
import { Link } from 'react-router-dom';

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
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [autoWatermark, setAutoWatermark] = useState(true);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem('imageGuardianUsername');
    if (saved) setUsername(saved);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleUsernameChange = (value: string) => {
    setUsername(value);
    localStorage.setItem('imageGuardianUsername', value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    if (!username.trim()) {
      toast.error('Please enter a username first');
      return;
    }

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
      // Call the edge function
      const { data, error } = await supabase.functions.invoke('generate-image', {
        body: { prompt: userMessage.content },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      let finalImageUrl = data.imageUrl;
      let isWatermarked = false;
      let watermarkHash: string | undefined;

      // Apply watermark if enabled
      if (autoWatermark && finalImageUrl) {
        try {
          const timestamp = new Date().toISOString();
          const result = await embedWatermark(finalImageUrl, {
            creatorId: username,
            timestamp,
            prompt: userMessage.content,
          });

          finalImageUrl = result.watermarkedImageUrl;
          isWatermarked = true;
          watermarkHash = result.hash;

          // Save to registry
          await supabase.from('watermark_registry').insert({
            creator_id: username,
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
    const filename = `generated_${Date.now()}.png`;
    downloadImage(imageUrl, filename);
    toast.success('Image downloaded');
  };

  const copyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    toast.success('Hash copied');
    setTimeout(() => setCopiedHash(null), 2000);
  };

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
              <p className="text-xs text-muted-foreground">Generate & protect your images</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <Link to="/verify" className="text-sm text-muted-foreground hover:text-foreground">
              Verify Images
            </Link>
            
            <div className="flex items-center gap-2">
              <Switch
                id="auto-watermark"
                checked={autoWatermark}
                onCheckedChange={setAutoWatermark}
              />
              <Label htmlFor="auto-watermark" className="text-sm flex items-center gap-1">
                <Shield className="w-4 h-4" />
                Auto-watermark
              </Label>
            </div>
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
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted'
                }`}
              >
                <p className="text-sm">{message.content}</p>
                
                {message.imageUrl && (
                  <div className="mt-3 space-y-2">
                    <div className="relative rounded-lg overflow-hidden bg-background/50">
                      <img
                        src={message.imageUrl}
                        alt="Generated"
                        className="max-w-full h-auto max-h-[400px] object-contain"
                      />
                      {message.isWatermarked && (
                        <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-full bg-primary text-primary-foreground text-xs">
                          <ShieldCheck className="w-3 h-3" />
                          Protected
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleDownload(message.imageUrl!)}
                      >
                        <Download className="w-4 h-4 mr-1" />
                        Download
                      </Button>
                      
                      {message.watermarkHash && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyHash(message.watermarkHash!)}
                          className="font-mono text-xs"
                        >
                          {copiedHash === message.watermarkHash ? (
                            <Check className="w-4 h-4 mr-1" />
                          ) : (
                            <Copy className="w-4 h-4 mr-1" />
                          )}
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
          {!username && (
            <div className="flex items-center gap-2">
              <Input
                placeholder="Enter your username to start..."
                value={username}
                onChange={(e) => handleUsernameChange(e.target.value)}
                className="flex-1"
              />
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Describe the image you want to generate..."
              disabled={isLoading || !username}
              className="flex-1"
            />
            <Button type="submit" disabled={isLoading || !input.trim() || !username}>
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </form>
          
          {username && (
            <p className="text-xs text-muted-foreground text-center">
              Creating as <span className="font-medium">{username}</span>
              <button 
                onClick={() => handleUsernameChange('')}
                className="ml-2 text-primary hover:underline"
              >
                Change
              </button>
              {autoWatermark && ' • Images will be watermarked'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}