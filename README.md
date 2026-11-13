# vietcraft-behavior-simulator

Simulates the behavior of guests, buyers, sellers and admins on the VietCraft marketplace. It produces realistic activity (views, carts, orders, reviews, searches) so the seller AI analytics features have data to work with.

Most actions go through the backend API, the same way a real user would. Everything the tool creates is recorded and can be undone.

## Requirements

- Node 22.
- Place this folder **next to** the `BE` folder:
  ```
  VietCraft/
    BE/                              (npm install done, .env present)
    vietcraft-behavior-simulator/
  ```
  The tool uses the backend's own packages (`mongodb`, `jsonwebtoken`, `bcryptjs`, `dotenv`), reads `BE/.env` and writes refund evidence images to `BE/uploads/refunds/`. No `npm install` is needed here.
- The backend runs at `http://localhost:8080` (change `baseUrl` in `config.json`).
- `BE/.env` has `MONGO_URI` pointing at the **personal database** and `JWT_SECRET`.
- Copy `guard.example.json` to `guard.local.json` and fill in the two cluster ids. The tool refuses to run without this file, or if `MONGO_URI` is not the allowed cluster (see `lib/guard.js`).

## Commands

```
node run.js start          run continuously (Ctrl+C or the stop command ends it)
node run.js start --fast   fast mode: one minute plays as one second
node run.js status         buyers, orders and queue counts
node run.js stop           graceful stop: waits for running sessions, then saves
node run.js clean          remove everything the tool created, using ledger.json
node run.js ai-check       call the AI analytics routes (read-only)
node run.js once <task>    run one task: signup | session | checkout | tick | queue
```

## How it works

Every 20 seconds (one tick) the loop:

1. Checks that the backend is up and whether the machine has just woken from sleep.
2. Computes a traffic factor from the hour, the weekday and the shopping calendar.
3. Runs the queued steps that are due (payment, seller processing, shipping, delivery, refunds).
4. Spawns anonymous guests.
5. Rolls the dice for each buyer to start a browsing session.
6. Saves the state.

An order moves through: place order → pay (PayOS, written to the database) or COD → seller prepares → ships → delivered → review or refund request → seller decision → dispute → admin decision.

## Generated files (never committed)

| File | Content |
|---|---|
| `state.json` | simulated buyers, orders, queue, counters |
| `ledger.json` | record of everything created in the database; `clean` needs it |
| `run.lock`, `stop.flag` | single-process lock, stop signal |
| `guard.local.json` | ids of the allowed and the forbidden cluster |

Without `ledger.json`, `clean` cannot undo anything. Back up both JSON files before moving to another machine.

## Tuning

All numbers live in `config.json`: tick length, guests per hour, add-to-cart / checkout / refund rates, shop working hours, the holiday calendar and the daily limits.

## Data safety

- Runs only on the personal database; the shared cluster is blocked in code.
- Never calls a payment gateway, never sends mail, never uploads: those paths are blocked in `lib/http.js`. A PayOS payment is only a database write.
- Touches only orders placed by simulated buyers; POD orders, VNPAY orders and orders with a real PayOS link are refused (`lib/safety.js`).
- Simulated buyers use `@vietcraft.invalid` emails and carry `sim: true`. Their passwords are derived from `JWT_SECRET` and stored nowhere.
- The repository holds no secrets. Never commit `BE/.env`, `guard.local.json`, `state.json` or `ledger.json`.

## Deployment

See `DEPLOY.md`.
