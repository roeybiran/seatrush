'use client';

import {
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import Link from 'next/link';
import { ArrowLeft, CalendarDays, MapPin } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { Input } from '@/components/ui/input';
import { useSession } from '@/components/SessionProvider';
import {
  api,
  ApiError,
  eventDate,
  money,
  rowLabel,
  type EventDetail,
  type Hold,
  type Seat,
} from '@/lib/api';

type Coordinate = { rowIndex: number; seatNumber: number };

type SavedHold = {
  hold: Hold;
  clockOffset: number;
  checkoutAttempted: boolean;
};

const zoneColor = (zone: number) => `var(--zone-${zone % 6})`;

export default function EventPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = use(params);
  const { username } = useSession();

  return <EventExperience key={`${eventId}:${username}`} eventId={eventId} />;
}

function EventExperience({ eventId }: { eventId: string }) {
  const { username } = useSession();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [selected, setSelected] = useState<Coordinate[]>([]);
  const [clockOffset, setClockOffset] = useState(0);
  const [now, setNow] = useState(0);
  const [count, setCount] = useState(2);
  const [zone, setZone] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const holdChangedAt = useRef(0);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [pollError, setPollError] = useState(false);
  const [orderId, setOrderId] = useState('');
  // Every active hold this fan has for the event, including ones made in other tabs.
  const [serverHolds, setServerHolds] = useState<Hold[]>([]);
  const storageKey = `seatrush-hold:${eventId}:${username}`;
  const storedHold = useSyncExternalStore(
    (notify) => {
      window.addEventListener('seatrush-hold', notify);
      window.addEventListener('storage', notify);
      return () => {
        window.removeEventListener('seatrush-hold', notify);
        window.removeEventListener('storage', notify);
      };
    },
    () => sessionStorage.getItem(storageKey),
    () => null,
  );
  const currentSaved = useMemo(() => {
    try {
      return storedHold ? (JSON.parse(storedHold) as SavedHold) : null;
    } catch {
      return null;
    }
  }, [storedHold]);

  const refresh = useCallback(async () => {
    const value = await api<EventDetail>(`/events/${eventId}`);
    setEvent(value);
    setClockOffset(new Date(value.serverTime).getTime() - Date.now());
    setPollError(false);
    return value;
  }, [eventId]);

  useEffect(() => {
    let active = true;
    // Keep this tab's hold in step with the server, so a hold made in another tab
    // (or before a reload) can be finished here, and one released elsewhere disappears.
    async function syncHold() {
      const startedAt = Date.now();
      const holds = await api<Hold[]>(`/events/${eventId}/holds`, {}, username);
      if (active) setServerHolds(holds);
      // Ignore a list fetched before this tab last held, released or checked out.
      if (!active || pending.current || holdChangedAt.current >= startedAt)
        return;
      const raw = sessionStorage.getItem(storageKey);
      let saved: SavedHold | null = null;
      try {
        saved = raw ? (JSON.parse(raw) as SavedHold) : null;
      } catch {}
      const latest = holds.at(-1);
      if (!saved && latest) {
        sessionStorage.setItem(
          storageKey,
          JSON.stringify({
            hold: latest,
            clockOffset: new Date(latest.serverTime).getTime() - Date.now(),
            checkoutAttempted: false,
          } satisfies SavedHold),
        );
      } else if (
        saved &&
        !saved.checkoutAttempted &&
        new Date(saved.hold.expiresAt).getTime() >
          Date.now() + saved.clockOffset &&
        !holds.some((item) => item.id === saved.hold.id)
      ) {
        sessionStorage.removeItem(storageKey);
      } else return;
      setNow(Date.now());
      window.dispatchEvent(new Event('seatrush-hold'));
    }

    async function load() {
      try {
        const [value] = await Promise.all([
          api<EventDetail>(`/events/${eventId}`),
          username ? syncHold() : undefined,
        ]);
        if (active) {
          setEvent(value);
          setNow(Date.now());
          setClockOffset(new Date(value.serverTime).getTime() - Date.now());
          setPollError(false);
          setLoadError('');
        }
      } catch (reason) {
        if (active) {
          setPollError(true);
          setLoadError(
            reason instanceof Error ? reason.message : 'Could not load event.',
          );
        }
      }
    }
    load();
    const poll = setInterval(load, 5000);
    const tick = setInterval(() => setNow(Date.now()), 1000);

    return () => {
      active = false;
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [eventId, storageKey, username]);

  const hold = currentSaved?.hold ?? null;
  const secondsLeft = hold
    ? Math.max(
        0,
        Math.ceil(
          (new Date(hold.expiresAt).getTime() -
            (now + currentSaved!.clockOffset)) /
            1000,
        ),
      )
    : 0;

  useEffect(() => {
    if (hold && secondsLeft === 0) refresh().catch(() => setPollError(true));
  }, [hold, secondsLeft, refresh]);

  const dropOpen = event
    ? now + clockOffset >= new Date(event.dropTime).getTime()
    : false;
  const selectionTotal = selected.reduce(
    (total, coordinate) =>
      total +
      (event?.zones.find(
        (item) =>
          item.number ===
          event.rows.find((row) => row.rowIndex === coordinate.rowIndex)
            ?.zoneNumber,
      )?.priceAgorot ?? 0),
    0,
  );
  function saveHold(value: SavedHold | null) {
    holdChangedAt.current = Date.now();
    setNow(Date.now());
    // A released or checked-out hold must not reappear as "other" before the next poll.
    if (!value)
      setServerHolds((previous) =>
        previous.filter((item) => item.id !== currentSaved?.hold.id),
      );
    if (value) sessionStorage.setItem(storageKey, JSON.stringify(value));
    else sessionStorage.removeItem(storageKey);
    window.dispatchEvent(new Event('seatrush-hold'));
  }

  async function action(
    path: string,
    method: 'POST' | 'DELETE',
    body?: unknown,
  ) {
    if (pending.current || !username) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await api<Hold>(
        path,
        { method, ...(body ? { body: JSON.stringify(body) } : {}) },
        username,
      );
      if (method === 'DELETE') saveHold(null);
      else {
        saveHold({
          hold: result,
          clockOffset: new Date(result.serverTime).getTime() - Date.now(),
          checkoutAttempted: false,
        });
        setSelected([]);
      }
      await refresh().catch(() => setPollError(true));
    } catch (reason) {
      if (
        reason instanceof ApiError &&
        reason.code === 'SEATS_UNAVAILABLE' &&
        reason.seats?.length
      ) {
        // The server names who has the seats: a rival or this fan's other hold.
        setError(`${reason.message} Please choose again.`);
        setSelected((previous) =>
          previous.filter(
            (seat) =>
              !reason.seats!.some(
                (taken) =>
                  taken.rowIndex === seat.rowIndex &&
                  taken.seatNumber === seat.seatNumber,
              ),
          ),
        );
      } else
        setError(
          reason instanceof Error
            ? reason.message
            : 'Something went wrong. Please try again.',
        );
      await refresh().catch(() => setPollError(true));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  async function checkout() {
    if (!hold || !currentSaved || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    saveHold({ ...currentSaved, checkoutAttempted: true });
    try {
      const order = await api<{ id: string }>(
        `/events/${eventId}/holds/${hold.id}/checkout`,
        { method: 'POST' },
        username,
      );
      saveHold(null);
      setOrderId(order.id);
      await refresh().catch(() => setPollError(true));
    } catch (reason) {
      setError(
        // Only a lost connection or server failure leaves the outcome unknown.
        reason instanceof ApiError &&
          (reason.status === undefined || reason.status >= 500)
          ? `${reason.message} If checkout may have completed, try again to retrieve your order.`
          : reason instanceof Error
            ? reason.message
            : 'Could not check out. Please try again.',
      );
      await refresh().catch(() => setPollError(true));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  function toggle(seat: Coordinate) {
    setError('');
    if (
      selected.length >= 4 &&
      !selected.some(
        (item) =>
          item.rowIndex === seat.rowIndex &&
          item.seatNumber === seat.seatNumber,
      )
    ) {
      setError('You can select up to 4 seats at a time.');
      return;
    }
    setSelected((previous) => {
      if (
        previous.some(
          (item) =>
            item.rowIndex === seat.rowIndex &&
            item.seatNumber === seat.seatNumber,
        )
      )
        return previous.filter(
          (item) =>
            item.rowIndex !== seat.rowIndex ||
            item.seatNumber !== seat.seatNumber,
        );
      return [...previous, seat];
    });
  }

  const holdSeats = (seats: Seat[] | Coordinate[]) =>
    seats
      .map((seat) => `${rowLabel(seat.rowIndex)}${seat.seatNumber}`)
      .join(', ');
  const otherHolds = serverHolds.filter(
    (item) =>
      item.id !== hold?.id &&
      new Date(item.expiresAt).getTime() > now + clockOffset,
  );

  return (
    <main id="main" className="page-width inner-page">
      <Link className="back-link" href="/events">
        <ArrowLeft aria-hidden="true" /> All events
      </Link>
      {!event ? (
        <div
          className={loadError ? 'notice error' : 'loading'}
          role={loadError ? 'alert' : undefined}
        >
          {loadError || 'Loading event…'}
        </div>
      ) : (
        <>
          <div className="event-heading">
            <div>
              <h1>{event.name}</h1>
              <div className="detail-meta">
                <span>
                  <CalendarDays aria-hidden="true" />
                  {eventDate(event.eventTime)}
                </span>
                <span>
                  <MapPin aria-hidden="true" />
                  {event.venue}
                </span>
              </div>
            </div>
            <Badge
              variant="outline"
              className={`sale-pill ${dropOpen ? '' : 'upcoming'}`}
            >
              {dropOpen ? 'On sale' : `On sale ${eventDate(event.dropTime)}`}
            </Badge>
          </div>
          {orderId && (
            <Alert className="notice success" role="status">
              Checkout complete. <Link href="/my-tickets">View My Tickets</Link>
            </Alert>
          )}
          {pollError && (
            <Alert className="notice error" variant="destructive" role="status">
              Couldn’t refresh the seat map. We’ll keep trying.
            </Alert>
          )}
          {error && (
            <Alert className="notice error" variant="destructive">
              {error}
            </Alert>
          )}
          <div className="booking-layout">
            <section aria-label="Seats">
              <Card className="map-panel">
                <CardHeader>
                  <CardTitle>
                    <h2>Choose your seats</h2>
                  </CardTitle>
                  <CardDescription>
                    Select up to 4 seats from the map below.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="stage">Stage</div>
                  <div
                    className="seat-scroll"
                    role="region"
                    aria-label="Seat map; scroll horizontally to view all seats"
                    tabIndex={0}
                  >
                    <div className="seat-map">
                      {event.rows.map((row, index) => {
                        const zone = event.zones[row.zoneNumber];
                        const startsZone =
                          index === 0 ||
                          event.rows[index - 1].zoneNumber !== row.zoneNumber;
                        return (
                          <div
                            key={row.rowIndex}
                            style={
                              {
                                '--zone': zoneColor(row.zoneNumber),
                              } as React.CSSProperties
                            }
                          >
                            {startsZone && zone && (
                              <div className="zone-heading">
                                <span
                                  className="zone-swatch"
                                  aria-hidden="true"
                                />
                                Zone {zone.number + 1}
                                <strong>{money(zone.priceAgorot)}</strong>
                              </div>
                            )}
                            <div className="seat-row">
                              <span className="row-label">
                                {rowLabel(row.rowIndex)}
                              </span>
                              {row.seats.map((seat) => {
                                const isSelected = selected.some(
                                  (item) =>
                                    item.rowIndex === row.rowIndex &&
                                    item.seatNumber === seat.seatNumber,
                                );
                                const isMine =
                                  hold?.seats.some(
                                    (item) =>
                                      item.rowIndex === row.rowIndex &&
                                      item.seatNumber === seat.seatNumber,
                                  ) && secondsLeft > 0;
                                return (
                                  <Button
                                    variant="outline"
                                    key={seat.seatNumber}
                                    type="button"
                                    className={`seat disabled:opacity-100 seat-${isMine ? 'mine' : isSelected ? 'selected' : seat.status}`}
                                    disabled={
                                      seat.status !== 'available' ||
                                      !!hold ||
                                      !dropOpen ||
                                      !username ||
                                      busy
                                    }
                                    aria-pressed={isSelected}
                                    aria-label={`Row ${rowLabel(row.rowIndex)}, seat ${seat.seatNumber}, zone ${row.zoneNumber + 1}, ${isMine ? 'your hold' : isSelected ? 'selected' : seat.status}`}
                                    title={`${rowLabel(row.rowIndex)}${seat.seatNumber} · ${isMine ? 'your hold' : seat.status}`}
                                    onClick={() =>
                                      toggle({
                                        rowIndex: row.rowIndex,
                                        seatNumber: seat.seatNumber,
                                      })
                                    }
                                  >
                                    {seat.seatNumber}
                                  </Button>
                                );
                              })}
                              <span className="row-label">
                                {rowLabel(row.rowIndex)}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="legend">
                    <span>
                      <i className="legend-seat available" /> Available
                    </span>
                    <span>
                      <i className="legend-seat selected" /> Selected
                    </span>
                    <span>
                      <i className="legend-seat held" /> Held
                    </span>
                    <span>
                      <i className="legend-seat sold" /> Sold
                    </span>
                  </div>
                  <div className="zones">
                    {event.zones.map((item) => (
                      <span
                        key={item.number}
                        style={
                          {
                            '--zone': zoneColor(item.number),
                          } as React.CSSProperties
                        }
                      >
                        <i className="zone-swatch" aria-hidden="true" />
                        Zone {item.number + 1}{' '}
                        <strong>{money(item.priceAgorot)}</strong>{' '}
                        <small>
                          · Rows {rowLabel(item.startRow)}–
                          {rowLabel(item.endRow)}
                        </small>
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </section>
            <aside className="booking-sidebar" aria-label="Booking details">
              {otherHolds.length > 0 && (
                <Card className="sidebar-card">
                  <CardHeader>
                    <CardTitle>
                      <h2>Your other holds</h2>
                    </CardTitle>
                    <CardDescription>
                      These seats are held for you, made in another tab or
                      window, and count toward your seat limit.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {otherHolds.map((item) => (
                      <div className="summary-line" key={item.id}>
                        <span>{holdSeats(item.seats)}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => {
                            setError('');
                            saveHold({
                              hold: item,
                              clockOffset:
                                new Date(item.serverTime).getTime() -
                                Date.now(),
                              checkoutAttempted: false,
                            });
                          }}
                        >
                          Show
                        </Button>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
              {hold ? (
                <Card className="sidebar-card">
                  <CardHeader>
                    <CardTitle>
                      <h2>{secondsLeft ? 'Held seats' : 'Hold expired'}</h2>
                    </CardTitle>
                    <CardDescription>
                      {secondsLeft
                        ? 'Your seats are reserved temporarily.'
                        : 'Choose seats again to continue.'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div
                      className={`timer ${secondsLeft < 60 ? 'timer-urgent' : ''}`}
                    >
                      <strong>
                        {String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:
                        {String(secondsLeft % 60).padStart(2, '0')}
                      </strong>
                      <span>
                        {secondsLeft > 0 && secondsLeft < 60
                          ? 'Less than a minute left'
                          : 'remaining'}
                      </span>
                    </div>
                    <div className="summary-line">
                      <span>Seats</span>
                      <strong>{holdSeats(hold.seats)}</strong>
                    </div>
                    <div className="summary-line total">
                      <span>Total</span>
                      <strong>
                        {money(
                          hold.seats.reduce(
                            (total, seat) => total + seat.priceAgorot,
                            0,
                          ),
                        )}
                      </strong>
                    </div>
                    <Button
                      className="w-full"
                      size="lg"
                      disabled={
                        busy ||
                        (!secondsLeft && !currentSaved?.checkoutAttempted)
                      }
                      onClick={checkout}
                    >
                      {busy
                        ? 'Working…'
                        : !secondsLeft && currentSaved?.checkoutAttempted
                          ? 'Retry checkout'
                          : 'Complete checkout'}{' '}
                    </Button>
                    {secondsLeft > 0 ? (
                      <Button
                        className="w-full mt-2"
                        variant="ghost"
                        disabled={busy}
                        onClick={() =>
                          action(
                            `/events/${eventId}/holds/${hold.id}`,
                            'DELETE',
                          )
                        }
                      >
                        Release seats
                      </Button>
                    ) : (
                      <Button
                        className="w-full mt-2"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => {
                          saveHold(null);
                          setError('');
                          refresh().catch(() => setPollError(true));
                        }}
                      >
                        Choose new seats
                      </Button>
                    )}
                    <p className="small-note">
                      No payment required. Your tickets will appear in My
                      Tickets.
                      {secondsLeft > 0 &&
                        ' To choose more seats, check out or release these first.'}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <>
                  <Card className="sidebar-card">
                    <CardHeader>
                      <CardTitle>
                        <h2>Selection</h2>
                      </CardTitle>
                      <CardDescription>
                        {selected.length
                          ? `${selected.length} seat${selected.length === 1 ? '' : 's'} selected`
                          : 'Select seats to get started.'}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="summary-line">
                        <span>Seats</span>
                        <strong>
                          {selected.length ? holdSeats(selected) : '—'}
                        </strong>
                      </div>
                      <div className="summary-line total">
                        <span>Estimated total</span>
                        <strong>{money(selectionTotal)}</strong>
                      </div>
                      <Button
                        className="w-full"
                        size="lg"
                        disabled={
                          !username || !dropOpen || !selected.length || busy
                        }
                        onClick={() =>
                          action(`/events/${eventId}/holds`, 'POST', {
                            seats: selected,
                          })
                        }
                      >
                        {busy ? 'Holding seats…' : 'Hold selected seats'}{' '}
                      </Button>
                      <p className="small-note">
                        Your seats are held temporarily while you check out.
                      </p>
                    </CardContent>
                  </Card>
                  <form
                    className="best-card"
                    onSubmit={(submit) => {
                      submit.preventDefault();
                      const options: {
                        count: number;
                        zoneNumber?: number;
                        maxPriceAgorot?: number;
                      } = { count };
                      if (zone !== '') options.zoneNumber = Number(zone);
                      if (maxPrice !== '')
                        options.maxPriceAgorot = Math.round(
                          Number(maxPrice) * 100,
                        );
                      action(
                        `/events/${eventId}/holds/best-available`,
                        'POST',
                        options,
                      );
                    }}
                  >
                    <Card className="form-card">
                      <CardHeader>
                        <CardTitle>
                          <h2>Best available</h2>
                        </CardTitle>
                        <CardDescription>
                          Choose your preferences and we’ll find seats for you.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <FieldGroup>
                          <Field>
                            <FieldLabel htmlFor="count">
                              Number of seats
                            </FieldLabel>
                            <NativeSelect
                              className="w-full"
                              id="count"
                              name="count"
                              value={count}
                              onChange={(change) =>
                                setCount(Number(change.target.value))
                              }
                            >
                              {[1, 2, 3, 4].map((number) => (
                                <NativeSelectOption key={number} value={number}>
                                  {number} {number === 1 ? 'seat' : 'seats'}
                                </NativeSelectOption>
                              ))}
                            </NativeSelect>
                          </Field>
                          <Field>
                            <FieldLabel htmlFor="zone">
                              Zone <small>optional</small>
                            </FieldLabel>
                            <NativeSelect
                              className="w-full"
                              id="zone"
                              name="zone"
                              value={zone}
                              onChange={(change) =>
                                setZone(change.target.value)
                              }
                            >
                              <NativeSelectOption value="">
                                Any zone
                              </NativeSelectOption>
                              {event.zones.map((item) => (
                                <NativeSelectOption
                                  key={item.number}
                                  value={item.number}
                                >
                                  Zone {item.number + 1} ·{' '}
                                  {money(item.priceAgorot)}
                                </NativeSelectOption>
                              ))}
                            </NativeSelect>
                          </Field>
                          <Field>
                            <FieldLabel htmlFor="max-price">
                              Max price per seat (₪) <small>optional</small>
                            </FieldLabel>
                            <Input
                              id="max-price"
                              name="maxPrice"
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="No maximum"
                              value={maxPrice}
                              onChange={(change) =>
                                setMaxPrice(change.target.value)
                              }
                            />
                          </Field>
                        </FieldGroup>
                      </CardContent>
                      <CardFooter>
                        <Button
                          type="submit"
                          disabled={!username || !dropOpen || busy}
                        >
                          Find seats
                        </Button>
                      </CardFooter>
                    </Card>
                  </form>
                </>
              )}
            </aside>
          </div>
        </>
      )}
    </main>
  );
}
