# AI log

- Codex helped turn the assignment brief into product and technical design drafts. It proposed serializing each event's inventory changes with a PostgreSQL row lock and checking expiry against database time after acquiring the lock. These are design decisions to validate with integration and concurrency tests as the inventory features are implemented.
- Codex proposed NestJS for the API; the developer specified Next.js, TypeORM, and shadcn/ui for the intended stack. Codex created the initial NestJS and PostgreSQL connection setup and checked it with a connection test, which was subsequently removed at the developer's request.
- Codex initially selected TypeORM 0.3, then checked `npm audit` and changed to TypeORM 1.1 because the initial dependency tree had moderate advisories. The build and the connection test passed with the replacement.
