# Ticket Sales API

A PostgreSQL-backed ticket reservation API built using Node.js and Express. The application manages events, seats, and reservations while preventing duplicate bookings through database constraints and atomic transactions.

## Features

- Three related relational database tables.
- Foreign-key relationships and unique constraints.
- 10 events with 10,000 seats.
- API to list available seats.
- API to reserve a specific seat.
- Prevents duplicate seat reservations.
- Transaction-based concurrency safety.
- Indexed free-seat lookup.
- PostgreSQL query execution plan analysis.
- Documented performance and scalability considerations.

## Tech Stack

| Technology | Purpose |
|---|---|
| Node.js | JavaScript runtime |
| Express 5 | REST API |
| PostgreSQL 18 | Relational database |
| pg | PostgreSQL connection pool |
| dotenv | Environment configuration |

## 1. Database Design

The database contains three tables: `events`, `seats`, and `orders`.

### Events

Stores information about events.

| Column | Type | Constraint | Purpose |
|---|---|---|---|
| id | SERIAL | PRIMARY KEY | Unique event ID |
| name | VARCHAR(200) | NOT NULL | Event name |
| venue | VARCHAR(200) | NOT NULL | Event venue |
| event_date | TIMESTAMP | NOT NULL | Event date and time |

Each event can contain multiple seats.

### Seats

Stores individual seats belonging to events.

| Column | Type | Constraint | Purpose |
|---|---|---|---|
| id | SERIAL | PRIMARY KEY | Unique seat ID |
| event_id | INTEGER | NOT NULL, FOREIGN KEY | Parent event |
| seat_number | VARCHAR(50) | NOT NULL | Seat identifier |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'free' | Current seat status |

The `event_id` references `events(id)`.

The combination of `event_id` and `seat_number` must be unique. This prevents the same seat number from being created twice for one event while allowing different events to have identical seat numbers.

The status defaults to `free` when a seat is created.

### Orders

Stores successful seat reservations.

| Column | Type | Constraint | Purpose |
|---|---|---|---|
| id | SERIAL | PRIMARY KEY | Unique order ID |
| seat_id | INTEGER | NOT NULL, UNIQUE, FOREIGN KEY | Reserved seat |
| customer_name | VARCHAR(200) | NOT NULL | Customer name |
| reserved_at | TIMESTAMP | NOT NULL, DEFAULT CURRENT_TIMESTAMP | Reservation time |

The `seat_id` references `seats(id)`.

The unique constraint on `seat_id` ensures that a seat cannot have multiple orders.

### Entity Relationship Diagram

```text
+----------------------+
|        events        |
+----------------------+
| PK id                |
| name                 |
| venue                |
| event_date           |
+----------------------+
           |
           | 1
           |
           | Many
+----------------------+
|        seats         |
+----------------------+
| PK id                |
| FK event_id          |
| seat_number          |
| status               |
+----------------------+
           |
           | 1
           |
           | 0..1
+----------------------+
|        orders        |
+----------------------+
| PK id                |
| FK, UNIQUE seat_id   |
| customer_name        |
| reserved_at          |
+----------------------+
```

### Relationships

- One event can have many seats.
- Each seat belongs to exactly one event.
- One seat can have zero or one order.
- Each order belongs to exactly one seat.
- A seat without an order is not yet reserved.

## 2. Database Constraints and Why They Exist

Constraints enforce business rules at the database level, even when multiple API requests arrive simultaneously.

| Constraint | Table | What it prevents |
|---|---|---|
| PRIMARY KEY | All tables | Duplicate or unidentified row IDs |
| NOT NULL | Required columns | Missing required values |
| FOREIGN KEY | seats.event_id | Seats referencing nonexistent events |
| FOREIGN KEY | orders.seat_id | Orders referencing nonexistent seats |
| UNIQUE(event_id, seat_number) | seats | Duplicate seat numbers within an event |
| UNIQUE(seat_id) | orders | Multiple orders for one seat |
| DEFAULT 'free' | seats.status | New seats having no default status |
| DEFAULT CURRENT_TIMESTAMP | orders.reserved_at | Missing reservation timestamps |

### Cascade deletion

Both foreign keys use `ON DELETE CASCADE`.

- Deleting an event deletes its associated seats.
- Deleting a seat deletes its associated order.

This prevents dependent records from remaining after their parent records are deleted.

### Important design decision

The current schema does not include a CHECK constraint restricting `status` to `free` or `reserved`. This is a possible improvement because invalid status values could otherwise be inserted directly into the database.

A future schema revision could add:

```sql
CHECK (status IN ('free', 'reserved'))
```

## 3. Database Indexes

The following index supports the free-seat lookup:

```sql
CREATE INDEX idx_seats_event_status
ON seats(event_id, status);
```

This is a composite B-tree index.

It allows PostgreSQL to filter seats using both `event_id` and `status` without necessarily scanning the entire seats table.

The database also has:

- `seats_pkey`: Primary-key index on `seats(id)`.
- `unique_event_seat`: Unique index on `(event_id, seat_number)`.
- `idx_seats_event_status`: Composite index on `(event_id, status)`.

## 4. API Endpoints

Base URL:

```text
http://localhost:3000
```

| Method | Endpoint | Success status | Purpose |
|---|---|---|---|
| GET | `/` | 200 | API health check |
| GET | `/api/test-db` | 200 | Test database connection |
| GET | `/api/events/:eventId/seats/free` | 200 | List free seats |
| POST | `/api/events/:eventId/seats/:seatId/reserve` | 201 | Reserve a seat |

### GET /

Checks whether the API server is running.

Example response:

```json
{
  "message": "Ticket Sales API is running"
}
```

### GET /api/test-db

Checks PostgreSQL connectivity.

Successful response:

```json
{
  "connected": true,
  "databaseTime": "2026-10-31T..."
}
```

Database connection failures return HTTP 500.

### GET /api/events/:eventId/seats/free

Returns all free seats for the specified event.

Example:

```text
GET /api/events/1/seats/free
```

Example response:

```json
{
  "eventId": 1,
  "count": 998,
  "seats": [
    {
      "id": 3,
      "seat_number": "A3"
    }
  ]
}
```

The count and returned seats depend on the current database state.

### POST /api/events/:eventId/seats/:seatId/reserve

Reserves a particular seat.

Request:

```text
POST /api/events/1/seats/1/reserve
```

Request body:

```json
{
  "customerName": "Garima"
}
```

Successful response (HTTP 201):

```json
{
  "message": "Seat reserved successfully",
  "eventId": 1,
  "seat": {
    "id": 1,
    "seatNumber": "A1"
  },
  "order": {
    "id": 1,
    "seat_id": 1,
    "customer_name": "Garima"
  }
}
```

If the customer name is missing, the API returns HTTP 400:

```json
{
  "error": "Field 'customerName' is required"
}
```

If the seat is already reserved or does not belong to the specified event, the API returns HTTP 409:

```json
{
  "error": "Seat is not available"
}
```

Unexpected reservation errors return HTTP 500.

### HTTP Status Code Summary

| Status | Meaning | When used |
|---|---|---|
| 200 | OK | Successful GET requests |
| 201 | Created | Successful reservation |
| 400 | Bad Request | Missing customer name |
| 409 | Conflict | Seat unavailable |
| 500 | Internal Server Error | Unexpected server or database failure |

## 5. Concurrency Safety

The application uses an atomic PostgreSQL UPDATE to reserve seats.

```sql
UPDATE seats
SET status = 'reserved'
WHERE id = $1
  AND event_id = $2
  AND status = 'free'
RETURNING id, event_id, seat_number;
```

The condition `status = 'free'` ensures that only an available seat can be reserved.

The application performs the following operations inside a PostgreSQL transaction:

1. Begin transaction.
2. Atomically update the seat status.
3. Check whether the seat was successfully updated.
4. Insert a new order.
5. Commit the transaction.

If the seat is unavailable, the transaction is rolled back.

If an unexpected error occurs, the transaction is rolled back and the database client is released.

The unique constraint on `orders.seat_id` provides an additional database-level safeguard against duplicate orders.

### Concurrent reservation test

Two requests were started simultaneously for the same seat using PowerShell background jobs.

The observed result was:

- One request successfully reserved the seat.
- The other request received HTTP 409 Conflict.

Therefore, both requests could not successfully reserve the same seat.

## 6. Query Performance and Execution Plan

The free-seat listing query is one of the important database operations.

```sql
SELECT id, seat_number
FROM seats
WHERE event_id = 1
  AND status = 'free'
ORDER BY id;
```

### Index used

```sql
CREATE INDEX idx_seats_event_status
ON seats(event_id, status);
```

### Actual PostgreSQL query plan

Measured using:

```sql
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT id, seat_number
FROM seats
WHERE event_id = 1
  AND status = 'free'
ORDER BY id;
```

Observed execution plan:

```text
Sort
  (cost=147.36..149.86 rows=1000 width=8)
  (actual time=30.586..30.736 rows=998 loops=1)

  Sort Key: seats.id
  Sort Method: quicksort
  Memory: 55kB

  -> Bitmap Heap Scan on public.seats
       (actual time=25.145..27.447 rows=998 loops=1)

       Recheck Cond:
       (event_id = 1 AND status = 'free')

       -> Bitmap Index Scan
            on idx_seats_event_status
            (actual time=3.156..3.156 rows=1000 loops=1)

Planning Time: 70.388 ms
Execution Time: 39.619 ms
```

### Query plan explanation

PostgreSQL used the following operations:

1. **Bitmap Index Scan:** Uses `idx_seats_event_status` to locate matching rows.
2. **Bitmap Heap Scan:** Retrieves the corresponding seat records from the table.
3. **Sort:** Sorts the matching records by `id` using quicksort.
4. **Result:** Returns 998 free seats.

The index is confirmed to be used by the actual execution plan.

### Observed performance

| Metric | Observed value |
|---|---:|
| Total seats | 10,000 |
| Free seats | 9,998 |
| Reserved seats | 2 |
| Rows returned for event 1 | 998 |
| Planning time | 70.388 ms |
| Execution time | 39.619 ms |

These values represent one measured execution on the local PostgreSQL database. Execution time can vary with cache state, system load and database conditions.

An earlier measurement recorded 0.589 ms before indexing and 0.808 ms after indexing. Those measurements were not obtained from the same controlled run as the execution plan above, so they should not be treated as a definitive benchmark comparison.

The composite index is useful for filtering, but PostgreSQL still performs a separate sort because the index does not provide the requested `ORDER BY id` ordering.

## 7. What Would Break First at 10× Traffic?

If the database grows from 10,000 seats to approximately 100,000 seats, the free-seat listing endpoint is a likely first bottleneck.

The current query retrieves every free seat for an event and sorts the complete result by ID.

As the number of seats increases:

- More rows may need to be fetched.
- Sorting requires additional CPU and memory.
- Larger result sets increase network transfer.
- The API response becomes larger.
- Concurrent requests increase database workload.

### Improvements I would make

**1. Add pagination**

Use `LIMIT` and cursor-based pagination with the seat ID to avoid returning thousands of rows in one response.

**2. Evaluate a partial index**

For workloads where free-seat lookups dominate:

```sql
CREATE INDEX idx_seats_free_by_event
ON seats(event_id, id)
INCLUDE (seat_number)
WHERE status = 'free';
```

This could reduce the amount of index data needed for free-seat lookups and support ordering by ID. Its benefit should be verified using `EXPLAIN ANALYZE` against realistic data.

**3. Monitor database performance**

Track query execution time, buffer reads, connection-pool usage and slow queries.

**4. Improve connection management**

Tune PostgreSQL connection-pool size and introduce appropriate infrastructure if concurrent traffic increases.

**5. Consider caching carefully**

Frequently requested event information could be cached. Seat availability must remain consistent with database reservations.

These changes would be evaluated using realistic load tests before implementation.

## 8. Project Structure

```text
Ticket-Sales/
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
├── package.json
├── package-lock.json
└── README.md
```

## 9. Run the Project Locally

### Prerequisites

- Node.js
- npm
- PostgreSQL

### Step 1: Clone the repository

```bash
git clone https://github.com/garima-2006/ticket-sales-api.git
cd ticket-sales-api
```

### Step 2: Install dependencies

```bash
npm install
```

### Step 3: Configure environment variables

Create a `.env` file in the project root:

```env
PORT=3000
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/ticket_sales
```

Replace `YOUR_PASSWORD` with your local PostgreSQL password.

Never commit your real `.env` file or database credentials.

### Step 4: Create the database

In PostgreSQL:

```sql
CREATE DATABASE ticket_sales;
```

Connect to the database and execute:

```bash
psql -U postgres -d ticket_sales -f sql/schema.sql
```

**Important:** `schema.sql` starts by dropping the existing tables. Use it only when creating a fresh database or when intentionally resetting the project data.

### Step 5: Seed the database

```bash
node scripts/seed.js
```

The seed script populates 10 events with 1,000 seats per event, giving 10,000 seats in total.

### Step 6: Start the API

```bash
npm start
```

The API will run at:

```text
http://localhost:3000
```

### Step 7: Test the API

Health check:

```bash
curl http://localhost:3000/
```

Database connection:

```bash
curl http://localhost:3000/api/test-db
```

Free seats:

```bash
curl http://localhost:3000/api/events/1/seats/free
```

Reserve a seat:

```bash
curl -X POST http://localhost:3000/api/events/1/seats/1/reserve -H "Content-Type: application/json" -d "{\"customerName\":\"Garima\"}"
```

## 10. Future Improvements

If the application grows, I would consider:

- Authentication and customer accounts.
- Reservation expiration and automatic seat release.
- Pagination for large seat lists.
- Better validation for event and seat IDs.
- Database CHECK constraints for valid seat statuses.
- Automated integration and concurrency tests.
- Monitoring, logging and performance benchmarking.
- Improved API error handling and request validation.

## Conclusion

This project demonstrates relational database design, primary and foreign keys, unique constraints, PostgreSQL indexing, REST API development and transaction-based concurrency control.

It also documents actual query execution behaviour and identifies improvements needed as the database and traffic grow.