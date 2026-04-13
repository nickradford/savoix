import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

const kbdVariants = cva(
  "pointer-events-none inline-flex w-fit items-center justify-center gap-1 rounded font-sans text-xs font-medium select-none [&_svg:not([class*='size-'])]:size-3",
  {
    variants: {
      variant: {
        default: "h-5 min-w-5 bg-muted px-1 text-muted-foreground",
        tooltip: "px-1.5 py-0.5 bg-white/20 text-white font-mono",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

interface KbdProps
  extends React.ComponentProps<"kbd">, VariantProps<typeof kbdVariants> {}

function Kbd({ className, variant, ...props }: KbdProps) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(kbdVariants({ variant }), className)}
      {...props}
    />
  );
}

function KbdGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <kbd
      data-slot="kbd-group"
      className={cn("inline-flex items-center gap-1", className)}
      {...props}
    />
  );
}

export { Kbd, KbdGroup };
