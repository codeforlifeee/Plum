/**
 * OWNER    : Tejas
 * TASK     : Button primitive (variants + sizes), used app-wide instead of ad-hoc classes.
 * STATUS   : DONE
 */
import { forwardRef } from 'react';
import { cva } from 'class-variance-authority';
import { Slot } from '@radix-ui/react-slot';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--radius)] font-semibold ' +
    'transition-[background,color,box-shadow,transform] duration-150 ease-[var(--ease-out)] ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ' +
    'disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] select-none',
  {
    variants: {
      variant: {
        primary:
          'bg-primary text-primary-foreground shadow-[0_8px_24px_-12px_var(--color-primary)] hover:bg-primary-strong',
        secondary:
          'bg-secondary text-secondary-foreground border border-border hover:bg-muted',
        ghost: 'text-muted-foreground hover:text-foreground hover:bg-secondary',
        outline: 'border border-border text-foreground hover:bg-secondary',
        danger: 'bg-destructive/12 text-destructive border border-destructive/25 hover:bg-destructive/20',
        success: 'bg-success/12 text-success border border-success/25 hover:bg-success/20',
        link: 'text-primary hover:text-primary-strong underline-offset-4 hover:underline px-0',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-4 text-sm',
        lg: 'h-11 px-5 text-sm',
        icon: 'h-10 w-10',
        iconSm: 'h-8 w-8',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  }
);

const Button = forwardRef(function Button(
  { className, variant, size, asChild = false, loading = false, children, disabled, ...props },
  ref
) {
  if (asChild) {
    return (
      <Slot ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props}>
        {children}
      </Slot>
    );
  }

  return (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} {...props}>
      {loading && <Loader2 className="animate-spin" size={size === 'sm' ? 13 : 15} aria-hidden />}
      {children}
    </button>
  );
});

export { Button, buttonVariants };
export default Button;
