# Ticket Sales API

A PostgreSQL-backed ticket reservation API built with Node.js and Express.

## Features

- 3 related database tables
- Foreign-key relationships
- 10 events
- 10,000 seats
- Free-seat listing API
- Seat reservation API
- Prevents duplicate seat reservations
- Safe against concurrent requests for the same seat
- Indexed free-seat query
- Query-plan comparison before and after indexing

## Tech Stack

- Node.js
- Express.js
- PostgreSQL
- pg
- dotenv

## Database Design

The database contains three related tables:

### events

Stores event information.

- `id`
- `name`
- `venue`
- `event_date`

### seats

Stores seats belonging to events.

- `id`
- `event_id`
- `seat_number`
- `status`

`event_id` is a foreign key referencing `events(id)`.

Each event and seat number combination is unique.

### orders

Stores successful seat reservations.

- `id`
- `seat_id`
- `customer_name`
- `reserved_at`

`seat_id` is a foreign key referencing `seats(id)`.

Each seat can have at most one order because of a unique constraint on `seat_id`.

## Relationships

```text
events
   |
   | 1-to-many
   v
seats
   |
   | 1-to-one reservation
   v
orders

Setup
1. Install dependencies
npm install
2. Configure environment variables

Create a .env file:

PORT=3000
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/ticket_sales
3. Create the database

Create a PostgreSQL database named:

ticket_sales
4. Create the tables

Run:

sql/schema.sql

in PostgreSQL.

5. Seed the database

Run:

node scripts/seed.js

The seed creates:

10 events
1,000 seats per event
10,000 seats total
6. Start the server
node src/server.js

The API runs on:

http://localhost:3000
API Endpoints
Health check
GET /

Example response:

{
  "message": "Ticket Sales API is running"
}
Database test
GET /api/test-db
List free seats
GET /api/events/:eventId/seats/free

Example:

GET /api/events/1/seats/free

Example response:

{
  "eventId": 1,
  "count": 1000,
  "seats": [
    {
      "id": 1,
      "seat_number": "A1"
    }
  ]
}
Reserve a seat
POST /api/events/:eventId/seats/:seatId/reserve

Request body:

{
  "customerName": "Garima"
}

Example:

POST /api/events/1/seats/1/reserve

Successful response:

{
  "message": "Seat reserved successfully",
  "eventId": 1,
  "seat": {
    "id": 1,
    "seatNumber": "A1"
  }
}

If the seat is already reserved:

{
  "error": "Seat is not available"
}

The API returns HTTP 409 Conflict.

Concurrency Safety

Seat reservation uses an atomic database update:

UPDATE seats
SET status = 'reserved'
WHERE id = $1
  AND event_id = $2
  AND status = 'free'
RETURNING id, event_id, seat_number;

Only a seat whose status is still free can be changed to reserved.

The reservation and order creation are performed inside a PostgreSQL transaction.

Therefore, two requests attempting to reserve the same seat cannot both successfully reserve it.

Concurrency demonstration

A free seat was reset before the test:

DELETE FROM orders
WHERE seat_id = 2;

UPDATE seats
SET status = 'free'
WHERE id = 2;

Two requests were then started concurrently for the same seat:

$job1 = Start-Job {
    Invoke-RestMethod `
        -Uri "http://localhost:3000/api/events/1/seats/2/reserve" `
        -Method POST `
        -ContentType "application/json" `
        -Body '{"customerName":"Alice"}'
}

$job2 = Start-Job {
    Invoke-RestMethod `
        -Uri "http://localhost:3000/api/events/1/seats/2/reserve" `
        -Method POST `
        -ContentType "application/json" `
        -Body '{"customerName":"Bob"}'
}

Wait-Job $job1, $job2 | Out-Null

Receive-Job $job1
Receive-Job $job2

Result:

One request succeeded:

message : Seat reserved successfully
eventId : 1
seat    : @{id=2; seatNumber=A2}
order   : @{id=3; seat_id=2; customer_name=Bob; ...}

The other request returned:

{
  "error": "Seat is not available"
}

Thus exactly one request successfully reserved the seat.

Query Performance

The free-seat query is:

SELECT id, seat_number
FROM seats
WHERE event_id = 1
  AND status = 'free'
ORDER BY id;
Index

The following index was added:

CREATE INDEX idx_seats_event_status
ON seats(event_id, status);
Query plan before index

The index was temporarily removed and the query was measured using:

EXPLAIN (ANALYZE, BUFFERS)
SELECT id, seat_number
FROM seats
WHERE event_id = 1
  AND status = 'free'
ORDER BY id;

Measured execution time:

0.589 ms
Query plan after index

The index was recreated:

CREATE INDEX idx_seats_event_status
ON seats(event_id, status);

The same query was measured again.

Measured execution time:

0.808 ms

The measured times are both far below the required 200 ms target.

The indexed query was not faster in this particular run because the dataset contains only 10,000 rows and PostgreSQL may choose a sequential scan when that is cheaper. The index is nevertheless present for the event/status filtering required by the endpoint.

Performance Requirement

Required:

Free-seat endpoint < 200 ms

Measured database query:

0.808 ms

Result:

PASS
Error Handling

The API returns appropriate errors for unavailable seats.

Example:

{
  "error": "Seat is not available"
}

HTTP status:

409 Conflict

Missing customer name returns:

{
  "error": "Field 'customerName' is required"
}

HTTP status:

400 Bad Request
Project Structure
Ticket-Sales/
│
├── data/
│
├── scripts/
│   └── seed.js
│
├── sql/
│   └── schema.sql
│
├── src/
│   ├── db.js
│   └── server.js
│
├── .env
├── .gitignore
├── package-lock.json
├── package.json
└── README.md
Running the Project
npm install
node scripts/seed.js
node src/server.js

API:

http://localhost:3000

### Important

Do **not** put your real PostgreSQL password into the README. Keep:

```env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/ticket_sales

as shown above.