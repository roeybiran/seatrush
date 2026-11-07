# Decisions

## Current implementation

- NestJS serves the API; TypeORM manages PostgreSQL access and versioned migrations. Event creation validates its input and writes the event, zones, rows, and seats in a single transaction.
- `events` stores event details and dimensions; `zones` stores zero-based numbers and prices; `event_rows` orders and assigns each row to a zone; `seats` stores the numbered positions. Foreign keys ensure zones and rows belong to the same event.
- Each event has equally sized rows and each row belongs to exactly one zone. Each zone covers one continuous range of rows, with zero-based inclusive start and end indexes; ranges must cover all rows without overlapping. Zone numbers are zero-based in request order and can be displayed as one-based numbers. The API derives uppercase spreadsheet-style row labels, starting with A nearest the stage.
- Prices are nonnegative integer agorot. To bound allocation during creation, an event may have at most 702 rows, 10,000 seats per row, and 100,000 seats total.
- Event maps report every seat as available until holds and checkout are implemented. The required expiry and double-sale protections are not implemented yet.
- Tests create an isolated schema in the configured PostgreSQL database, apply the real migrations, and remove that schema afterward. The database user must have schema-creation permission.

## Assumptions

- The application is timezone agnostic: it does not require a particular timezone or apply a venue-specific timezone. Input times use ISO 8601 dates; date-time values without an offset are interpreted in the API server's local timezone.

## Remaining work

Implement inventory concurrency and expiry, best available, checkout, the fan UI, API docs, automatic startup and demo seeding, and the assignment's required hold tests. Production authentication and scaling are outside the current milestone.
