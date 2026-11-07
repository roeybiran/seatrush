# SeatRush

SeatRush supports creating and viewing events, holding selected or best-available seats, releasing holds, and checking out. The web app and final Compose setup are not implemented yet.

## Local development

Requires Node.js 22.13 or later within the 22.x line, or 24.11 or later, plus npm and PostgreSQL. For a disposable local development database, start Docker and run:

```sh
docker run -d --name seatrush-postgres -e POSTGRES_USER=seatrush -e POSTGRES_PASSWORD=seatrush -e POSTGRES_DB=seatrush -p 127.0.0.1:55432:5432 postgres:17
```

The container persists until removed; on subsequent runs, start it with `docker start seatrush-postgres`. Alternatively, use an existing PostgreSQL database and provide its connection URL. The credentials above are for local development only.

```sh
cd api
npm ci
export DATABASE_URL=postgresql://seatrush:seatrush@localhost:55432/seatrush
npm run migration:run
npm run start:dev
```

The API listens on port 3000 by default; set `PORT` to use another local port if needed. Run migrations after installing or updating the API; they are not run automatically yet. The environment values in `.env.example` are examples; the API reads environment variables from the process and does not load that file automatically.

Interactive API documentation is available at `http://localhost:3000/docs`, and the OpenAPI JSON at `http://localhost:3000/docs-json`. Fan endpoints accept `X-Username` in the documentation UI.

## Events API

`POST /events` creates an event, its zones, rows, and seats atomically. Each zone specifies an inclusive, zero-based `startRow` and `endRow`; ranges must cover every row exactly once. Zones are numbered from zero in request order. Times are ISO 8601 dates; date-time values without an offset use the API server's local timezone. Prices are integer agorot.

```sh
curl -X POST http://localhost:3000/events \
  -H 'Content-Type: application/json' \
  -d '{"name":"Opening Night","venue":"Main Hall","eventTime":"2030-07-01T20:00:00Z","dropTime":"2030-06-01T10:00:00Z","rowCount":3,"seatsPerRow":8,"zones":[{"startRow":0,"endRow":0,"priceAgorot":20000},{"startRow":1,"endRow":2,"priceAgorot":12000}]}'
```

`GET /events` lists events, and `GET /events/:eventId` returns a seat map grouped into ordered rows with zone numbers, prices, and server time. Seats linked to an order report `sold`, seats with unexpired holds report `held`, and the rest report `available`. See [DECISIONS.md](DECISIONS.md) for input limits and assumptions.

## Holds API

Identify a fan with the `X-Username` header. Usernames are trimmed and case-sensitive; they are not authenticated and can be impersonated. `POST /events/:eventId/holds` accepts `{ "seats": [{ "rowIndex": 0, "seatNumber": 0 }] }` and holds one to four distinct seats together as one request. Row indexes and seat numbers are zero-based; the frontend will show seat numbers starting at 1. The response includes a hold ID, coordinates, prices, expiry, and server time. `DELETE /events/:eventId/holds/:holdId` releases an active hold belonging to that username.

`POST /events/:eventId/holds/best-available` accepts `{ "count": 2, "zoneNumber": 0, "maxPriceAgorot": 20000 }`; the zone and maximum price are optional. It holds consecutive seats in the closest eligible row, preferring the center and then the lower seat number. The response is the same as for a selected-seat hold.

`POST /events/:eventId/holds/:holdId/checkout` creates an order for an unexpired hold owned by the supplied username. Its response contains the order ID, hold and event IDs, seat coordinates and prices, and total in agorot. Repeating checkout returns the same order, even after the hold has expired.

`HOLD_TTL_SECONDS` controls the lifetime (default 300) and `MAX_SEATS_PER_USER` controls the per-event limit (default 4). Both are positive integers read when the API starts. Released holds are deleted immediately; expired holds remain in the database but no longer block their seats. The limit also accounts for seats linked to an order.

## Account API

`GET /my-account` lists the orders for the username in `X-Username`. Each order includes its ID, hold and event IDs, event name, venue and time, purchased seat coordinates and prices, and total in agorot. Orders are sorted by event time; an account with no orders receives an empty array. Active and expired holds do not appear until checkout succeeds.

## Tests

With `DATABASE_URL` set, run the test command from the project root:

```sh
cd api
npm test
```

The Vitest end-to-end tests live in `api/test` and use Nest's testing module and Supertest. They use temporary PostgreSQL schemas and remove them when complete. The configured database user needs permission to create schemas. Tests do not use or erase the existing event tables. The tests cover best-available ranking and filters, concurrent seat selection, checkout retries, ownership, expiry, and competing requests.
