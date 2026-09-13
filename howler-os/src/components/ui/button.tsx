import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 min-h-11 rounded-sm px-4 text-sm font-medium transition-[opacity,transform,box-shadow] duration-[var(--motion-quick,150ms)] ease-[cubic-bezier(0.22,1,0.36,1)] disabled:pointer-events-none disabled:opacity-40 active:scale-[0.98]",
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-fg hover:bg-accent-strong",
        secondary:
          "bg-surface-2 text-fg shadow-[var(--shadow-border)] hover:shadow-[var(--shadow-border-hover)]",
        ghost: "text-muted hover:text-fg hover:bg-surface-2",
        danger: "bg-danger text-fg hover:opacity-90",
      },
    },
    defaultVariants: { variant: "secondary" },
  },
);

export function Button({
  className,
  variant,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>) {
  return <button className={cn(buttonVariants({ variant }), className)} {...props} />;
}
