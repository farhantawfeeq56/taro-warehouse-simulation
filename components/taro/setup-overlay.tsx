'use client';

import { useState } from 'react';
import { LayoutConfig, LayoutType } from '@/lib/taro/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Settings2, LayoutDashboard } from 'lucide-react';

interface SetupOverlayProps {
  onComplete: (config: LayoutConfig) => void;
  initialConfig?: LayoutConfig;
}

export function SetupOverlay({ onComplete, initialConfig }: SetupOverlayProps) {
  const [config, setConfig] = useState<LayoutConfig>(initialConfig || {
    type: 'parallel',
    width: 30,
    height: 24,
    density: 5,
    shortcuts: 1,
    rowLength: 5
  });

  const handleComplete = () => {
    // Apply constraints
    let finalConfig = { ...config };
    if (config.type === 'segmented') {
      finalConfig.rowLength = Math.min(finalConfig.rowLength, 5); // cap continuity for segmented
    }
    onComplete(finalConfig);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-md p-4">
      <Card className="w-full max-w-md shadow-2xl border-primary/20">
        <CardHeader>
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Settings2 className="h-5 w-5 text-primary" />
            </div>
            <CardTitle>Warehouse Setup</CardTitle>
          </div>
          <CardDescription>
            Configure your warehouse layout before starting the simulation.
            <span className="block mt-1 font-medium text-primary/80">
              Different layouts can significantly change walking distance
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="layout-type">Layout Pattern</Label>
            <Select 
              value={config.type} 
              onValueChange={(value: LayoutType) => setConfig({ ...config, type: value })}
            >
              <SelectTrigger id="layout-type">
                <SelectValue placeholder="Select layout pattern" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="parallel">Parallel Aisles</SelectItem>
                <SelectItem value="cross-aisle">Cross Aisle</SelectItem>
                <SelectItem value="segmented">Segmented Blocks</SelectItem>
                <SelectItem value="fishbone">Fishbone (V-Shape)</SelectItem>
                <SelectItem value="fishbone-geometric">Fishbone (Geometric)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="width">Width (units)</Label>
              <Input 
                id="width" 
                type="number" 
                value={config.width}
                onChange={(e) => setConfig({ ...config, width: parseInt(e.target.value) || 30 })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="height">Height (units)</Label>
              <Input 
                id="height" 
                type="number" 
                value={config.height}
                onChange={(e) => setConfig({ ...config, height: parseInt(e.target.value) || 24 })}
              />
            </div>
          </div>

          <div className="space-y-4 pt-2">
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Label>Space vs Storage (Density)</Label>
                <span className="text-xs font-mono text-muted-foreground">{config.density}</span>
              </div>
              <Slider 
                value={[config.density]} 
                min={1} 
                max={10} 
                step={1} 
                onValueChange={([val]) => setConfig({ ...config, density: val })}
              />
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Label>Shortcut Paths</Label>
                <span className="text-xs font-mono text-muted-foreground">{config.shortcuts}</span>
              </div>
              <Slider 
                value={[config.shortcuts]} 
                min={0} 
                max={3} 
                step={1} 
                onValueChange={([val]) => setConfig({ ...config, shortcuts: val })}
              />
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Label>Row Continuity (Length)</Label>
                <span className="text-xs font-mono text-muted-foreground">{config.rowLength}</span>
              </div>
              <Slider 
                value={[config.rowLength]} 
                min={1} 
                max={10} 
                step={1} 
                onValueChange={([val]) => setConfig({ ...config, rowLength: val })}
              />
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button className="w-full" onClick={handleComplete}>
            <LayoutDashboard className="h-4 w-4 mr-2" />
            Initialize Warehouse
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
