const express = require("express");
const pool = require("./db");

const app = express();

app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    message: "Ticket Sales API is running",
  });
});

// Test database connection
app.get("/api/test-db", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");

    res.json({
      connected: true,
      databaseTime: result.rows[0].now,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      connected: false,
      error: "Database connection failed",
    });
  }
});

// Get free seats for an event
app.get("/api/events/:eventId/seats/free", async (req, res) => {
  const { eventId } = req.params;

  try {
    const result = await pool.query(
      `
      SELECT id, seat_number
      FROM seats
      WHERE event_id = $1
        AND status = 'free'
      ORDER BY id
      `,
      [eventId]
    );

    res.json({
      eventId: Number(eventId),
      count: result.rows.length,
      seats: result.rows,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to fetch free seats",
    });
  }
});

// Reserve a specific seat
app.post("/api/events/:eventId/seats/:seatId/reserve", async (req, res) => {
  const { eventId, seatId } = req.params;
  const { customerName } = req.body;

  if (!customerName) {
    return res.status(400).json({
      error: "Field 'customerName' is required",
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Atomically reserve the seat only if it is still free
    const seatResult = await client.query(
      `
      UPDATE seats
      SET status = 'reserved'
      WHERE id = $1
        AND event_id = $2
        AND status = 'free'
      RETURNING id, event_id, seat_number
      `,
      [seatId, eventId]
    );

    // Seat was already reserved or does not belong to this event
    if (seatResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        error: "Seat is not available",
      });
    }

    const seat = seatResult.rows[0];

    // Create reservation/order
    const orderResult = await client.query(
      `
      INSERT INTO orders (seat_id, customer_name)
      VALUES ($1, $2)
      RETURNING id, seat_id, customer_name, reserved_at
      `,
      [seat.id, customerName]
    );

    await client.query("COMMIT");

    res.status(201).json({
      message: "Seat reserved successfully",
      eventId: Number(eventId),
      seat: {
        id: seat.id,
        seatNumber: seat.seat_number,
      },
      order: orderResult.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error(error);

    res.status(500).json({
      error: "Failed to reserve seat",
    });
  } finally {
    client.release();
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});