# SeatRush

SeatRush currently supports creating and viewing events and their seat maps. Holds, checkout, the web app, API documentation, and the final Compose setup are not implemented yet.

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

## Events API

`POST /events` creates an event, its zones, rows, and seats atomically. Each zone specifies an inclusive, zero-based `startRow` and `endRow`; ranges must cover every row exactly once. Zones are numbered from zero in request order. Times are ISO 8601 dates; date-time values without an offset use the API server's local timezone. Prices are integer agorot.

```sh
curl -X POST http://localhost:3000/events \
  -H 'Content-Type: application/json' \
  -d '{"name":"Opening Night","venue":"Main Hall","eventTime":"2030-07-01T20:00:00Z","dropTime":"2030-06-01T10:00:00Z","rowCount":3,"seatsPerRow":8,"zones":[{"startRow":0,"endRow":0,"priceAgorot":20000},{"startRow":1,"endRow":2,"priceAgorot":12000}]}'
```

`GET /events` lists events, and `GET /events/:eventId` returns a seat map grouped into ordered rows with zone numbers, prices, and server time. Seats currently report `available`; holds and sales are not implemented. See [DECISIONS.md](DECISIONS.md) for input limits and assumptions.

## Tests

With `DATABASE_URL` set, run the test command from the project root:

```sh
cd api
npm test
```

The Vitest end-to-end tests live in `api/test` and use Nest's testing module and Supertest. The event API tests use a temporary PostgreSQL schema and remove it when complete. The configured database user needs permission to create schemas. Tests do not use or erase the existing event tables. The hold and real-PostgreSQL contention tests required by the assignment will be added with their features.
