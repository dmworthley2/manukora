"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";

interface KPICardProps {
  readonly title: string;
  readonly value: string;
  readonly trend?: string;
  readonly description?: string;
  readonly footer?: React.ReactNode;
  readonly children?: React.ReactNode;
}

/**
 * KPICard
 * Composed from shadcn Card for displaying key performance indicators.
 * Supports optional trend display and custom footer content.
 */
export function KPICard({
  title,
  value,
  trend,
  description,
  footer,
  children,
}: KPICardProps) {
  return (
    <Card className="bg-surface-container-low border-outline/5">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <CardTitle className="text-xs font-label uppercase tracking-widest text-on-surface-variant">
            {title}
          </CardTitle>
          {trend && (
            <div className="flex items-center gap-1 bg-secondary/10 text-secondary px-2 py-1 rounded-sm text-xs font-bold">
              <TrendingUp className="h-3 w-3" />
              {trend}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <p className="text-5xl md:text-6xl font-bold font-headline text-foreground">
            {value}
          </p>
        </div>
        {children}
        {description && (
          <CardDescription className="text-xs text-on-surface-variant mt-4">
            {description}
          </CardDescription>
        )}
        {footer && <div className="mt-6 pt-6 border-t border-outline/10">{footer}</div>}
      </CardContent>
    </Card>
  );
}
