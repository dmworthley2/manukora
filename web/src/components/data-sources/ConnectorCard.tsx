import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface ConnectorCardProps {
  name: string;
  description: string;
  icon: React.ReactNode;
  status?: "available" | "coming-soon";
  onClick?: () => void;
}

export function ConnectorCard({
  name,
  description,
  icon,
  status = "available",
  onClick,
}: ConnectorCardProps) {
  return (
    <Card
      className="p-6 cursor-pointer hover:shadow-md transition-shadow"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          onClick?.();
        }
      }}
    >
      <div className="flex items-start gap-4">
        <div className="text-3xl flex-shrink-0">{icon}</div>
        <div className="flex-1">
          <h3 className="font-semibold text-lg mb-1">{name}</h3>
          <p className="text-sm text-muted-foreground mb-3">{description}</p>
          {status === "coming-soon" && (
            <Badge variant="secondary" className="text-xs">
              Coming soon
            </Badge>
          )}
        </div>
      </div>
    </Card>
  );
}
