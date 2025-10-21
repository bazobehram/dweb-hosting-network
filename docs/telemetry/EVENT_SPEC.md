# Telemetry Event Specification (Phase 1)

This document defines the structured events every component emits during Phase 1 of the telemetry pipeline. All payloads are JSON objects with ISO-8601 timestamps. Required fields MUST be present; optional fields MAY be omitted or set to `null`. Each event carries a shared envelope for traceability.

## Common Envelope

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `event` | string | Yes | Event name (see tables below). |
| `timestamp` | string (ISO-8601) | Yes | Event creation time. |
| `sessionId` | string | Yes | Unique session identifier (per publish/resolve session). |
| `manifestId` | string | No | Associated manifest when applicable. |
| `domain` | string | No | Domain involved (resolve/bind flows). |
| `peerId` | string | No | Local peer emitting the event. |
| `targetPeerId` | string | No | Remote peer involved, if any. |
| `correlationId` | string | No | Optional correlation key for grouping sub-events. |

## Event Definitions

### `connection.attempt`
Emitted by panel/resolver when initiating a WebRTC connection.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `role` | enum (`"panel"`, `"resolver"`) | Yes | Component initiating the attempt. |
| `signalingUrl` | string | Yes | Signaling endpoint used. |
| `iceTransport` | enum (`"all"`, `"relay"`, `"none"`) | Yes | ICE policy in use. |
| `startTime` | string (ISO-8601) | Yes | Attempt start timestamp. |
| `endTime` | string (ISO-8601) | No | Completion time. |
| `durationMs` | number | No | Derived duration. |
| `result` | enum (`"success"`, `"timeout"`, `"error"`) | Yes | Outcome. |
| `relay` | boolean | Yes | Whether the final candidate pair uses relay. |
| `errorCode` | string | No | Signaling/ICE error code if failure. |

### `replication.job`
Emitted by panel when a replication job is scheduled or completes.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `state` | enum (`"scheduled"`, `"in_progress"`, `"completed"`, `"failed"`) | Yes | Job state. |
| `replicaCount` | number | Yes | Total target replicas for the job. |
| `ackedChunks` | number | No | Count of acknowledged chunks. |
| `totalChunks` | number | Yes | Chunk count for manifest. |
| `retryCount` | number | No | Total retries attempted. |
| `quorumReached` | boolean | Yes | Whether quorum is satisfied. |
| `latencyMs` | number | No | Job latency (first send -> completion). |
| `failureReason` | string | No | Reason if `state=failed`. |

### `replication.chunk`
Chunk-level status emitted on each ACK/NACK/timeout.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `chunkIndex` | number | Yes | Zero-based chunk index. |
| `status` | enum (`"ack"`, `"nack"`, `"timeout"`) | Yes | Result. |
| `attempt` | number | Yes | Attempt number. |
| `elapsedMs` | number | No | Time between send and response. |
| `reason` | string | No | Optional error detail. |

### `resolve.chunk`
Resolver emits for each chunk retrieval attempt.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `chunkIndex` | number | Yes | Chunk index. |
| `source` | enum (`"peer"`, `"cache"`, `"pointer"`, `"registry"`, `"fallback-none"`) | Yes | Data source. |
| `durationMs` | number | Yes | Fetch duration. |
| `fallbackTriggered` | boolean | Yes | Whether a fallback path was used. |
| `fallbackReason` | string | No | Reason if fallback. |

### `resolve.summary`
Emitted once per resolve flow.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `chunkCount` | number | Yes | Total chunks requested. |
| `peerHits` | number | Yes | Chunks served from peers. |
| `fallbackHits` | number | Yes | Chunks served via fallback. |
| `ttfbMs` | number | Yes | Time to first byte. |
| `totalDurationMs` | number | Yes | Manifest resolve total duration. |
| `relayUsage` | boolean | Yes | Whether the session used relay. |

### `error.event`
Generic error signal from any component.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `component` | enum (`"panel"`, `"resolver"`, `"signaling"`, `"registry"`, `"storage"`) | Yes | Source component. |
| `context` | string | No | Free-form context (e.g., function name). |
| `message` | string | Yes | Error message. |
| `code` | string | No | Error or status code. |

### `peer.heartbeat`
Periodic heartbeat from coordination services (e.g., signaling) about known peers.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `peerId` | string | Yes | Peer identifier. |
| `lastSeen` | string (ISO-8601) | Yes | Last heartbeat timestamp. |
| `uptimeMs` | number | No | Reported uptime if available. |
| `capabilities` | array[string] | No | Capabilities advertised. |
| `latencyMs` | number | No | Observed round-trip latency (median). |
| `successRate` | number | No | Rolling success rate (0-1). |

### `ttfb.measure`
Explicit time-to-first-byte measurement for publish/resolve flows.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `flow` | enum (`"publish"`, `"resolve"`) | Yes | Flow type. |
| `ttfbMs` | number | Yes | Time to first byte. |
| `totalTimeMs` | number | No | Full operation duration. |
| `networkProfile` | string | No | Network condition (direct/relay/etc.). |

## Validation Rules

- Required fields must be defined and non-null; emitters MUST validate before sending.
- `timestamp`, `startTime`, `endTime`, `lastSeen` must be ISO-8601 with timezone (UTC preferred).
- Numerical durations in milliseconds.
- Percentages (e.g., success rates) are decimal fractions (0-1).
- Event size must be <= 4 KB.
- Emitters retry once on transport failure; after that, log locally and continue.

## Storage & Retention (Phase 1)

- Events delivered to a local telemetry collector via HTTPS `POST /telemetry/events`.
- Collector writes to append-only log (JSON Lines) and ingests into SQLite/Timescale with a `gauge_time` column.
- Retention: <= 7 days active in SQLite; nightly archive to compressed JSON for export.

## Query Guidelines

- A 24-hour report groups by `event` and aggregates:
  - Direct vs relay rate (`connection.attempt`).
  - Median TTFB (`resolve.summary`, `ttfb.measure`).
  - Replication success (`replication.job` with `state=completed`, `totalChunks`).
  - Top/bottom peers (success rate, latency) using `peer.heartbeat` + replication stats.
- Missing/invalid fields should be <1%; collector runs validation and logs anomalies under `telemetry.validation`.

## Next Steps

- Implement emitters per component adhering to this spec.
- Build ingestion service with validation & query endpoints.
- Create dashboard/report pulling the metrics above.
