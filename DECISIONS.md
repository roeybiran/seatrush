# Decisions

## Architecture

### Modules

- `web`: the web app (Next.js).
- `api`: the NestJS backend. Contains the root `AppModule` and the PostgreSQL `DatabaseModule`.

### Request flow

Fan selects seats
        |
        v
Create hold request
        |
        v
Begin transaction
        |
        v
Lock event row
        |
        v
Read database clock
        |
        v
Sale open and seats valid? ---- No ----> Return error
        |
       Yes
        v
Seats held or sold? ----------- Yes ---> Return unavailable
        |
        No
        v
Within user seat limit? ------- No ----> Return limit error
        |
       Yes
        v
Create hold and attach seats
        |
        v
Commit transaction
        |
        v
Return hold and expiry
        |
        v
Fan requests checkout
        |
        v
Begin transaction and lock event
        |
        v
Hold belongs to fan and is active?
        |                    |
       Yes                   No
        |                    |
        v                    v
Create order             Return error
        |
        v
Commit and return order

## Schema

- `events`, `holds`, `orders`, `seats` - what I believed to be the simplest for the app. State is effectively held per seat entity.

## Double selling

- Prevented with a database lock on the event row. Expiry is enforced at the DB level using its own clock.

## Assumptions

- Timezone agnostic app is OK.
- Zones cover continuous rows.

## Stack and libraries

- API: `NestJS` and `TypeORM`. `class-validator` and `class-transformer` for validations.
- App: `Next.js` for DX and easy routing. `shadcn` for UI components.

## Before a real launch

- Real authentication and authentication.
- Observability and logging.
- Replace polling with WebSockets for live seat updates.

## Two short answers

1. The row-level lock will delay all subsequent requests, this can considerably increase response times.
2. Protection will still work because it’s enforced at the DB level (assuming API copies will indeed share the DB).
