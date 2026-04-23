'use client';

import { useState } from 'react';
import { LayoutConfig, LayoutType } from '@/lib/taro/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Settings2, LayoutDashboard } from 'lucide-react';

interface SetupOverlayProps {
  onComplete: (config: LayoutConfig) => void;
  initialConfig?: LayoutConfig;
}

export function SetupOverlay({ onComplete, initialConfig }: SetupOverlayProps) {
  const [config, setConfig] = useState<LayoutConfig>(initialConfig || {
    type: 'standard',
    width: 30,
    height: 24,
    aisles: 5
  });

  const handleComplete = () => {
    onComplete(config);
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
                <SelectItem value="standard">Standard Aisles</SelectItem>
                <SelectItem value="large">Large Distribution Center</SelectItem>
                <SelectItem value="compact">Compact Fulfillment</SelectItem>
                <SelectItem value="minimal">Minimal Lab</SelectItem>
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

          <div className="space-y-2">
            <Label htmlFor="aisles">Number of Aisles</Label>
            <Input 
              id="aisles" 
              type="number" 
              value={config.aisles}
              onChange={(e) => setConfig({ ...config, aisles: parseInt(e.target.value) || 5 })}
            />
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
