# Deploying to a server

1. **Same machine as the backend.** The tool reads `BE/.env` (JWT_SECRET, used to log simulated buyers in), uses the backend's `bcryptjs`, and writes evidence images to `BE/uploads/refunds/`. Keep this folder next to `BE`. `baseUrl` in `config.json` stays `http://localhost:8080`.
2. **Database = the personal cluster.** The server `.env` must never point at the shared Atlas cluster. Copy `guard.local.json` to the server; `lib/guard` uses it to block the wrong cluster.
3. **Time zone.** `sim/rhythm.js` uses the machine's local time, so set `TZ=Asia/Ho_Chi_Minh` (a server on UTC would be 7 hours off).
4. **The machine runs 24/7.** Do not use a free tier that sleeps. Sleep means a hole in the data, which the anomaly feature (F30) reports as a false drop. Use a small VPS.
5. **Keep it running.** Replace `tools/run-forever.cmd` (Windows only) with `TZ=Asia/Ho_Chi_Minh pm2 start run.js --name behavior-sim --kill-timeout 60000 -- start`, then `pm2 save && pm2 startup`, or use a systemd service. `--kill-timeout` gives the tool time to finish running sessions and save its state.
6. **Bring the state along.** Copy `state.json` and `ledger.json` to the server before the first start, so the existing buyers are kept and `clean` can still undo everything. Do not run the tool on the local machine at the same time. (With a brand-new state the tool picks a random seed, so it does not repeat an earlier run.)
7. **JWT_SECRET on the server must match the local one.** Simulated buyers' passwords are derived from JWT_SECRET; with a different secret the existing buyers cannot log in. Check that the server database is the personal cluster before starting.
8. **F30 also needs AI-Analysic running** (the backend job at 00:30 UTC calls it); otherwise no alert is produced.
