DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS seats;
DROP TABLE IF EXISTS events;

CREATE TABLE events (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    venue VARCHAR(200) NOT NULL,
    event_date TIMESTAMP NOT NULL
);

CREATE TABLE seats (
    id SERIAL PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    seat_number VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'free',
    UNIQUE(event_id, seat_number)
);

CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    seat_id INTEGER NOT NULL UNIQUE REFERENCES seats(id) ON DELETE CASCADE,
    customer_name VARCHAR(200) NOT NULL,
    reserved_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_seats_event_status
ON seats(event_id, status);