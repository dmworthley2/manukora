"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type RiskLevel = "critical" | "high" | "moderate" | "safe";

interface InventoryItem {
  readonly sku: string;
  readonly name: string;
  readonly onHand: number;
  readonly dailyVelocity: number;
  readonly daysOfCover: number;
  readonly riskLevel: RiskLevel;
  readonly revenueOpportunity: string;
}

interface InventoryTableProps {
  readonly items: readonly InventoryItem[];
  readonly isLoading?: boolean;
}

/**
 * InventoryTable
 * Composed component using shadcn Table for inventory display.
 * Type-safe risk level handling with appropriate color coding.
 */
export function InventoryTable({
  items,
  isLoading = false,
}: InventoryTableProps) {
  const riskBadgeVariant: Record<RiskLevel, "destructive" | "secondary" | "outline" | "default"> = {
    critical: "destructive",
    high: "destructive",
    moderate: "secondary",
    safe: "outline",
  };

  const riskLabels: Record<RiskLevel, string> = {
    critical: "High Loss Exposure",
    high: "Stockout Imminent",
    moderate: "Replenish Soon",
    safe: "Stable Inventory",
  };

  if (isLoading) {
    return <div className="text-center py-8 text-on-surface-variant">Loading inventory...</div>;
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-surface-container hover:bg-surface-container">
            <TableHead className="font-headline font-bold">SKU Description</TableHead>
            <TableHead>On-Hand</TableHead>
            <TableHead>Daily Velocity</TableHead>
            <TableHead>Days of Cover</TableHead>
            <TableHead className="text-right">Revenue Opportunity</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center py-8 text-on-surface-variant">
                No inventory items found
              </TableCell>
            </TableRow>
          ) : (
            items.map((item) => (
              <InventoryTableRow
                key={item.sku}
                item={item}
                riskBadgeVariant={riskBadgeVariant}
                riskLabels={riskLabels}
              />
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

interface InventoryTableRowProps {
  readonly item: InventoryItem;
  readonly riskBadgeVariant: Record<RiskLevel, "destructive" | "secondary" | "outline" | "default">;
  readonly riskLabels: Record<RiskLevel, string>;
}

function InventoryTableRow({
  item,
  riskBadgeVariant,
  riskLabels,
}: InventoryTableRowProps) {
  return (
    <TableRow className="hover:bg-surface/50">
      <TableCell>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-sm bg-background border border-surface-container p-1 flex items-center justify-center flex-shrink-0">
            <span className="text-xl">🍯</span>
          </div>
          <div>
            <p className="font-headline font-semibold text-foreground">
              {item.name}
            </p>
            <p className="font-label text-xs text-on-surface-variant/60 uppercase tracking-widest mt-1">
              SKU: {item.sku}
            </p>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <span className="font-headline font-medium text-lg text-foreground">
          {item.onHand}
        </span>
        <span className="text-xs font-label text-on-surface-variant uppercase tracking-widest ml-2">
          units
        </span>
      </TableCell>
      <TableCell className="font-body text-sm text-foreground">
        {item.dailyVelocity}
        <span className="text-xs font-label text-on-surface-variant tracking-widest ml-1">
          /day
        </span>
      </TableCell>
      <TableCell>
        <Badge variant={riskBadgeVariant[item.riskLevel]}>
          {item.daysOfCover} Days
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        <p className="font-headline font-semibold text-lg text-foreground">
          {item.revenueOpportunity}
        </p>
        <p
          className={cn(
            "font-label text-xs font-bold uppercase tracking-widest mt-1",
            item.riskLevel === "safe"
              ? "text-secondary"
              : item.riskLevel === "moderate"
                ? "text-primary"
                : "text-destructive"
          )}
        >
          {riskLabels[item.riskLevel]}
        </p>
      </TableCell>
    </TableRow>
  );
}
