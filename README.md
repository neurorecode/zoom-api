# Zoom Meeting Tracker

A live analytics dashboard for a Zoom account: meetings, participants,
recordings and health scoring. All data is read from the Zoom API at request
time — nothing about any account is stored in this repository.

The same code serves any number of Zoom accounts. Deploy it once per account
and give each deployment its own credentials.

## Setup

1. In the Zoom account, create a **Server-to-Server OAuth** app
   (Marketplace → Develop → Build App) and add these scopes:

   ```
   meeting:read:list_meetings:admin
   meeting:read:list_past_instances:admin
   meeting:read:past_meeting:admin
   meeting:read:list_past_participants:admin
   meeting:read:summary:admin          # optional, for AI summaries
   ```

   Leave the scopes marked required, not optional, then activate the app.

2. Set the credentials as environment variables and deploy.

## Environment

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `ZOOM_ACCOUNT_ID` | yes | — | Server-to-Server OAuth app |
| `ZOOM_CLIENT_ID` | yes | — | |
| `ZOOM_CLIENT_SECRET` | yes | — | |
| `ZOOM_TZ_OFFSET_MINUTES` | no | `0` | Display timezone. `330` for IST, `-300` for US Eastern |
| `ZOOM_WINDOW_DAYS` | no | `180` | How far back to pull meeting instances |
| `ZOOM_CACHE_SECONDS` | no | `600` | In-memory cache lifetime |
| `ZOOM_BACKFILL_BUDGET` | no | `60` | Instances described per request while catching up |
| `ZOOM_FETCH_SUMMARIES` | no | `true` | `false` skips AI summaries |
| `ZOOM_CONCURRENCY` | no | `5` | Parallel Zoom calls |

## Checking a deployment

`GET /api/health` reports the serving commit, the Zoom connection and what was
found. `GET /api/health?probe=1` additionally asks Zoom which scopes are
missing and returns the scope names verbatim from Zoom's own error.

## How it loads

Recurring rooms are reused for different people, so each past *instance* is a
separate record: one `meeting_number`, many `meeting_id` UUIDs.

Listing instances costs one call per room; describing one costs two or three.
A sync lists everything, then describes at most `ZOOM_BACKFILL_BUDGET` new
instances. While a backfill is outstanding the next request continues it, so a
large history fills in over a few page loads rather than timing out on one.
`backfill_pending` in `/api/health` shows the remaining count.

The cache lives in the function's memory, so a cold start re-fetches. For a
large account or heavy traffic, move it to a database.

## Layout

```
api/      HTTP handlers, one per endpoint
lib/
  zoom.js      Server-to-Server OAuth client
  meetings.js  the only data source: fetch, map, cache
  metrics.js   duration, health scoring, enrichment
  probe.js     reports which Zoom scopes are missing
  http.js      CORS
src/      React dashboard
```
