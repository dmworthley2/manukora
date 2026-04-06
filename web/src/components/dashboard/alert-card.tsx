"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type AlertType = "error" | "warning" | "info";

interface AlertCardProps {
  readonly type: AlertType;
  readonly title: string;
  readonly description: string;
  readonly icon: React.ReactNode;
  readonly badgeLabel: string;
}

/**
 * AlertCard
 * Composed component combining shadcn Alert + Badge for dashboard alerts.
 * Type-safe alert types with corresponding color schemes.
 */
export function AlertCard({
  type,
  title,
  description,
  icon,
  badgeLabel,
}: AlertCardProps) {
  const alertVariant =
    type === "error" ? "destructive" : type === "warning" ? "default" : "default";

  const badgeVariant =
    type === "error"
      ? "destructive"
      : type === "warning"
        ? "secondary"
        : "outline";

  return (
    <Alert
      variant={alertVariant}
      className={cn(
        "border-l-4 p-6",
        type === "error" && "border-l-destructive bg-destructive/5",
        type === "warning" &&
          "border-l-primary bg-primary/5 border-error-container",
        type === "info" && "border-l-secondary bg-secondary/5"
      )}
    >
      <div className="flex items-start gap-6">
        <div className="text-3xl flex-shrink-0">{icon}</div>
        <div className="flex-1">
          <div className="flex items-start justify-between mb-2">
            <AlertTitle className="text-base font-bold uppercase tracking-tight">
              {title}
            </AlertTitle>
            <Badge variant={badgeVariant} className="ml-2">
              {badgeLabel}
            </Badge>
          </div>
          <AlertDescription className="text-sm text-on-surface-variant">
            {description}
          </AlertDescription>
        </div>
      </div>
    </Alert>
  );
}
