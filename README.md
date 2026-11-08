# SeatRush

SeatRush supports creating and viewing events, holding selected or best-available seats, releasing holds, and checking out.

## Quick start with Docker Compose

With Docker and the Compose plugin running, and ports 3000 and 5173 free, start PostgreSQL, the API, and the web app from the project root:

```sh
docker compose up --build
```

Open `http://localhost:5173`, choose a username, and open the on-sale demo event. The API and its interactive documentation are at `http://localhost:3000` and `http://localhost:3000/docs`; the OpenAPI JSON is at `http://localhost:3000/docs-json`. On API startup, migrations run automatically and a demo event is created with its drop already open. The seed runs only when that demo event is absent, so restarts preserve its holds and orders. PostgreSQL data persists in a Compose volume across restarts.

`HOLD_TTL_SECONDS` and `MAX_SEATS_PER_USER` default to 300 and 4. Set them in the shell or a root `.env` file before starting Compose to override them. Compose uses local development database credentials and exposes the web and API ports; the database is accessible only within the Compose network.

Stop the services with `docker compose down`. The data volume is retained. A new database volume gets a fresh demo event; its event date is set one year after initial seeding.

## Fan identification and known gaps

Choose any username on the login screen; use Log out to switch. The username is kept in the browser tab's session storage, so separate tabs or windows can act as different fans. A fan's active hold is also loaded from the API, so the same fan can finish it from another tab or after a reload. The API uses the trimmed, case-sensitive `X-Username` header. This is an assignment simplification, not authentication: anyone can impersonate a username. Checkout is simulated and does not process payment.

The optional no-lone-seat rule and promo codes are not implemented. Events are created through the API; there is no admin screen. The event-level lock favors correctness over high-volume throughput, and the application has not been prepared for a production launch.

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

The API listens on port 3000 by default; set `PORT` to use another local port if needed. When running outside Compose, run migrations manually after installing or updating the API. The environment values in `.env.example` are examples; the API reads environment variables from the process and does not load that file automatically.

In a second terminal, start the web app on port 5173:

```sh
cd web
npm ci
npm run dev
```

Open `http://localhost:5173`. The web app proxies API requests to `http://127.0.0.1:3000`; set `API_URL` before starting Next.js if the API runs elsewhere. Usernames are stored in the browser tab’s session storage, so two windows can use different names. The app polls the seat map and the fan's active holds every five seconds.

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

Identify a fan with the `X-Username` header. Usernames are trimmed and case-sensitive; they are not authenticated and can be impersonated. `POST /events/:eventId/holds` accepts `{ "seats": [{ "rowIndex": 1, "seatNumber": 7 }] }` and holds one to four distinct seats together as one request. Row indexes are zero-based (0 is row A, nearest the stage) and seat numbers start at 1, so the example holds seat B7. If a seat is taken the API answers 409 with a message such as "Someone just took B7." and the taken seats in `seats`. The response includes a hold ID, coordinates, prices, expiry, and server time. `DELETE /events/:eventId/holds/:holdId` releases an active hold belonging to that username. `GET /events/:eventId/holds` lists that username's active holds for the event (unexpired and not checked out), which lets a fan resume a hold in another tab.

`POST /events/:eventId/holds/best-available` accepts `{ "count": 2, "zoneNumber": 0, "maxPriceAgorot": 20000 }`; the zone and maximum price are optional. It holds consecutive seats in the closest eligible row, preferring the center and then the lower seat number. The response is the same as for a selected-seat hold.

`POST /events/:eventId/holds/:holdId/checkout` creates an order for an unexpired hold owned by the supplied username. Its response contains the order ID, hold and event IDs, seat coordinates and prices, and total in agorot. Repeating checkout returns the same order, even after the hold has expired.

`HOLD_TTL_SECONDS` controls the lifetime (default 300) and `MAX_SEATS_PER_USER` controls the per-event limit (default 4). Both must be positive integers; they are read when the API starts, and the API refuses to start if either is invalid. Released holds are deleted immediately; expired holds remain in the database but no longer block their seats. The limit also accounts for seats linked to an order.

## Account API

`GET /my-tickets` lists the orders for the username in `X-Username`. Each order includes its ID, hold and event IDs, event name, venue and time, purchased seat coordinates and prices, and total in agorot. Orders are sorted by event time; an account with no orders receives an empty array. Active and expired holds do not appear until checkout succeeds.

## Tests

The tests require Node.js and npm, API dependencies, and a reachable PostgreSQL database whose user can create schemas. For example, start the development database described above and install dependencies once with `npm --prefix api ci`. Then run this command from the project root:

```sh
DATABASE_URL=postgresql://seatrush:seatrush@localhost:55432/seatrush npm --prefix api test
```

Use a different `DATABASE_URL` if your database is elsewhere. The Compose database is not published to the host, so this example uses the separate local development container. The Vitest end-to-end tests live in `api/test` and use Nest's testing module and Supertest. They use temporary PostgreSQL schemas and remove them when complete; they do not use or erase existing event tables. The tests cover atomic holds, per-fan limits, expiry, the specified best-available example, checkout retries, ownership, and 50 competing requests for one seat.
