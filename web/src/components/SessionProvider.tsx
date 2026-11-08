'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Ticket, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

const Session = createContext<{
  username: string;
  ready: boolean;
  setUsername: (value: string) => void;
}>({ username: '', ready: false, setUsername: () => {} });

export function useSession() {
  return useContext(Session);
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const storedUsername = useSyncExternalStore(
    (notify) => {
      window.addEventListener('seatrush-session', notify);
      window.addEventListener('storage', notify);
      return () => {
        window.removeEventListener('seatrush-session', notify);
        window.removeEventListener('storage', notify);
      };
    },
    () => sessionStorage.getItem('seatrush-username') ?? '',
    () => null,
  );
  const ready = storedUsername !== null;
  const username = storedUsername ?? '';

  useEffect(() => {
    if (ready && !username && pathname !== '/login') {
      const next = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    }
  }, [pathname, ready, router, username]);

  function setUsername(value: string) {
    const next = value.trim();
    if (next) sessionStorage.setItem('seatrush-username', next);
    else sessionStorage.removeItem('seatrush-username');
    window.dispatchEvent(new Event('seatrush-session'));
  }

  return (
    <Session.Provider value={{ username, ready, setUsername }}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      {ready && username && pathname !== '/login' && (
        <header className="site-header">
          <div className="header-inner">
            <Link href="/" className="brand" aria-label="SeatRush home">
              <span className="brand-icon">
                <Ticket aria-hidden="true" />
              </span>
              SeatRush
            </Link>
            <nav aria-label="Main navigation" className="nav-links">
              <Link
                href="/events"
                aria-current={
                  pathname.startsWith('/events') ? 'page' : undefined
                }
              >
                Events
              </Link>
              <Link
                href="/my-tickets"
                aria-current={pathname === '/my-tickets' ? 'page' : undefined}
              >
                My Tickets
              </Link>
            </nav>
            <div className="header-user">
              <span className="header-username" title={username}>
                {username}
              </span>
              <Button
                className="user-button"
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setUsername('')}
              >
                <LogOut aria-hidden="true" /> Log out
              </Button>
            </div>
          </div>
        </header>
      )}
      {ready && (username || pathname === '/login') && children}
    </Session.Provider>
  );
}

export function UsernameForm({ onComplete }: { onComplete?: () => void }) {
  const { setUsername } = useSession();
  const [draft, setDraft] = useState('');

  return (
    <form
      className="username-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (draft.trim()) {
          setUsername(draft);
          onComplete?.();
        }
      }}
    >
      <Card className="form-card">
        <CardHeader>
          <CardTitle>
            <h1>Log in to SeatRush</h1>
          </CardTitle>
          <CardDescription>
            Enter your username below to access your tickets.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Field>
            <FieldLabel htmlFor="username">Username</FieldLabel>
            <Input
              id="username"
              name="username"
              placeholder="Your username"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              enterKeyHint="done"
              spellCheck={false}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              required
            />
          </Field>
        </CardContent>
        <CardFooter>
          <Button type="submit">Log in</Button>
        </CardFooter>
      </Card>
    </form>
  );
}
