import { useState, useEffect } from 'react';
import { ScrollText, Download, Trash2, Hash, Clock, User, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getLedger, exportLedger, LedgerEntry } from '@/lib/watermark';
import { toast } from 'sonner';

export function AuditLedger() {
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);

  useEffect(() => {
    setLedger(getLedger());
  }, []);

  // Listen for storage changes
  useEffect(() => {
    const handleStorage = () => setLedger(getLedger());
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const handleExport = () => {
    const data = exportLedger();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `watermark_ledger_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Ledger exported');
  };

  const clearLedger = () => {
    if (confirm('Are you sure you want to clear all audit records?')) {
      localStorage.removeItem('watermark_ledger');
      setLedger([]);
      toast.success('Ledger cleared');
    }
  };

  return (
    <Card className="glass-panel p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ScrollText className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold text-foreground">Audit Ledger</h3>
          <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">
            {ledger.length} records
          </span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExport} disabled={ledger.length === 0}>
            <Download className="w-4 h-4 mr-1" />
            Export
          </Button>
          <Button variant="ghost" size="sm" onClick={clearLedger} disabled={ledger.length === 0} className="text-destructive hover:text-destructive">
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {ledger.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <ScrollText className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No watermarks created yet</p>
          <p className="text-sm mt-1">Records will appear here as you watermark images</p>
        </div>
      ) : (
        <ScrollArea className="h-[300px]">
          <div className="space-y-3 pr-4">
            {ledger.map((entry) => (
              <div
                key={entry.id}
                className="p-3 rounded-lg bg-muted/20 border border-border/30 hover:border-primary/30 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-foreground truncate">
                      {entry.creatorId}
                    </p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(entry.timestamp).toLocaleString()}
                      </span>
                    </div>
                    {entry.prompt && (
                      <p className="mt-2 text-xs text-muted-foreground flex items-start gap-1">
                        <MessageSquare className="w-3 h-3 mt-0.5 flex-shrink-0" />
                        <span className="truncate">{entry.prompt}</span>
                      </p>
                    )}
                    <p className="mt-2 text-xs font-mono text-primary/70 flex items-center gap-1 truncate">
                      <Hash className="w-3 h-3 flex-shrink-0" />
                      {entry.imageHash.slice(0, 24)}...
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </Card>
  );
}
