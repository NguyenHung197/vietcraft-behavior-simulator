# vietcraft-behavior-simulator

Simulates the behavior of guests, buyers, sellers and admins on the VietCraft marketplace. It produces realistic activity (views, carts, orders, reviews, searches) so the seller AI analytics features have data to work with.

Most actions go through the backend API, the same way a real user would. Everything the tool creates is recorded and can be undone.

## Requirements

- Node 22 or newer.
- A running VietCraft backend and its `MONGO_URI` and `JWT_SECRET`.

## Setup

```
git clone https://github.com/NguyenHung197/vietcraft-behavior-simulator.git
cd vietcraft-behavior-simulator
npm install
```

1. **Secrets.** The tool needs the same `MONGO_URI` and `JWT_SECRET` as the backend it talks to.
   - If this folder sits next to the `BE` folder, `BE/.env` is read automatically.
   - Otherwise copy `.env.example` to `.env` and fill in the two values.
2. **Cluster guard.** Copy `guard.example.json` to `guard.local.json` and set `allowed` to the id of the Atlas cluster the tool may write to (the part of `MONGO_URI` between `@cluster.` and `.mongodb.net`). The tool refuses to run without this file or when `MONGO_URI` points anywhere else.
3. **Backend address.** `baseUrl` in `config.json` (default `http://localhost:8080`). The database behind that backend must be the one in `MONGO_URI`.
4. **Uploads folder.** `uploadsDir` in `config.json` (default `../BE/uploads`) must be the backend's uploads folder, because refund evidence images are written there as files.

Run `node run.js status` to check the setup, then `node run.js start`.

### Which setup to use

| Setup | `baseUrl` | Notes |
|---|---|---|
| On the backend machine (recommended) | `http://localhost:8080` | Everything works. |
| Remote, through the public domain | `https://your-domain` | Refund evidence images are missing on the server, and all simulated visitors share one IP because the proxy replaces `X-Forwarded-For`. |

Only one instance may run against a database at a time. The lock file protects one machine only, so agree with the team who runs it.

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
| `guard.local.json` | id of the cluster the tool may write to |
| `.env` | `MONGO_URI` and `JWT_SECRET`, when not read from `BE/.env` |

Without `ledger.json`, `clean` cannot undo anything. Back up both JSON files before moving to another machine.

## Tuning

All numbers live in `config.json`: tick length, guests per hour, add-to-cart / checkout / refund rates, shop working hours, the holiday calendar and the daily limits.

Machine-specific values go in `config.local.json` (not committed); its top-level keys replace those of `config.json`. Example: `{ "shopBoost": { "<shop id>": 5 } }` multiplies how often that shop's products are picked.

## Data safety

- Runs only on the cluster named in `guard.local.json`.
- It acts for every shop that has products on sale: it accepts or rejects orders, decides refunds, restocks variants and posts reviews. Use it on a database with no real customers.
- Simulated data is recognisable without the ledger: users carry `sim: true`, and their orders, reviews and events hang off those users (`session_id` starts with `sim_`). Stock added by the tool and shop snapshots are known only to `ledger.json`.
- Never calls a payment gateway, never sends mail, never uploads: those paths are blocked in `lib/http.js`. A PayOS payment is only a database write.
- Touches only orders placed by simulated buyers; POD orders, VNPAY orders and orders with a real PayOS link are refused (`lib/safety.js`).
- Simulated buyers use `@vietcraft.invalid` emails and carry `sim: true`. Their passwords are derived from `JWT_SECRET` and stored nowhere.
- The repository holds no secrets. Never commit `.env`, `guard.local.json`, `state.json` or `ledger.json`.

## Deployment

See `DEPLOY.md`.
