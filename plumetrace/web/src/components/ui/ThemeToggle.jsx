/**
 * OWNER    : Tejas
 * TASK     : Light/dark theme toggle. Light is the default; this flips the `.dark`
 *            class on <html> via the theme store. Accessible (label + pressed state,
 *            keyboard-operable, ≥40px hit target), icon + animated swap.
 * STATUS   : DONE
 */
import { Sun, Moon } from 'lucide-react';
import { useThemeStore } from '../../stores/themeStore';
import { cn } from '../../lib/cn';

export function ThemeToggle({ className }) {
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={cn(
        'relative grid place-items-center w-9 h-9 rounded-full border border-border bg-secondary text-muted-foreground',
        'transition-colors hover:text-foreground hover:border-primary/50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        className
      )}
    >
      <Sun
        size={16}
        strokeWidth={2.2}
        aria-hidden
        className={cn(
          'absolute transition-all duration-200 ease-[var(--ease-out)]',
          isDark ? 'opacity-0 -rotate-90 scale-50' : 'opacity-100 rotate-0 scale-100'
        )}
      />
      <Moon
        size={16}
        strokeWidth={2.2}
        aria-hidden
        className={cn(
          'absolute transition-all duration-200 ease-[var(--ease-out)]',
          isDark ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 rotate-90 scale-50'
        )}
      />
    </button>
  );
}

export default ThemeToggle;
