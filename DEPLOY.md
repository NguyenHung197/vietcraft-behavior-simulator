# Deploying to a server

1. **Same machine as the backend.** Clone, run `npm install`, keep `baseUrl` at `http://localhost:8080` and point `uploadsDir` in `config.json` at the backend's uploads folder (refund evidence images are written there). If the backend runs in Docker, that folder must be a mounted volume the tool can write to.
2. **Secrets.** Put the backend's `MONGO_URI` and `JWT_SECRET` in `.env` (see `.env.example`), or keep this folder next to `BE` so `BE/.env` is read. Create `guard.local.json` with the id of the cluster the tool may write to.
3. **Time zone.** `sim/rhythm.js` uses the machine's local time, so set `TZ=Asia/Ho_Chi_Minh` (a server on UTC would be 7 hours off).
4. **The machine runs 24/7.** Do not use a free tier that sleeps. Sleep means a hole in the data, which the anomaly feature (F30) reports as a false drop.
5. **Keep it running.** `TZ=Asia/Ho_Chi_Minh pm2 start run.js --name behavior-sim --kill-timeout 60000 -- start`, then `pm2 save && pm2 startup`, or use a systemd service. `--kill-timeout` gives the tool time to finish running sessions and save its state.
6. **One instance per database.** Do not run a second copy against the same database from another machine.
7. **State belongs to one database.** `state.json` and `ledger.json` describe the buyers and orders of the database they were created on. Start a new database with no state files. When moving the tool to another machine for the same database, copy both files first so the buyers are kept and `clean` can still undo everything.
8. **JWT_SECRET must match the backend's.** Simulated buyers' passwords are derived from it; if it changes, put the old value in `SIM_PASSWORD_SECRET` so existing simulated buyers can still log in.
9. **F30 also needs AI-Analysic running** (the backend job at 00:30 UTC calls it); otherwise no alert is produced.
