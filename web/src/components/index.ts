/**
 * Component Exports
 * Central API for importing components throughout the application
 */

// Dashboard components
export { DashboardNav } from "./dashboard/nav";
export { AlertCard } from "./dashboard/alert-card";
export { KPICard } from "./dashboard/kpi-card";

// Inventory components
export { InventoryTable } from "./inventory/inventory-table";

// Shadcn/UI base components
export {
  Alert,
  AlertTitle,
  AlertDescription,
} from "./ui/alert";
export { Badge } from "./ui/badge";
export { Button } from "./ui/button";
export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
} from "./ui/card";
export {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "./ui/table";
export {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "./ui/tabs";
export { Dialog, DialogTrigger, DialogContent } from "./ui/dialog";
export { Sheet, SheetTrigger, SheetContent } from "./ui/sheet";
export { Separator } from "./ui/separator";
