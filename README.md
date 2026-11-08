# SeatRush

## Run

```sh
docker compose up --build
```

## Test

```sh
docker compose run --rm --build test
```

## Environment Variables

- `DATABASE_URL` — PostgreSQL connection URL; no application default.
- `PORT` — API listening port; defaults to `3000`.
- `HOLD_TTL_SECONDS` — hold lifetime in seconds; defaults to `300`.
- `MAX_SEATS_PER_USER` — maximum held and purchased seats per user per event; defaults to `4`.
- `API_URL` — backend destination for the web app’s API proxy; defaults to `http://127.0.0.1:3000`.
- `POSTGRES_USER` — PostgreSQL container username.
- `POSTGRES_PASSWORD` — PostgreSQL container password.
- `POSTGRES_DB` — PostgreSQL container database name.

## Fan identification

By username (`X-Username` header).

## Known gaps

- Extra credit milestones weren’t implemented (admin screen etc.).
- Authentication and authorization.
