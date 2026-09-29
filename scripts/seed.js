require("dotenv").config();

const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function seed() {
  const client = await pool.connect();

  try {
    console.log("Starting seed...");

    await client.query("BEGIN");

    // Clean existing data
    await client.query("DELETE FROM orders");
    await client.query("DELETE FROM seats");
    await client.query("DELETE FROM events");

    console.log("Old data cleared.");

    // Create 10 events
    for (let eventNumber = 1; eventNumber <= 10; eventNumber++) {
      const eventResult = await client.query(
        `
        INSERT INTO events (name, venue, event_date)
        VALUES ($1, $2, $3)
        RETURNING id
        `,
        [
          `Concert Event ${eventNumber}`,
          `Venue ${eventNumber}`,
          `2026-12-${String(eventNumber).padStart(2, "0")} 19:00:00`,
        ]
      );

      const eventId = eventResult.rows[0].id;

      // Create 1,000 seats for this event
      for (let seatNumber = 1; seatNumber <= 1000; seatNumber++) {
        await client.query(
          `
          INSERT INTO seats (event_id, seat_number, status)
          VALUES ($1, $2, 'free')
          `,
          [eventId, `A${seatNumber}`]
        );
      }

      console.log(`Event ${eventNumber}: 1000 seats created`);
    }

    await client.query("COMMIT");

    console.log("");
    console.log("================================");
    console.log("SEED COMPLETED");
    console.log("10 events");
    console.log("10,000 seats");
    console.log("================================");
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("Seed failed:");
    console.error(error);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();