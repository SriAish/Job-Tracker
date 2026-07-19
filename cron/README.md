# Digest scheduling runbook

The daily digest is scheduled by a macOS LaunchAgent. The reference plist
lives at `cron/launchd/local.jobtracker.digest.plist`; the live copy is
`~/Library/LaunchAgents/local.jobtracker.digest.plist`. It runs
`cron/jobtrack.js` at 9:00 AM daily with a 30 second startup wait (the
`wait` flag) so a wake-from-sleep run does not race Wi-Fi reconnection.
Output goes to `cron/digest.log` (gitignored).

## Check it is loaded

```sh
launchctl list | grep local.jobtracker.digest
launchctl print gui/$(id -u)/local.jobtracker.digest
```

## Read the log

```sh
tail -50 cron/digest.log
```

## Run manually without waiting

From the repo root (no wait flag, no email, no file writes):

```sh
node cron/jobtrack.js --dry-run
```

Drop the flag to do a real manual run that sends email and updates
`.seen-jobs.json`.

## Trigger the scheduled job now

```sh
launchctl kickstart gui/$(id -u)/local.jobtracker.digest
```

This is a real run: it sends email and consumes Adzuna budget.

## Unload it

```sh
launchctl bootout gui/$(id -u)/local.jobtracker.digest
```

## Regenerate after moving the repo or changing node versions

The plist hardcodes two machine specific values: the node binary path and
the repo root. To regenerate:

1. Get the current node path with `which node`.
2. In `cron/launchd/local.jobtracker.digest.plist`, update the first
   `ProgramArguments` entry to that node path, and update every occurrence
   of the old repo root (script path, `WorkingDirectory`,
   `StandardOutPath`, `StandardErrorPath`) to the new one.
3. Reinstall and reload:

```sh
launchctl bootout gui/$(id -u)/local.jobtracker.digest 2>/dev/null
cp cron/launchd/local.jobtracker.digest.plist ~/Library/LaunchAgents/
plutil -lint ~/Library/LaunchAgents/local.jobtracker.digest.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/local.jobtracker.digest.plist
```
