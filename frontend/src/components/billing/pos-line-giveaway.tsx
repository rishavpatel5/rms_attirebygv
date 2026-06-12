import { Gift } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { BillingLine } from "@/stores/billing-store";
import { useBillingStore } from "@/stores/billing-store";

type Props = {
  line: BillingLine;
};

export function PosLineGiveaway({ line }: Props) {
  const setLineGiveaway = useBillingStore((s) => s.setLineGiveaway);
  const setLineGiveawayReason = useBillingStore((s) => s.setLineGiveawayReason);

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={`giveaway-${line.id}`}
          className={cn(
            "flex items-center gap-1.5 text-[11px] font-medium",
            line.isGiveaway ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground",
          )}
        >
          <Gift className="size-3.5" />
          Giveaway (free)
        </label>
        <Switch
          id={`giveaway-${line.id}`}
          checked={line.isGiveaway}
          onCheckedChange={(checked) => setLineGiveaway(line.id, checked)}
        />
      </div>
      {line.isGiveaway ? (
        <Input
          type="text"
          placeholder="Reason (optional)"
          value={line.giveawayReason ?? ""}
          onChange={(e) => setLineGiveawayReason(line.id, e.target.value)}
          className="h-7 rounded-lg text-xs"
        />
      ) : null}
    </div>
  );
}
