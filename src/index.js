#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execFile, spawnSync } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

const REMINDERS_URL =
  process.env.REMINDERS_URL ||
  "https://normiculus-default-rtdb.asia-southeast1.firebasedatabase.app/reminders.json";
const REMINDERS_COLLECTION_URL =
  process.env.REMINDERS_COLLECTION_URL ||
  (() => {
    try {
      const url = new URL(REMINDERS_URL);
      if (url.pathname.endsWith("/reminders.json")) {
        url.pathname = url.pathname.replace(/\/reminders\.json$/, "/reminders");
      } else {
        url.pathname = "/reminders";
      }
      url.search = "";
      return url.toString().replace(/\/$/, "");
    } catch {
      return "https://normiculus-default-rtdb.asia-southeast1.firebasedatabase.app/reminders";
    }
  })();
const LAST_UPDATED_URL =
  process.env.LAST_UPDATED_URL ||
  (() => {
    try {
      const url = new URL(REMINDERS_URL);
      if (url.pathname.endsWith("/reminders.json")) {
        url.pathname = url.pathname.replace(/\/reminders\.json$/, "/last_updated.json");
      } else {
        url.pathname = "/last_updated.json";
      }
      url.search = "";
      return url.toString();
    } catch {
      return "https://normiculus-default-rtdb.asia-southeast1.firebasedatabase.app/last_updated.json";
    }
  })();
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 60_000);
const TICK_INTERVAL_MS = 60_000;
const HARDCODED_CONTACT = "919601501725";
const REMINDER_TIMEZONE = process.env.REMINDER_TIMEZONE || "Asia/Kolkata";
const STATE_DIR = path.resolve(process.cwd(), ".runtime");
const SENT_LOG_FILE = path.join(STATE_DIR, "sent-log.json");
const SENT_LOG_RETENTION_DAYS = 32;
const ZONED_PARTS_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: REMINDER_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  weekday: "long",
  hour12: false,
  hourCycle: "h23"
});

let isWacliAvailable = false;
let previousRawSnapshot = null;
let cachedLastUpdated = null;
let hasHydratedReminders = false;
let currentReminders = {};
let sentLog = new Map();
let refreshInFlight = false;
let dispatchInFlight = false;

function nowIso() {
  return new Date().toISOString();
}

function ensureStateDir() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
}

function logInfo(message, meta) {
  if (meta) {
    console.log(`[${nowIso()}] INFO ${message}`, meta);
    return;
  }
  console.log(`[${nowIso()}] INFO ${message}`);
}

function logWarn(message, meta) {
  if (meta) {
    console.warn(`[${nowIso()}] WARN ${message}`, meta);
    return;
  }
  console.warn(`[${nowIso()}] WARN ${message}`);
}

function logError(message, error) {
  if (error) {
    console.error(`[${nowIso()}] ERROR ${message}`, error);
    return;
  }
  console.error(`[${nowIso()}] ERROR ${message}`);
}

function loadSentLog() {
  ensureStateDir();
  if (!fs.existsSync(SENT_LOG_FILE)) {
    return;
  }
  try {
    const data = JSON.parse(fs.readFileSync(SENT_LOG_FILE, "utf8"));
    if (typeof data !== "object" || data === null) {
      return;
    }
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === "number") {
        sentLog.set(key, value);
      }
    }
  } catch (error) {
    logWarn("Could not read sent log; starting with empty log.", error.message);
  }
}

function pruneSentLog() {
  const cutoff = Date.now() - SENT_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  for (const [key, ts] of sentLog.entries()) {
    if (ts < cutoff) {
      sentLog.delete(key);
    }
  }
}

function saveSentLog() {
  ensureStateDir();
  pruneSentLog();
  const serializable = {};
  for (const [key, ts] of sentLog.entries()) {
    serializable[key] = ts;
  }
  fs.writeFileSync(SENT_LOG_FILE, JSON.stringify(serializable, null, 2));
}

function getZonedDateTimeParts(date) {
  const parts = ZONED_PARTS_FORMATTER.formatToParts(date);
  const raw = {
    year: "",
    month: "",
    day: "",
    hour: "",
    minute: "",
    weekday: ""
  };

  for (const part of parts) {
    if (part.type === "year") {
      raw.year = part.value;
    } else if (part.type === "month") {
      raw.month = part.value;
    } else if (part.type === "day") {
      raw.day = part.value;
    } else if (part.type === "hour") {
      raw.hour = part.value;
    } else if (part.type === "minute") {
      raw.minute = part.value;
    } else if (part.type === "weekday") {
      raw.weekday = part.value;
    }
  }

  const hour = Number.parseInt(raw.hour, 10);
  const minute = Number.parseInt(raw.minute, 10);
  return {
    date: `${raw.year}-${raw.month}-${raw.day}`,
    hour: Number.isNaN(hour) ? 0 : hour,
    minute: Number.isNaN(minute) ? 0 : minute,
    weekday: raw.weekday.toLowerCase()
  };
}

function convertTimeTo24h(timeConfig) {
  if (!timeConfig || typeof timeConfig !== "object") {
    return null;
  }

  const { format, hour, minute } = timeConfig;
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    return null;
  }
  if (minute < 0 || minute > 59) {
    return null;
  }

  if (format === "24h") {
    if (hour < 0 || hour > 23) {
      return null;
    }
    return { hour, minute };
  }

  if (format === "12h") {
    const period = timeConfig.period;
    if (hour < 1 || hour > 12) {
      return null;
    }
    if (period !== "AM" && period !== "PM") {
      return null;
    }

    let normalizedHour = hour % 12;
    if (period === "PM") {
      normalizedHour += 12;
    }
    return { hour: normalizedHour, minute };
  }

  return null;
}

function getReminderTimeConfigs(reminder) {
  if (!reminder || typeof reminder !== "object") {
    return [];
  }
  if (Array.isArray(reminder.times) && reminder.times.length > 0) {
    return reminder.times;
  }
  if (reminder.time && typeof reminder.time === "object") {
    return [reminder.time];
  }
  return [];
}

function isAnyReminderTimeDueNow(reminder, now) {
  const timeConfigs = getReminderTimeConfigs(reminder);
  if (timeConfigs.length === 0) {
    return false;
  }
  const nowParts = getZonedDateTimeParts(now);

  for (const timeConfig of timeConfigs) {
    const normalizedTime = convertTimeTo24h(timeConfig);
    if (!normalizedTime) {
      continue;
    }
    if (normalizedTime.hour === nowParts.hour && normalizedTime.minute === nowParts.minute) {
      return true;
    }
  }
  return false;
}

function isOneTimeDueNow(reminder, now) {
  if (!reminder || typeof reminder !== "object" || !reminder.createdAt) {
    return false;
  }
  const createdAtMs = Date.parse(reminder.createdAt);
  if (Number.isNaN(createdAtMs)) {
    return false;
  }

  const createdParts = getZonedDateTimeParts(new Date(createdAtMs));
  const nowParts = getZonedDateTimeParts(now);
  const timeConfigs = getReminderTimeConfigs(reminder);
  if (timeConfigs.length === 0) {
    return false;
  }

  for (const timeConfig of timeConfigs) {
    const normalizedTime = convertTimeTo24h(timeConfig);
    if (!normalizedTime) {
      continue;
    }

    // "one_time" is only valid on creation date in configured reminder timezone.
    if (createdParts.date !== nowParts.date) {
      continue;
    }

    // Selected time must be strictly after createdAt local minute.
    if (normalizedTime.hour < createdParts.hour) {
      continue;
    }
    if (
      normalizedTime.hour === createdParts.hour &&
      normalizedTime.minute <= createdParts.minute
    ) {
      continue;
    }
    if (normalizedTime.hour === nowParts.hour && normalizedTime.minute === nowParts.minute) {
      return true;
    }
  }

  return false;
}

function isDateTypeMatch(reminder, now) {
  if (!reminder || typeof reminder !== "object" || !reminder.date) {
    return false;
  }

  const { date } = reminder;
  const nowParts = getZonedDateTimeParts(now);
  const todayDate = nowParts.date;
  const todayName = nowParts.weekday;
  const weekdaySet = new Set(["monday", "tuesday", "wednesday", "thursday", "friday"]);
  const weekendSet = new Set(["saturday", "sunday"]);

  switch (date.type) {
    case "one_time":
      return false;
    case "everyday":
      return true;
    case "weekdays":
      return weekdaySet.has(todayName);
    case "weekends":
      return weekendSet.has(todayName);
    case "custom":
      if (!Array.isArray(date.customDays)) {
        return false;
      }
      return date.customDays.includes(todayName);
    case "specific_dates":
      if (!Array.isArray(date.specificDates)) {
        return false;
      }
      return date.specificDates.includes(todayDate);
    default:
      return false;
  }
}

function isReminderDueNow(reminder, now) {
  if (reminder && reminder.date && reminder.date.type === "one_time") {
    return isOneTimeDueNow(reminder, now);
  }

  if (!isAnyReminderTimeDueNow(reminder, now)) {
    return false;
  }
  return isDateTypeMatch(reminder, now);
}

function sanitizeMessage(message) {
  if (typeof message !== "string") {
    return null;
  }
  if (message.length === 0 || message.length > 1500) {
    return null;
  }
  return message;
}

function normalizeContacts(reminder) {
  if (!Array.isArray(reminder.contacts)) {
    return [];
  }
  return reminder.contacts.filter((c) => typeof c === "string" && /^\d+$/.test(c));
}

function formatTimeLabel(timeConfig) {
  const converted = convertTimeTo24h(timeConfig);
  if (!converted) {
    return "invalid_time";
  }
  return `${String(converted.hour).padStart(2, "0")}:${String(converted.minute).padStart(2, "0")}`;
}

function formatReminderTimesLabel(reminder) {
  const timeConfigs = getReminderTimeConfigs(reminder);
  if (timeConfigs.length === 0) {
    return "none";
  }
  return timeConfigs.map((timeConfig) => formatTimeLabel(timeConfig)).join(",");
}

function formatDateRuleLabel(dateConfig) {
  if (!dateConfig || typeof dateConfig !== "object") {
    return "invalid_date";
  }

  switch (dateConfig.type) {
    case "one_time":
    case "everyday":
    case "weekdays":
    case "weekends":
      return dateConfig.type;
    case "custom":
      return `custom(${Array.isArray(dateConfig.customDays) ? dateConfig.customDays.join(",") : ""})`;
    case "specific_dates":
      return `specific_dates(${Array.isArray(dateConfig.specificDates) ? dateConfig.specificDates.join(",") : ""})`;
    default:
      return "invalid_date_type";
  }
}

function logReminderSnapshot(prefix) {
  const entries = Object.entries(currentReminders || {});
  logInfo(`${prefix} reminders=${entries.length}`);
  if (entries.length === 0) {
    logInfo("No reminders configured.");
    return;
  }

  for (const [reminderId, reminder] of entries) {
    const contacts = getDispatchContacts(reminder);
    const createdAt = reminder && reminder.createdAt ? reminder.createdAt : "n/a";
    const line =
      `Reminder ${reminderId} | ` +
      `dateRule=${formatDateRuleLabel(reminder && reminder.date)} | ` +
      `times=${formatReminderTimesLabel(reminder)} | ` +
      `contacts=${contacts.join(",")} | ` +
      `contactsCount=${contacts.length} | ` +
      `createdAt=${createdAt}`;
    logInfo(line);
  }
}

function isOneTimeReminder(reminder) {
  return Boolean(reminder && reminder.date && reminder.date.type === "one_time");
}

function reminderDeleteUrl(reminderId) {
  const encoded = encodeURIComponent(reminderId);
  return `${REMINDERS_COLLECTION_URL}/${encoded}.json`;
}

async function runWacliSend(to, message) {
  try {
    const { stdout, stderr } = await execFileAsync(
      "wacli",
      ["send", "text", "--to", to, "--message", message],
      {
        maxBuffer: 1024 * 1024
      }
    );

    const combined = `${stdout || ""}\n${stderr || ""}`.toLowerCase();
    if (combined.includes("no lid found")) {
      return {
        ok: false,
        kind: "invalid_recipient",
        error: (stdout || stderr || "No LID found").trim()
      };
    }

    return { ok: true, kind: "sent", output: (stdout || "").trim() };
  } catch (error) {
    const stdout = error && typeof error.stdout === "string" ? error.stdout : "";
    const stderr = error && typeof error.stderr === "string" ? error.stderr : "";
    const combined = `${stdout}\n${stderr}\n${error && error.message ? error.message : ""}`.toLowerCase();

    if (combined.includes("no lid found")) {
      return {
        ok: false,
        kind: "invalid_recipient",
        error: (stderr || stdout || error.message || "No LID found").trim()
      };
    }

    return {
      ok: false,
      kind: "send_failed",
      error: (stderr || stdout || (error && error.message) || "Unknown wacli execution error").trim()
    };
  }
}

function getDispatchContacts(reminder) {
  const merged = [HARDCODED_CONTACT, ...normalizeContacts(reminder)];
  return Array.from(new Set(merged));
}

async function sendReminderToContact(reminderId, contact, message, sentKey) {
  if (!isWacliAvailable) {
    logWarn(`wacli is not installed/available. Would have sent reminder ${reminderId} to ${contact}.`);
    sentLog.set(sentKey, Date.now());
    return { status: "skipped_no_wacli" };
  }

  logInfo(`Sending message to ${contact} for reminder ${reminderId}.`);
  const result = await runWacliSend(contact, message);
  if (result.ok) {
    logInfo(`Sending successful to ${contact} for reminder ${reminderId}.`);
    sentLog.set(sentKey, Date.now());
    return { status: "sent" };
  }

  if (result.kind === "invalid_recipient") {
    logWarn(`Invalid WhatsApp recipient ${contact} for reminder ${reminderId}.`, result.error);
    sentLog.set(sentKey, Date.now());
    return { status: "invalid_recipient" };
  }

  logError(`Failed to send reminder ${reminderId} to ${contact}.`, result.error);
  return { status: "send_failed" };
}

async function evaluateAndDispatchDueReminders() {
  if (dispatchInFlight) {
    logWarn("Dispatch cycle skipped because previous cycle is still running.");
    return;
  }
  dispatchInFlight = true;

  const now = new Date();
  const entries = Object.entries(currentReminders || {});

  try {
    for (const [reminderId, reminder] of entries) {
      const message = sanitizeMessage(reminder && reminder.message);
      if (!message) {
        continue;
      }
      if (!isReminderDueNow(reminder, now)) {
        continue;
      }

      const contacts = getDispatchContacts(reminder);
      let sentAtLeastOne = false;
      for (const contact of contacts) {
        const key = dispatchKey(reminderId, contact, now);
        if (sentLog.has(key)) {
          continue;
        }

        const outcome = await sendReminderToContact(reminderId, contact, message, key);
        if (outcome && outcome.status === "sent") {
          sentAtLeastOne = true;
        }
      }

      if (isOneTimeReminder(reminder) && sentAtLeastOne) {
        await deleteOneTimeReminderAfterSend(reminderId);
      }
    }

    saveSentLog();
  } finally {
    dispatchInFlight = false;
  }
}

function dispatchKey(reminderId, contact, now) {
  const nowParts = getZonedDateTimeParts(now);
  const minuteBucket =
    `${nowParts.date}T${String(nowParts.hour).padStart(2, "0")}:` +
    `${String(nowParts.minute).padStart(2, "0")}`;
  return `${reminderId}|${contact}|${minuteBucket}`;
}


async function fetchRemindersRaw() {
  const { stdout } = await execFileAsync(
    "curl",
    ["--silent", "--show-error", "--fail", "--location", "--request", "GET", REMINDERS_URL],
    { maxBuffer: 10 * 1024 * 1024 }
  );
  return stdout;
}

async function fetchLastUpdatedRaw() {
  const { stdout } = await execFileAsync(
    "curl",
    ["--silent", "--show-error", "--fail", "--location", "--request", "GET", LAST_UPDATED_URL],
    { maxBuffer: 1024 * 1024 }
  );
  return stdout;
}

function parseReminders(raw) {
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object") {
    return {};
  }
  return parsed;
}

function parseLastUpdated(raw) {
  const parsed = JSON.parse(raw);
  if (parsed === null || typeof parsed === "undefined") {
    return null;
  }
  if (typeof parsed === "number" && Number.isFinite(parsed) && parsed >= 0) {
    return Math.trunc(parsed);
  }
  if (typeof parsed === "string" && /^\d+$/.test(parsed.trim())) {
    const value = Number(parsed.trim());
    if (Number.isFinite(value) && value >= 0) {
      return Math.trunc(value);
    }
  }
  return null;
}

async function fetchLastUpdatedValue() {
  const raw = await fetchLastUpdatedRaw();
  return parseLastUpdated(raw);
}

async function deleteReminderRecord(reminderId) {
  const url = reminderDeleteUrl(reminderId);
  await execFileAsync(
    "curl",
    ["--silent", "--show-error", "--fail", "--location", "--request", "DELETE", url],
    { maxBuffer: 1024 * 1024 }
  );
}

async function updateLastUpdatedNow() {
  const nowTs = Date.now();
  await execFileAsync(
    "curl",
    [
      "--silent",
      "--show-error",
      "--fail",
      "--location",
      "--request",
      "PUT",
      "--header",
      "Content-Type: application/json",
      "--data-raw",
      String(nowTs),
      LAST_UPDATED_URL
    ],
    { maxBuffer: 1024 * 1024 }
  );
  return nowTs;
}

async function deleteOneTimeReminderAfterSend(reminderId) {
  try {
    logInfo(`Deleting one_time reminder ${reminderId} from Firebase.`);
    await deleteReminderRecord(reminderId);
    const newLastUpdated = await updateLastUpdatedNow();
    cachedLastUpdated = newLastUpdated;
    delete currentReminders[reminderId];
    logInfo(`Deleted one_time reminder ${reminderId} and updated last_updated=${newLastUpdated}.`);
  } catch (error) {
    logError(
      `Failed to delete one_time reminder ${reminderId} and/or update last_updated.`,
      error.message || error
    );
  }
}

async function reloadReminders(reason) {
  const raw = await fetchRemindersRaw();
  const parsed = parseReminders(raw);
  const hasChanged = previousRawSnapshot === null || raw !== previousRawSnapshot;

  currentReminders = parsed;
  previousRawSnapshot = raw;
  hasHydratedReminders = true;

  if (hasChanged) {
    logReminderSnapshot(`${reason} Reminder payload updated.`);
  } else {
    logReminderSnapshot(`${reason} Reminder payload unchanged after refresh.`);
  }
}

async function refreshReminders() {
  if (refreshInFlight) {
    logWarn("Refresh cycle skipped because previous cycle is still running.");
    return;
  }
  refreshInFlight = true;

  try {
    const remoteLastUpdated = await fetchLastUpdatedValue();

    if (remoteLastUpdated === null) {
      if (!hasHydratedReminders) {
        await reloadReminders("last_updated is null/invalid. Loaded initial reminder cache.");
      } else {
        logReminderSnapshot("last_updated is null/invalid. Using cached reminders without full fetch.");
      }
      return;
    }

    if (!hasHydratedReminders) {
      await reloadReminders(`Initialized reminder cache using last_updated=${remoteLastUpdated}.`);
      cachedLastUpdated = remoteLastUpdated;
      return;
    }

    if (cachedLastUpdated === null || remoteLastUpdated > cachedLastUpdated) {
      const previous = cachedLastUpdated;
      await reloadReminders(
        previous === null
          ? `Detected first numeric last_updated=${remoteLastUpdated}.`
          : `Detected last_updated increase ${previous} -> ${remoteLastUpdated}.`
      );
      cachedLastUpdated = remoteLastUpdated;
      return;
    }

    if (remoteLastUpdated < cachedLastUpdated) {
      logWarn(
        `last_updated moved backwards ${cachedLastUpdated} -> ${remoteLastUpdated}. Keeping cached reminders.`
      );
      logReminderSnapshot("Current cached reminder setup:");
      return;
    }

    logReminderSnapshot(`last_updated unchanged (${remoteLastUpdated}). Skipping reminders fetch.`);
  } catch (error) {
    logError("Failed to refresh reminders via last_updated/reminders curl GET.", error.message || error);
  } finally {
    refreshInFlight = false;
  }
}

function checkWacliAvailability() {
  const result = spawnSync("wacli", ["--help"], {
    stdio: "ignore"
  });

  if (result.error && result.error.code === "ENOENT") {
    isWacliAvailable = false;
    logWarn(
      "wacli is not installed or not in PATH. Install it to enable WhatsApp dispatch."
    );
    return;
  }

  isWacliAvailable = true;
  logInfo("wacli detected.");
}

async function tick() {
  await refreshReminders();
  await evaluateAndDispatchDueReminders();
}

async function run() {
  logInfo("Starting reminder dispatcher (read-mostly; one_time cleanup enabled).");
  logInfo(`Cache-buster source: ${LAST_UPDATED_URL}`);
  logInfo(`Reminders source (on cache miss): ${REMINDERS_URL}`);
  logInfo(`Reminder evaluation timezone: ${REMINDER_TIMEZONE}`);
  logInfo(`Cache check interval (ms): ${POLL_INTERVAL_MS}`);
  logInfo(`Dispatch evaluation interval (ms): ${TICK_INTERVAL_MS}`);

  loadSentLog();
  checkWacliAvailability();

  await tick();

  setInterval(async () => {
    await evaluateAndDispatchDueReminders();
  }, TICK_INTERVAL_MS);

  setInterval(async () => {
    await refreshReminders();
  }, POLL_INTERVAL_MS);
}

run().catch((error) => {
  logError("Fatal startup error.", error);
  process.exit(1);
});
