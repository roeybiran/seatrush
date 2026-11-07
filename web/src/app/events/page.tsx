'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarDays } from 'lucide-react';
import { ContentUnavailable } from '@/components/ContentUnavailable';
import { buttonVariants } from '@/components/ui/button';
import { api, eventDate, type EventSummary } from '@/lib/api';

export default function Events() {
  const [events, setEvents] = useState<EventSummary[] | null>(null);
  const [error, setError] = useState('');
  const [now, setNow] = useState(0);

  useEffect(() => {
    let active = true;
    const load = () =>
      api<EventSummary[]>('/events')
        .then((value) => {
          if (active) {
            setEvents(value);
            setError('');
            setNow(Date.now());
          }
        })
        .catch((reason) => {
          if (active) setError(reason.message);
        });
    load();
    const poll = setInterval(load, 10000);
    const tick = setInterval(() => setNow(Date.now()), 1000);

    return () => {
      active = false;
      clearInterval(poll);
      clearInterval(tick);
    };
  }, []);

  return (
    <main id="main" className="page-width inner-page">
      <section id="events" className="events-section">
        <div className="section-heading">
          <h1>Events</h1>
          {events && <span>{events.length} events</span>}
        </div>
        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}
        {!events && !error && <p className="loading">Loading events…</p>}
        {events?.length === 0 && (
          <ContentUnavailable
            title="No events available."
            icon={<CalendarDays />}
          />
        )}
        <div className="event-grid">
          {events?.map((event) => {
            const onSale = now >= new Date(event.dropTime).getTime();
            const remaining = Math.max(
              0,
              Math.ceil((new Date(event.dropTime).getTime() - now) / 1000),
            );
            return (
              <article className="event-card" key={event.id}>
                <h2>{event.name}</h2>
                <div className="event-meta">
                  <span>{eventDate(event.eventTime)}</span>
                  <span>{event.venue}</span>
                </div>
                <div className="card-bottom">
                  <span>
                    {onSale
                      ? 'On sale'
                      : `On sale in ${Math.floor(remaining / 86400)}d ${Math.floor((remaining % 86400) / 3600)}h ${Math.floor((remaining % 3600) / 60)}m ${remaining % 60}s`}
                  </span>
                  <Link
                    href={`/events/${event.id}`}
                    className={buttonVariants({
                      variant: 'outline',
                      size: 'sm',
                    })}
                  >
                    View event
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
