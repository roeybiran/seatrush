# Decisions

## Current implementation

- NestJS serves the API; TypeORM manages PostgreSQL access and versioned migrations. Event creation validates its input and writes the event, zones, rows, and seats in a single transaction.
- `events` stores event details and dimensions; `zones` stores names and prices; `event_rows` orders and assigns each row to a zone; `seats` stores the numbered positions. Foreign keys ensure zones and rows belong to the same event.
- Each event has equally sized rows and each row belongs to exactly one zone. Row labels are uppercase spreadsheet-style labels, starting with A nearest the stage. Zone names are unique within an event after trimming and are case-sensitive.
- Input times require an ISO 8601 timezone. Prices are nonnegative integer agorot. To bound allocation during creation, an event may have at most 702 rows, 10,000 seats per row, and 100,000 seats total.
- Event maps report every seat as available until holds and checkout are implemented. The required expiry and double-sale protections are not implemented yet.
- Tests create an isolated schema in the configured PostgreSQL database, apply the real migrations, and remove that schema afterward. The database user must have schema-creation permission.

## Remaining work

Implement inventory concurrency and expiry, best available, checkout, the fan UI, API docs, automatic startup and demo seeding, and the assignment's required hold tests. Production authentication and scaling are outside the current milestone.
