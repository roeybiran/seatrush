'use client';

import { useEffect, useState } from 'react';
import { CalendarDays, MapPin, Ticket } from 'lucide-react';
import { ContentUnavailable } from '@/components/ContentUnavailable';
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useSession } from '@/components/SessionProvider';
import { api, eventDate, money, rowLabel, type Order } from '@/lib/api';

export default function MyAccount() {
  const { username } = useSession();
  const [result, setResult] = useState<{
    username: string;
    retry: number;
    orders: Order[] | null;
    error: string;
  } | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    if (username)
      api<Order[]>('/my-tickets', {}, username)
        .then((value) => {
          if (active) setResult({ username, retry, orders: value, error: '' });
        })
        .catch((reason) => {
          if (active)
            setResult({ username, retry, orders: null, error: reason.message });
        });

    return () => {
      active = false;
    };
  }, [username, retry]);

  const currentResult =
    result?.username === username && result.retry === retry ? result : null;
  const orders = currentResult?.orders ?? null;
  const error = currentResult?.error ?? '';

  return (
    <main id="main" className="page-width inner-page">
      <div className="section-heading">
        <div>
          <h1>My Tickets</h1>
          <p className="page-description">
            Your tickets and order details, all in one place.
          </p>
        </div>
      </div>
      {error && (
        <Alert className="notice error" variant="destructive">
          {error}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRetry((value) => value + 1)}
          >
            Try again
          </Button>
        </Alert>
      )}
      {username && !orders && !error && (
        <p className="loading">Loading tickets…</p>
      )}
      {username && orders?.length === 0 && (
        <ContentUnavailable title="No tickets yet" icon={<Ticket />} />
      )}
      <div className="ticket-list">
        {orders?.map((order) => (
          <article key={order.id}>
            <Card className="ticket-card">
              <CardHeader>
                <CardTitle>
                  <h2>{order.event.name}</h2>
                </CardTitle>
                <CardAction>
                  <Badge variant="secondary">
                    <Ticket aria-hidden="true" /> Confirmed
                  </Badge>
                </CardAction>
              </CardHeader>
              <CardContent>
                <div className="event-meta">
                  <span>
                    <CalendarDays aria-hidden="true" />
                    {eventDate(order.event.eventTime)}
                  </span>
                  <span>
                    <MapPin aria-hidden="true" />
                    {order.event.venue}
                  </span>
                </div>
                <div className="ticket-bottom">
                  <div>
                    <span>YOUR SEATS</span>
                    <strong>
                      {order.seats
                        .map(
                          (seat) =>
                            `${rowLabel(seat.rowIndex)}${seat.seatNumber + 1}`,
                        )
                        .join(' · ')}
                    </strong>
                  </div>
                  <div>
                    <span>TOTAL</span>
                    <strong>{money(order.totalAgorot)}</strong>
                  </div>
                  <div>
                    <span>ORDER</span>
                    <strong>#{order.id.slice(0, 8).toUpperCase()}</strong>
                  </div>
                </div>
              </CardContent>
            </Card>
          </article>
        ))}
      </div>
    </main>
  );
}
