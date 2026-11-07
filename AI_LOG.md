# AI log

- Codex helped turn the assignment brief into product and technical design drafts. It proposed serializing each event's inventory changes with a PostgreSQL row lock and checking expiry against database time after acquiring the lock. These are design decisions to validate with integration and concurrency tests as the inventory features are implemented.
- Codex proposed NestJS for the API; the developer specified Next.js, TypeORM, and shadcn/ui for the intended stack. Codex created the initial NestJS and PostgreSQL connection setup and checked it with a connection test, which was subsequently removed at the developer's request.
- Codex initially selected TypeORM 0.3, then checked `npm audit` and changed to TypeORM 1.1 because the initial dependency tree had moderate advisories. The build and the connection test passed with the replacement.
- Codex proposed an event schema with event-scoped foreign keys and a transaction for event creation. Integration tests exercise real PostgreSQL migrations, row and zone validation, and rollback when seat insertion fails.
- Codex implemented event-row locking and expiry-aware hold queries. PostgreSQL integration tests exercise 50-way seat contention and concurrent requests from one fan. Checkout is still pending, so these tests do not yet demonstrate protection against double sales.
