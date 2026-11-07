# Decisions

## Current implementation

- NestJS serves the API; TypeORM manages PostgreSQL access and versioned migrations. Event creation validates its input and writes the event, zones, rows, and seats in a single transaction.
- `events` stores event details and dimensions; `seats` stores zero-based coordinates, zone number, price, and an optional hold ID. Zone details and rows are derived from the seats. `holds` records ownership and expiry; a linked `orders` record identifies a checked-out hold. Foreign keys enforce event consistency.
- Each event has equally sized rows and each row belongs to exactly one zone. Each zone covers one continuous range of rows, with zero-based inclusive start and end indexes; ranges must cover all rows without overlapping. Zone numbers are zero-based in request order and can be displayed as one-based numbers. The API identifies seats by event ID, zero-based row index, and zero-based seat number; the frontend will display row indexes as letters and seat numbers starting at 1.
- Prices are nonnegative integer agorot. To bound allocation during creation, an event may have at most 702 rows, 10,000 seats per row, and 100,000 seats total.
- Seats within the same zone repeat its price. Event creation assigns consistent zone and price values, and price editing is not currently supported.
- Hold, best-available, release, and checkout transactions lock the event row before reading the database clock and inventory. The same lock serializes competing requests across API copies. Released holds are deleted immediately; expired holds remain stored, but the expiry predicate keeps their seats available without a cleanup job.
- The fan limit counts seats in unexpired holds and holds associated with an order. Orders link to holds; their seats and total are derived from the associated seats. Prices cannot be edited, so the prices at checkout remain the prices assigned when the hold was created.
- Tests create an isolated schema in the configured PostgreSQL database, apply the real migrations, and remove that schema afterward. The database user must have schema-creation permission.

## Assumptions

- The application is timezone agnostic: it does not require a particular timezone or apply a venue-specific timezone. Input times use ISO 8601 dates; date-time values without an offset are interpreted in the API server's local timezone.
- Fans are identified by a trimmed, case-sensitive username in `X-Username`. This is not authentication: anyone who knows a username can impersonate that fan.

## Remaining work

Implement the fan UI, automatic startup and demo seeding, and the remaining assignment tests. Production authentication and scaling are outside the current milestone.
