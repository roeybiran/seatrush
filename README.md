# SeatRush

SeatRush is in the foundation milestone. The NestJS API connects to PostgreSQL through TypeORM; event and ticketing functionality, the web app, and the final Compose setup are not implemented yet.

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
npm run start:dev
```

The API listens on port 3000 by default; set `PORT` to use another local port if needed. No endpoints are available yet. The environment values in `.env.example` are examples; the API reads environment variables from the process and does not load that file automatically.

## Tests

With PostgreSQL running and `DATABASE_URL` set as above, run:

```sh
cd api
npm test
```

The current integration test starts the NestJS application context and runs a read-only query through its TypeORM connection. Use a dedicated development or test database. The hold and concurrency tests will be added with their features.
