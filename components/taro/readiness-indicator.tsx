import { SimulationReadiness } from "@/lib/taro/readiness";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface ReadinessIndicatorProps {
  readiness: SimulationReadiness;
}

export function ReadinessIndicator({ readiness }: ReadinessIndicatorProps) {
  // We specifically want to show:
  // 1. Items Exist
  // 2. Items in Active Z-Level
  // 3. Orders Valid
  
  const relevantIds = ['items-exist', 'active-z-items', 'pickable-items'];
  const relevantConditions = relevantIds.map(id => 
    readiness.conditions.find(c => c.id === id)
  ).filter(Boolean);

  return (
    <div className="flex items-center gap-3 px-3 py-1 bg-muted/30 border border-border rounded-lg h-8">
      <TooltipProvider>
        {relevantConditions.map((condition) => (
          condition && (
            <Tooltip key={condition.id}>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 cursor-help">
                  <div 
                    className={cn(
                      "w-2 h-2 rounded-full",
                      condition.isMet ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]"
                    )} 
                  />
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                    {condition.label}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {condition.isMet 
                  ? `${condition.label} status: Ready` 
                  : `${condition.label} status: Pending/Required`
                }
              </TooltipContent>
            </Tooltip>
          )
        ))}
      </TooltipProvider>
    </div>
  );
}
