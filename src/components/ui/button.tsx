import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-medium transition-all duration-300 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 select-none",
  {
    variants: {
      variant: {
        default: "bg-app-accent text-white hover:bg-app-accent-hover shadow-lg shadow-app-accent/20 hover:shadow-app-accent/40",
        destructive: "bg-red-500/80 text-white hover:bg-red-500 shadow-lg shadow-red-500/20",
        outline: "border border-app-border bg-app-bg/50 hover:bg-app-panel hover:text-white backdrop-blur-sm",
        secondary: "bg-app-panel/80 text-app-text hover:bg-app-panel hover:text-white shadow-sm border border-app-border/50",
        ghost: "hover:bg-app-panel/60 hover:text-white text-app-text",
        link: "text-app-accent underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        xs: "h-7 px-3 text-xs rounded-lg",
        sm: "h-8 px-3 text-xs rounded-lg",
        lg: "h-10 px-8 rounded-xl",
        icon: "h-9 w-9",
        "icon-sm": "h-8 w-8 rounded-lg",
        "icon-xs": "h-7 w-7 rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
