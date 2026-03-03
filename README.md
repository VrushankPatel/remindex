# Normiculus Reminder Dispatcher

Background Node.js service that:

- Reads reminders from Firebase Realtime DB using `curl GET`.
- For executed `one_time` reminders, it performs controlled cleanup writes:
  - `DELETE /reminders/{id}.json`
  - `PUT /last_updated.json` with `Date.now()`
- Uses `last_updated` cache invalidation to avoid redundant full reminder fetches.
- Evaluates due reminders every minute.
- Sends WhatsApp reminders through:
  - `wacli send text --to WHATSAPP_PHONE_NUMBER --message REMINDER_MESSAGE`

## Source Endpoints

Default reminders:

`https://normiculus-default-rtdb.asia-southeast1.firebasedatabase.app/reminders.json`

Default cache-buster:

`https://normiculus-default-rtdb.asia-southeast1.firebasedatabase.app/last_updated.json`

Override with:

`REMINDERS_URL=https://...`

`LAST_UPDATED_URL=https://...`

## Behavior

- Polls `last_updated.json` every 60 seconds by default (`POLL_INTERVAL_MS`).
- Fetches full `reminders.json` only when fetched `last_updated` is greater than local cached value.
- If `last_updated` is null/invalid and reminders are not yet cached, it performs one initial reminders fetch.
- Evaluates due reminders every 60 seconds.
- All reminder date/time evaluation is done in `REMINDER_TIMEZONE` (default `Asia/Kolkata`).
- Handles `SIGTERM`/`SIGINT` gracefully: stops intervals, waits for in-flight work, persists state, removes its own PID file, exits with code `0`.
- On each reminders fetch, exact raw payload is still compared for change diagnostics.
- Always includes hardwired recipient `919601501725` for every due reminder.
- If `contacts` are present, reminders are sent to all listed contacts plus `919601501725` (deduped).
- Supports date types:
  - `one_time`
  - `everyday`
  - `weekdays`
  - `weekends`
  - `custom` (`customDays`)
  - `specific_dates` (`specificDates`)
- `one_time` is evaluated against `createdAt` + configured time(s):
  - time must be strictly after `createdAt` (past/expired selection is dismissed)
  - dispatch occurs only on the created local date at matching minute
  - after at least one successful send, the reminder is deleted from Firebase and `last_updated` is bumped
- Supports time formats (via `times[]`, with backward compatibility for legacy single `time`):
  - `24h`
  - `12h` with AM/PM conversion

## Install

```bash
npm install
```

## Run

Foreground:

```bash
npm start
```

Background:

```bash
npm run start:bg
```

Each start creates a dedicated log file under `logs/`:

`logs/remindex-DD-MM-YYYY-hh-mm-ss.log`

Check status:

```bash
npm run status:bg
```

Stop background:

```bash
npm run stop:bg
```

Tail logs:

```bash
npm run logs
```

This tails the active run log (or the latest `logs/remindex-*.log` if no active pointer is found).

Note: run these as your regular user, not `sudo`, to avoid duplicate root-owned processes and PID-file conflicts.

## `wacli` Requirement

On startup, the service checks `wacli` in PATH.

- If installed: reminders are dispatched normally.
- If missing: service logs warnings and continues polling/evaluating without sending.
- If `wacli` output indicates `no LID found`, it is treated as an invalid recipient and logged as warning.

## Build Binaries with `pkg`

```bash
npm run build:bin
```

Outputs are created in:

`build/bin`

Targets configured:

- macOS x64
- macOS arm64
- Linux x64 (works for Ubuntu/Debian class distros)
- Linux arm64

## Environment Variables

- `REMINDERS_URL` (optional): override reminders endpoint.
- `REMINDERS_COLLECTION_URL` (optional): override reminders collection base URL used for DELETE calls.
- `LAST_UPDATED_URL` (optional): override cache-buster endpoint.
- `POLL_INTERVAL_MS` (optional): `last_updated` poll interval in ms (default `60000`).
- `REMINDER_TIMEZONE` (optional): IANA timezone for reminder evaluation (default `Asia/Kolkata`).
- `SHUTDOWN_TIMEOUT_MS` (optional): max wait time for in-flight work during graceful shutdown (default `15000`).
