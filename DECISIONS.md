# Decisions

## Architecture and request flow

- The web app uses Next.js, React, TypeScript, Tailwind CSS, and shadcn/ui-style components. It polls the API every five seconds and proxies `/api` requests through Next.js. It keeps the username and active hold in tab session storage; PostgreSQL stores events, inventory, holds, and orders.
- The NestJS API uses TypeORM and PostgreSQL. Controllers validate requests and delegate to services for events, holds and checkout, and account tickets. OpenAPI documentation is generated from the API. Compose runs PostgreSQL, API, and web services. PostgreSQL transactions and row locks provide the inventory guarantees; TypeORM supplies migrations and database access. NestJS gives the API a structured module layout, and the UI components provide reusable controls.
- For a selected-seat hold, the web app sends the seat coordinates and `X-Username`. The API validates the request, begins a transaction, locks the event row, reads database time, checks drop time, availability, and the fan limit, then creates a hold and attaches all seats before committing. Best available selects a block inside the same lock and transaction.

## Schema and inventory

- NestJS serves the API; TypeORM manages PostgreSQL access and versioned migrations. Event creation validates its input and writes the event, zones, rows, and seats in a single transaction.
- `events` stores event details and dimensions; `seats` stores zero-based coordinates, zone number, price, and an optional hold ID. Zone details and rows are derived from the seats. `holds` records ownership and expiry; a linked `orders` record identifies a checked-out hold. Foreign keys enforce event consistency.
- Each event has equally sized rows and each row belongs to exactly one zone. Each zone covers one continuous range of rows, with zero-based inclusive start and end indexes; ranges must cover all rows without overlapping. Zone numbers are zero-based in request order and are displayed as one-based numbers. The API identifies seats by event ID, zero-based row index, and zero-based seat number; the frontend displays row indexes as letters and seat numbers starting at 1.
- Prices are nonnegative integer agorot. To bound allocation during creation, an event may have at most 702 rows, 10,000 seats per row, and 100,000 seats total.
- Seats within the same zone repeat its price. Event creation assigns consistent zone and price values, and price editing is not currently supported.
- Hold, best-available, release, and checkout transactions lock the event row before reading the database clock and inventory. The same lock serializes competing requests across API copies. Released holds are deleted immediately; expired holds remain stored, but the expiry predicate keeps their seats available without a cleanup job.
- The fan limit counts seats in unexpired holds and holds associated with an order. Orders link to holds; their seats and total are derived from the associated seats. Prices cannot be edited, so the prices at checkout remain the prices assigned when the hold was created.
- Tests create an isolated schema in the configured PostgreSQL database, apply the real migrations, and remove that schema afterward. The database user must have schema-creation permission.
- Compose waits for PostgreSQL before running API migrations and an idempotent demo seed. The demo event has a fixed ID, so restarting does not replace its inventory or orders; its event time is set one year ahead when first created.

The event lock serializes all inventory changes for the same event, including best-available selection and checkout. The database clock is read after acquiring the lock, so a request waiting in line cannot use a stale expiry time. An order has a unique hold ID, and checkout returns that order on retry. Expired holds remain as records, but availability checks treat their seats as free unless an order exists.

## Assumptions

- The application is timezone agnostic: it does not require a particular timezone or apply a venue-specific timezone. Input times use ISO 8601 dates; date-time values without an offset are interpreted in the API server's local timezone.
- Fans are identified by a trimmed, case-sensitive username in `X-Username`. This is not authentication: anyone who knows a username can impersonate that fan.

## Before a real launch

Add real authentication and authorization, payment integration, operational monitoring, deployment and database recovery procedures, and load testing. The optional no-lone-seat and promo-code rules and an admin UI are not implemented.

At 100,000 fans in the first minute, the single event lock and PostgreSQL connections would likely become bottlenecks; five-second polling would add substantial read traffic. Queueing, caching, admission control, and a more scalable inventory design would need measurement and careful correctness review. Three API copies connected to the same PostgreSQL database still share the event-row lock, so the protection applies as long as every inventory writer follows the same locking protocol. This is a design claim; the integration suite does not exercise three separate API processes.
