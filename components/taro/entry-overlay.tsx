'use client';

import { Wand2, Upload, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface EntryOverlayProps {
  onTryDemo: () => void;
  onImport: () => void;
  onBuildManually: () => void;
}

export function EntryOverlay({ onTryDemo, onImport, onBuildManually }: EntryOverlayProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 backdrop-blur-md bg-background/60 animate-in fade-in duration-300" />
      
      <div className="relative z-10 max-w-md w-full mx-4 animate-in zoom-in-95 duration-300">
        <div className="bg-background border border-border rounded-xl shadow-2xl p-8">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold tracking-tight mb-2">Welcome to Taro</h2>
            <p className="text-sm text-muted-foreground">
              Warehouse Picking Simulator
            </p>
          </div>

          <div className="space-y-3">
            <Button
              onClick={onTryDemo}
              size="lg"
              className="w-full h-14 text-base justify-start gap-3"
            >
              <Wand2 className="h-5 w-5" />
              <span>Try Demo Warehouse</span>
            </Button>

            <Button
              onClick={onImport}
              variant="secondary"
              size="lg"
              className="w-full h-14 text-base justify-start gap-3"
            >
              <Upload className="h-5 w-5" />
              <span>Import Warehouse Data</span>
            </Button>

            <Button
              onClick={onBuildManually}
              variant="ghost"
              size="lg"
              className="w-full h-14 text-base justify-start gap-3"
            >
              <Pencil className="h-5 w-5" />
              <span>Build Manually</span>
            </Button>
          </div>

          <div className="mt-6 pt-6 border-t border-border">
            <p className="text-xs text-center text-muted-foreground">
              Start with a demo, import your layout, or build from scratch
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
