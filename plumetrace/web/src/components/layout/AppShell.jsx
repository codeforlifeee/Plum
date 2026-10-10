/**
 * OWNER    : Tanmay
 * DUE      : D1 14:00
 * TASK     :
 *   Top nav tabs (Government / Fleet / Forecast Skill / Approvals), Copilot drawer button on every page, DegradedBanner, run_id + issued time (IST).
 * DONE WHEN: -
 * GUIDE    : docs/team/TANMAY.md  |  brief: docs/PROJECT_BRIEF.md
 * STATUS   : DONE
 */
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Wind, Sparkles, Menu, X, LogOut, ShieldCheck, Map, Bike, Gauge, CheckSquare } from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import DegradedBanner from '../DegradedBanner';
import { useLatestRun } from '../../hooks/queries';
import { useAuthStore } from '../../stores/authStore';
import { handleLogout } from '../../lib/auth';
import { formatIst } from '../../lib/format';
import { Button } from '../ui/Button';
import { ThemeToggle } from '../ui/ThemeToggle';
import { cn } from '../../lib/cn';

const TABS = [
  { name: 'Government', path: '/gov', icon: Map },
  { name: 'Fleet', path: '/fleet', icon: Bike },
  { name: 'Forecast skill', path: '/skill', icon: Gauge },
  { name: 'Approvals', path: '/approvals', icon: CheckSquare },
];

function Logo() {
  return (
    <Link to="/gov" className="flex items-center gap-2.5 group shrink-0" aria-label="PlumeTrace home">
      <span className="grid place-items-center w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-lg shadow-primary/20">
        <Wind size={17} strokeWidth={2.5} aria-hidden />
      </span>
      <span className="text-[15px] font-extrabold tracking-tight">
        Plume<span className="text-primary">Trace</span>
      </span>
    </Link>
  );
}

function RunBadge({ run }) {
  return (
    <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground px-2.5 py-1 rounded-full bg-secondary/70 border border-border">
      <span className={cn('w-1.5 h-1.5 rounded-full', run?.run_id ? 'bg-success pt-pulse-dot' : 'bg-muted-foreground')} />
      {run?.run_id ? (
        <span className="tnum">
          run <span className="text-foreground font-medium">{run.run_id}</span>
          {run.issued_at ? <> · issued {formatIst(run.issued_at)}</> : ''}
        </span>
      ) : (
        'run: pending'
      )}
    </div>
  );
}

export default function AppShell({ children }) {
  const loc = useLocation();
  const { data: run } = useLatestRun();
  const { user } = useAuthStore();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const navLink = (t, onClick) => {
    const active = loc.pathname === t.path;
    const Icon = t.icon;
    return (
      <Link
        key={t.path}
        to={t.path}
        onClick={onClick}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
          active ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'
        )}
      >
        <Icon size={15} strokeWidth={2.1} aria-hidden />
        {t.name}
      </Link>
    );
  };

  return (
    <div className="flex flex-col h-screen text-foreground">
      <header className="pt-glass sticky top-0 z-30 flex items-center justify-between gap-3 px-4 sm:px-5 h-14 border-b border-border">
        <div className="flex items-center gap-6 min-w-0">
          <Logo />
          <nav className="hidden md:flex items-center gap-1" aria-label="Primary">
            {TABS.map((t) => navLink(t))}
          </nav>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <RunBadge run={run} />
          <ThemeToggle />
          <Button asChild size="sm" className="hidden sm:inline-flex">
            <Link to="/copilot">
              <Sparkles size={15} aria-hidden /> Copilot
            </Link>
          </Button>

          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                className="grid place-items-center w-9 h-9 rounded-full bg-secondary border border-border text-sm font-semibold text-foreground hover:border-primary/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Account menu"
              >
                {(user?.username || 'U').slice(0, 1).toUpperCase()}
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={8}
                className="z-50 min-w-[200px] rounded-[var(--radius)] border border-border bg-popover p-1.5 shadow-xl pt-fade"
              >
                <div className="px-2.5 py-2 text-xs text-muted-foreground border-b border-border mb-1">
                  Signed in as <span className="text-foreground font-medium">{user?.username || 'User'}</span>
                </div>
                <DropdownMenu.Item asChild>
                  <Link
                    to="/consent"
                    className="flex items-center gap-2 px-2.5 py-2 rounded-md text-sm text-foreground hover:bg-secondary outline-none cursor-pointer"
                  >
                    <ShieldCheck size={15} aria-hidden /> Privacy & consent
                  </Link>
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  onSelect={handleLogout}
                  className="flex items-center gap-2 px-2.5 py-2 rounded-md text-sm text-destructive hover:bg-destructive/10 outline-none cursor-pointer"
                >
                  <LogOut size={15} aria-hidden /> Sign out
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>

          <button
            className="md:hidden grid place-items-center w-9 h-9 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            onClick={() => setDrawerOpen((v) => !v)}
            aria-label={drawerOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={drawerOpen}
          >
            {drawerOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="md:hidden border-b border-border bg-card/95 backdrop-blur px-4 py-3 flex flex-col gap-1 pt-fade z-20">
          {TABS.map((t) => navLink(t, () => setDrawerOpen(false)))}
          <Link
            to="/copilot"
            onClick={() => setDrawerOpen(false)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium text-primary hover:bg-secondary/60"
          >
            <Sparkles size={15} aria-hidden /> Copilot
          </Link>
        </div>
      )}

      <DegradedBanner />
      <main className="flex-1 min-h-0 overflow-auto relative">{children}</main>
    </div>
  );
}
