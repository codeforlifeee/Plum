/**
 * OWNER    : Tejas
 * TASK     : Card surface primitives (Card / CardHeader / CardTitle / CardBody).
 * STATUS   : DONE
 */
import { cn } from '../../lib/cn';

export function Card({ className, as: Comp = 'div', interactive = false, ...props }) {
  return (
    <Comp
      className={cn(
        'pt-card',
        interactive && 'transition-colors duration-150 hover:border-primary/40',
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }) {
  return <div className={cn('flex items-start justify-between gap-3 px-5 pt-5', className)} {...props} />;
}

export function CardTitle({ className, as: Comp = 'h3', ...props }) {
  return <Comp className={cn('text-[15px] font-semibold tracking-tight', className)} {...props} />;
}

export function CardDescription({ className, ...props }) {
  return <p className={cn('text-xs text-muted-foreground mt-0.5', className)} {...props} />;
}

export function CardBody({ className, ...props }) {
  return <div className={cn('p-5', className)} {...props} />;
}

export default Card;
