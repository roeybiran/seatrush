'use client';

import { useEffect, useState } from 'react';
import { Ticket } from 'lucide-react';
import { ContentUnavailable } from '@/components/ContentUnavailable';
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
        </div>
      </div>
      {error && (
        <div className="notice error" role="alert">
          {error}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRetry((value) => value + 1)}
          >
            Try again
          </Button>
        </div>
      )}
      {username && !orders && !error && (
        <p className="loading">Loading tickets…</p>
      )}
      {username && orders?.length === 0 && (
        <ContentUnavailable title="No tickets yet" icon={<Ticket />} />
      )}
      <div className="ticket-list">
        {orders?.map((order) => (
          <article key={order.id} className="ticket-card">
            <div className="ticket-content">
              <h2>{order.event.name}</h2>
              <div className="event-meta">
                <span>{eventDate(order.event.eventTime)}</span>
                <span>{order.event.venue}</span>
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
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
