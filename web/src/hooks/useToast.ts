interface Toast {
  id?: string;
  title?: string;
  description?: string;
  variant?: "default" | "destructive";
}

export function useToast() {
  const toast = (props: Toast) => {
    // Simple implementation for displaying toasts
    // In a real app, this would integrate with a toast library like react-hot-toast or sonner
    if (props.title || props.description) {
      console.log(
        `[${props.variant === "destructive" ? "ERROR" : "INFO"}] ${props.title}: ${props.description}`
      );
    }
  };

  return { toast };
}
