export type Seat = {
  rowIndex: number;
  seatNumber: number;
  priceAgorot: number;
};

export type EventSummary = {
  id: string;
  name: string;
  venue: string;
  eventTime: string;
  dropTime: string;
  rowCount: number;
  seatsPerRow: number;
};

export type EventDetail = EventSummary & {
  serverTime: string;
  zones: Array<{
    number: number;
    priceAgorot: number;
    startRow: number;
    endRow: number;
  }>;
  rows: Array<{
    rowIndex: number;
    zoneNumber: number;
    seats: Array<{ seatNumber: number; status: 'available' | 'held' | 'sold' }>;
  }>;
};

export type Hold = {
  id: string;
  eventId: string;
  seats: Seat[];
  expiresAt: string;
  serverTime: string;
};

export type Order = {
  id: string;
  holdId: string;
  eventId: string;
  seats: Seat[];
  totalAgorot: number;
  event: { name: string; venue: string; eventTime: string };
};

export class ApiError extends Error {
  constructor(
    message: string,
    public code?: string,
    public seats?: Array<{ rowIndex: number; seatNumber: number }>,
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
  username?: string,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      cache: 'no-store',
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(username ? { 'X-Username': username } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new ApiError(
      'Could not reach the server. Please check your connection and try again.',
    );
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      typeof body?.message === 'string'
        ? body.message
        : 'Something went wrong. Please try again.',
      body?.code,
      body?.seats,
    );
  }
  return body as T;
}

export function rowLabel(index: number) {
  let label = '';
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26))
    label = String.fromCharCode(65 + ((value - 1) % 26)) + label;
  return label;
}

export function money(agorot: number) {
  return new Intl.NumberFormat('en-IL', {
    style: 'currency',
    currency: 'ILS',
  }).format(agorot / 100);
}

export function eventDate(date: string) {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}
