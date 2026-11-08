'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarDays, MapPin } from 'lucide-react';
import { ContentUnavailable } from '@/components/ContentUnavailable';
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { buttonVariants } from '@/components/ui/button';
import { api, eventDate, serverOffset, type EventSummary } from '@/lib/api';

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
            setNow(Date.now() + serverOffset());
          }
        })
        .catch((reason) => {
          if (active) setError(reason.message);
        });
    load();
    const poll = setInterval(load, 10000);
    const tick = setInterval(() => setNow(Date.now() + serverOffset()), 1000);

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
          <div>
            <h1>Events</h1>
            <p className="page-description">
              Explore upcoming events and find your seats.
            </p>
          </div>
          {events && (
            <Badge variant="outline">
              {events.length} {events.length === 1 ? 'event' : 'events'}
            </Badge>
          )}
        </div>
        {error && (
          <Alert className="notice error" variant="destructive">
            {error}
          </Alert>
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
              <article key={event.id}>
                <Card className="event-card">
                  <CardHeader>
                    <CardTitle>
                      <h2>{event.name}</h2>
                    </CardTitle>
                    <CardAction>
                      <Badge variant={onSale ? 'secondary' : 'outline'}>
                        {onSale ? 'On sale' : 'Coming soon'}
                      </Badge>
                    </CardAction>
                  </CardHeader>
                  <CardContent>
                    <div className="event-meta">
                      <span>
                        <CalendarDays aria-hidden="true" />
                        {eventDate(event.eventTime)}
                      </span>
                      <span>
                        <MapPin aria-hidden="true" />
                        {event.venue}
                      </span>
                    </div>
                  </CardContent>
                  <CardFooter className="event-footer">
                    <span>
                      {onSale
                        ? 'On sale now'
                        : `On sale in ${Math.floor(remaining / 86400)}d ${Math.floor((remaining % 86400) / 3600)}h ${Math.floor((remaining % 3600) / 60)}m ${remaining % 60}s`}
                    </span>
                    <Link
                      href={`/events/${event.id}`}
                      aria-label={`View event: ${event.name}`}
                      className={buttonVariants({
                        variant: 'outline',
                        size: 'sm',
                      })}
                    >
                      View event <ArrowRight aria-hidden="true" />
                    </Link>
                  </CardFooter>
                </Card>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
