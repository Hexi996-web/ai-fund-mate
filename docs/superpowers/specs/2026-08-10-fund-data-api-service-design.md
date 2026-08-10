# Fund Data API Service Design

**Date:** 2026-08-10  
**Status:** Approved design, pending written-spec review  
**Scope:** Local backend API for a future fund browsing website

## 1. Goal and scope

Build an independently runnable local service that provides:

- A searchable public-fund catalog.
- Latest published net-value context and intraday valuation estimates.
- Explicit provenance and freshness metadata.
- Persistent fallback data when upstream providers fail.
- A health endpoint for local development diagnostics.

The first release excludes accounts, trading, portfolios, charts, production deployment, and a background scheduler. Browser requests trigger refreshes.

## 2. Technology

- Python with FastAPI and generated OpenAPI documentation.
- AKShare for the catalog and published fund data.
- efinance for intraday valuation estimates.
- SQLite for persistent catalog, valuation, and provider state.
- Pydantic settings for environment-based configuration.
- pytest and FastAPI test clients for automated tests.

AKShare and efinance remain behind adapters. Their field names and exceptions do not leak into the public API.

## 3. Architecture

```text
Browser
  -> FastAPI routes
    -> fund, valuation, and health services
      -> AKShare adapter
      -> efinance adapter
      -> SQLite repositories
```

- Routes validate HTTP input and serialize responses.
- Services apply cache, fallback, partial-success, and freshness rules.
- Provider adapters normalize third-party data into stable domain records.
- Repositories own schema and persistence.
- Configuration owns timeouts, TTLs, database path, batch limits, and CORS origins.

## 4. API contract

All endpoints use `/api/v1`.

### `GET /api/v1/funds`

Returns a paginated catalog. Parameters are `q`, `page`, `page_size`, and optional development-only `refresh`. Search matches code or name. Each record includes at least `code`, `name`, and `type`.

### `GET /api/v1/funds/{code}`

Returns a catalog record plus the latest available valuation. Invalid codes return `422`; unknown valid codes return `404` unless a cached valuation exists.

### `POST /api/v1/valuations`

Request:

```json
{"codes":["000001","161725"]}
```

The service validates a configurable batch-size limit and removes duplicates while retaining first-occurrence order. Each successful result contains:

- `code`
- `name`
- `latestNav`
- `latestNavDate`
- `estimatedAt`
- `estimatedChangePercent`

Missing numeric values are `null`, never zero.

### `GET /api/v1/health`

Returns database reachability, record counts, and each provider's latest success and failure information. It is diagnostic information, not an availability guarantee.

## 5. Response metadata

Business endpoints use this envelope:

```json
{
  "data": {},
  "meta": {
    "source": "efinance",
    "status": "fresh",
    "fetchedAt": "2026-08-10T16:30:00+08:00",
    "cached": false,
    "errors": []
  }
}
```

- `source` is a provider name, `cache`, or `mixed`.
- `status` is `fresh`, `stale`, or `partial`.
- `fetchedAt` is the upstream data-fetch time.
- `errors` contains bounded, safe per-code or provider summaries.
- Codes are always six-character strings.

Usable cached data after an upstream failure returns HTTP `200` with `stale`. Complete unavailability returns `503`. Mixed batches retain successful results and use `partial`.

## 6. Persistence and freshness

SQLite contains:

- `fund_catalog`: normalized identity and classification.
- `valuation_cache`: latest published and estimated values by code.
- `source_state`: latest provider success and failure state.

Default TTLs:

- Catalog: 24 hours.
- Intraday valuation during the configured trading window: 60 seconds.
- Valuation outside the trading window: 30 minutes.

Expired records can only be returned as `stale`. Invalid, empty, or implausibly incomplete upstream responses never overwrite valid cache. Successful refreshes write transactionally. Trading-window logic uses `Asia/Shanghai` and is configurable.

## 7. Provider behavior

The AKShare adapter supplies catalog and published net-value information. The efinance adapter supplies intraday estimated changes. Calls have explicit timeouts and normalized errors.

The API never presents an intraday estimate as a confirmed net asset value. Public field names and documentation consistently use `estimated`.

Automated tests use fake providers. A separate manual smoke command checks the installed provider versions against live upstream data.

## 8. CORS and configuration

Default origins:

- `http://localhost:5173`
- `http://127.0.0.1:5173`

Additional origins are configured through an environment variable; wildcard origins are disabled by default. A committed `.env.example` documents SQLite path, provider timeouts, TTLs, batch limit, allowed origins, and log level. `.env` and the database are ignored.

## 9. Errors and logging

- Validation failures: `422`.
- Unknown fund: `404`.
- No live or cached data: `503`.
- Provider logs include provider and operation context.
- Logs exclude keys, environment secrets, stack traces in HTTP responses, and full upstream HTML error pages.
- Partial provider failure does not discard successful batch records.

## 10. Project structure

```text
fund-data-service/
  app/
    main.py
    api/routes/
    core/config.py
    domain/models.py
    providers/
    repositories/
    services/
  tests/
    unit/
    integration/
    fakes/
  data/
  .env.example
  .gitignore
  pyproject.toml
  README.md
```

## 11. Tests

Automated coverage includes:

- Code preservation and input validation.
- Provider normalization and missing values.
- Pagination and code/name search.
- Fresh-cache hits without provider calls.
- Expired-cache refresh.
- Stale fallback after provider failure.
- Invalid upstream responses not overwriting cache.
- Partial-success batches and order preservation.
- Provider health-state updates.
- Allowed and rejected CORS origins.
- `404`, `422`, and `503` behavior.

The default suite requires no network access.

## 12. Documentation

The README documents installation, startup, database location and reset, Swagger URLs, example requests, response freshness semantics, the estimate-versus-confirmed-value distinction, and upstream reliability/licensing limitations.

## 13. Acceptance criteria

- One documented command starts the local service.
- `/docs` exposes the API contract.
- Catalog search returns paginated normalized records.
- Batch valuation returns normalized data and per-code partial failures.
- SQLite cache survives restarts.
- Upstream failure returns clearly marked stale cache when possible.
- Complete unavailability returns `503`.
- Configured local Vite origins can call the API; unconfigured origins are not allowed.
- Automated tests pass without network access.
- A live smoke command reports AKShare and efinance compatibility independently.
