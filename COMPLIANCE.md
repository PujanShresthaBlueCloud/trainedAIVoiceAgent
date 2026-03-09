# Australian Government & Medical Compliance Documentation

**Platform:** TrainedLogic Voice AI Platform
**Version:** 1.0.0
**Last Updated:** March 2026
**Classification:** Internal — Compliance & Security

---

## Table of Contents

1. [Regulatory Scope](#1-regulatory-scope)
2. [Architecture Overview](#2-architecture-overview)
3. [Phase 1 — Security Hardening](#3-phase-1--security-hardening)
4. [Phase 2 — Audit Logging](#4-phase-2--audit-logging)
5. [Phase 3 — PII Handling](#5-phase-3--pii-handling)
6. [Phase 4 — Compliance Endpoints](#6-phase-4--compliance-endpoints)
7. [Phase 5 — Voice Pipeline Consent](#7-phase-5--voice-pipeline-consent)
8. [Phase 6 — Data Retention](#8-phase-6--data-retention)
9. [Phase 7 — Auth Hardening](#9-phase-7--auth-hardening)
10. [Phase 8 — Frontend Dashboard](#10-phase-8--frontend-dashboard)
11. [Database Schema Changes](#11-database-schema-changes)
12. [Configuration Reference](#12-configuration-reference)
13. [Middleware Stack](#13-middleware-stack)
14. [Verification Checklist](#14-verification-checklist)
15. [Infrastructure Recommendations](#15-infrastructure-recommendations)
16. [Operational Runbooks](#16-operational-runbooks)
17. [File Inventory](#17-file-inventory)

---

## 1. Regulatory Scope

This implementation addresses the following Australian regulatory frameworks:

### 1.1 Privacy Act 1988 — Australian Privacy Principles (APPs)

| Principle | Requirement | Implementation |
|-----------|-------------|----------------|
| **APP 1** | Open and transparent management of personal information | Compliance status dashboard at `/compliance`, audit logging |
| **APP 6** | Use or disclosure of personal information | PII masking on API responses, caller numbers masked |
| **APP 8** | Cross-border disclosure | Infrastructure recommendations for AU-region hosting |
| **APP 11** | Security of personal information | Security headers, CORS restrictions, rate limiting, JWT hardening |
| **APP 12** | Access to personal information | `POST /api/compliance/data-export` endpoint |
| **APP 13** | Correction/deletion of personal information | `POST /api/compliance/data-deletion` endpoint |

### 1.2 My Health Records Act 2012

| Requirement | Implementation |
|-------------|----------------|
| Consent for recording | Consent records tracked per call in `consent_records` table |
| Audit trail | All state-changing requests logged to `audit_logs` table |
| Data minimisation | PII redaction in transcripts, data retention cleanup |

### 1.3 ASD Essential Eight

| Control | Implementation |
|---------|----------------|
| Application hardening | Security headers (CSP, HSTS, X-Frame-Options) |
| Restrict admin privileges | `/api/diagnostics` and `/api/migrate` behind JWT auth |
| Patch applications | JWKS cache TTL ensures key rotation is picked up |
| Multi-factor auth | Delegated to Clerk (external auth provider) |

### 1.4 ISM (Information Security Manual) Readiness

| Control | Implementation |
|---------|----------------|
| Access control | Clerk JWT verification on all API routes |
| Audit & accountability | AuditMiddleware logs all mutating requests |
| Data at rest protection | Delegated to Supabase (recommend AES-256 backups) |
| Data in transit protection | HSTS header enforces HTTPS |

---

## 2. Architecture Overview

### Before (Vulnerable State)

```
Client ──→ FastAPI ──→ Supabase
           │
           ├── CORS: * (all origins allowed)
           ├── Error handler: exposes stack traces + exception types
           ├── No audit logging
           ├── No PII masking
           ├── No rate limiting
           ├── No security headers
           ├── No data retention policy
           ├── No consent tracking
           └── /api/diagnostics: unauthenticated
```

### After (Hardened State)

```
Client ──→ SecurityHeadersMiddleware
              ──→ RateLimitMiddleware
                  ──→ AuditMiddleware
                      ──→ CORSMiddleware (origin-validated)
                          ──→ FastAPI App
                              ├── JWT Auth (Clerk, JWKS 6h TTL, 30s skew)
                              ├── PII masking on responses
                              ├── Sanitized error handler
                              ├── Consent recording on calls
                              └── Supabase
                                  ├── audit_logs table
                                  ├── consent_records table
                                  └── calls (pii_redacted, retention_expires_at)
```

---

## 3. Phase 1 — Security Hardening

**Priority:** P0 (Critical)
**Status:** Implemented and verified

### 3.1 Security Headers

**File:** `backend/app/middleware/security_headers.py`

The `SecurityHeadersMiddleware` is an ASGI middleware that injects security headers into every HTTP response. It is the outermost middleware in the stack, ensuring headers are present even on error responses.

**Headers applied:**

| Header | Value | Purpose |
|--------|-------|---------|
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | Forces HTTPS for 2 years, covers all subdomains, eligible for browser preload lists |
| `Content-Security-Policy` | `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'` | Restricts resource loading to same-origin, prevents XSS and clickjacking |
| `X-Content-Type-Options` | `nosniff` | Prevents MIME-type sniffing attacks |
| `X-Frame-Options` | `DENY` | Prevents the page from being embedded in iframes (clickjacking) |
| `X-XSS-Protection` | `1; mode=block` | Enables legacy browser XSS filters |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limits referrer information leaked to third parties |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=()` | Disables browser APIs not needed by the backend |
| `Cache-Control` | `no-store` | Prevents caching of API responses containing sensitive data |

**How it works:**

The middleware wraps the ASGI `send` callable. When a response starts (`http.response.start`), it appends the security headers to the existing headers list before forwarding to the client. WebSocket connections (`scope["type"] != "http"`) are passed through untouched.

### 3.2 CORS Hardening

**File:** `backend/app/main.py` — `CORSMiddleware` class

**Before:** Every response included `Access-Control-Allow-Origin: *`, allowing any website to make authenticated requests to the API.

**After:** Origin validation logic based on `APP_ENV`:

| Environment | Behaviour |
|-------------|-----------|
| `development` | All origins allowed (for local development with `localhost:3000`) |
| `staging` / `production` | Only origins listed in `ALLOWED_ORIGINS` env var are allowed |

**Flow for each request:**

1. Extract the `Origin` header from the incoming request
2. If no origin or origin not allowed:
   - `OPTIONS` preflight → respond `403 Forbidden`
   - Other methods → pass through without CORS headers (browser blocks the response)
3. If origin is allowed:
   - `OPTIONS` preflight → respond `200` with CORS headers scoped to that origin
   - Other methods → proxy the request, inject CORS headers on response

**Allowed headers are now explicit:** `Authorization, Content-Type` (not `*`).

### 3.3 Error Sanitization

**File:** `backend/app/main.py` — `global_exception_handler`

**Before:**
```json
{"error": "connection refused to database", "type": "ConnectionError"}
```

**After:**
```json
{"error": "An internal error occurred", "reference": "a1b2c3d4"}
```

The reference ID is an 8-character UUID prefix logged server-side with full stack trace (`exc_info=True`). Support staff can search logs by reference to diagnose issues without exposing internals to clients.

### 3.4 Protected Diagnostics

**Before:** `GET /api/diagnostics` was unauthenticated — anyone could probe which API keys were configured.

**After:** Both `/api/diagnostics` and `/api/migrate` require a valid Clerk JWT (`dependencies=_auth`).

### 3.5 Rate Limiting

**File:** `backend/app/middleware/rate_limit.py`

**Algorithm:** Sliding window counter per client IP.

**How it works:**

1. On each request, extract the client IP from `scope["client"]`
2. Maintain an in-memory dictionary mapping IP → list of request timestamps
3. Prune timestamps older than 60 seconds
4. If remaining count >= `RATE_LIMIT_PER_MINUTE` (default: 60), return `429 Too Many Requests` with a `Retry-After: 60` header
5. Otherwise, record the timestamp and pass through

**Response when rate limited:**
```json
HTTP/1.1 429 Too Many Requests
Retry-After: 60

{"error": "Rate limit exceeded. Try again later."}
```

**Limitations:**
- In-memory storage — resets on server restart, not shared across workers
- For production with multiple workers, replace with Redis-backed rate limiting

---

## 4. Phase 2 — Audit Logging

**Priority:** P1 (High)
**Status:** Implemented and verified

### 4.1 Audit Logs Table

**Table:** `audit_logs` in Supabase

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `timestamp` | TIMESTAMPTZ | When the event occurred (UTC) |
| `user_id` | TEXT | Clerk user ID (if authenticated) |
| `user_email` | TEXT | User email (if available) |
| `action` | TEXT | What happened, e.g. `POST /api/agents` |
| `resource_type` | TEXT | Extracted from URL path, e.g. `agents` |
| `resource_id` | TEXT | Extracted from URL path, e.g. the agent UUID |
| `ip_address` | TEXT | Client IP address |
| `user_agent` | TEXT | Browser/client user agent string |
| `request_method` | TEXT | HTTP method (POST, PUT, PATCH, DELETE) |
| `request_path` | TEXT | Full request path |
| `status_code` | INTEGER | HTTP response status code |
| `details` | TEXT | Free-form additional context |

**Indexes:** `timestamp`, `user_id`, `action` — for fast querying in the compliance dashboard.

### 4.2 Audit Middleware

**File:** `backend/app/audit.py` — `AuditMiddleware`

The middleware automatically logs all state-changing HTTP requests (POST, PUT, PATCH, DELETE). GET requests are not logged to avoid excessive noise.

**Flow:**

1. Check if `scope["method"]` is in `{POST, PUT, PATCH, DELETE}`
2. If not, pass through without logging
3. If yes, wrap the `send` callable to capture the response status code
4. After the response is sent, extract resource info from the URL path
5. Call `log_audit_event()` to insert a row into `audit_logs`

### 4.3 Manual Audit Logging

**Function:** `log_audit_event()` in `backend/app/audit.py`

Can be called directly from any endpoint for explicit audit events:

```python
from app.audit import log_audit_event

await log_audit_event(
    action="data_export",
    resource_type="compliance",
    details=f"Data export for +61412345678",
)
```

The function is fire-and-forget — if the database insert fails, it logs an error but does not raise an exception.

Audit logging can be disabled entirely by setting `AUDIT_LOG_ENABLED=false` in the `.env` file.

---

## 5. Phase 3 — PII Handling

**Priority:** P1 (High)
**Status:** Implemented and verified

### 5.1 PII Masking Functions

**File:** `backend/app/pii.py`

#### `mask_phone_number(phone)`

Masks phone numbers while preserving enough structure to identify the number type:

| Input | Output |
|-------|--------|
| `+61412345678` | `+61****5678` |
| `0412345678` | `0412****78` |
| `+1555123456` | `+15****3456` |
| `""` or `None` | `""` |

#### `mask_email(email)`

Masks email addresses while preserving the domain:

| Input | Output |
|-------|--------|
| `user@example.com` | `u***@example.com` |
| `a@test.com` | `a***@test.com` |

#### `redact_pii_from_transcript(text)`

Scans free-form text (transcripts) for Australian PII patterns and replaces them:

| Pattern | Regex | Replacement |
|---------|-------|-------------|
| AU phone numbers | `+61 4xx xxx xxx`, `04xx xxx xxx`, `(02) xxxx xxxx` | `[PHONE REDACTED]` |
| Medicare numbers | `xxxx xxxxx xx` (10-11 digits) | `[MEDICARE REDACTED]` |
| Email addresses | Standard email pattern | `[EMAIL REDACTED]` |
| Tax File Numbers | `xxx xxx xxx` near keywords `TFN`, `tax file number`, `tax number` | `[TFN REDACTED]` |

**TFN redaction is contextual** — digit sequences are only redacted when they appear near tax-related keywords, to avoid false positives on other 9-digit numbers.

### 5.2 API Response Masking

**File:** `backend/app/routers/calls.py`

The `_mask_call()` function is applied to all call records before they are returned by the `GET /api/calls` and `GET /api/calls/{id}` endpoints:

```python
def _mask_call(call: dict) -> dict:
    if call.get("caller_number"):
        call["caller_number"] = mask_phone_number(call["caller_number"])
    return call
```

**Before:** `"caller_number": "+61412345678"`
**After:** `"caller_number": "+61****5678"`

---

## 6. Phase 4 — Compliance Endpoints

**Priority:** P1 (High)
**Status:** Implemented and verified
**File:** `backend/app/routers/compliance.py`
**Base path:** `/api/compliance`

All endpoints require JWT authentication.

### 6.1 Data Export (APP 12)

```
POST /api/compliance/data-export
```

**Purpose:** Fulfil data access requests under Australian Privacy Principle 12.

**Request body:**
```json
{
  "phone_number": "+61412345678"
}
```

**Response:** A complete data bundle containing:
```json
{
  "phone_number": "+61412345678",
  "exported_at": "2026-03-09T12:00:00Z",
  "calls": [...],
  "transcripts": [...],
  "function_call_logs": [...],
  "consent_records": [...]
}
```

**Process:**
1. Query `calls` table for all records matching the phone number
2. For each call, fetch transcript entries, function call logs, and consent records
3. Bundle everything into a single JSON response
4. Log an audit event with action `data_export`

**Frontend integration:** The compliance dashboard downloads this as a `.json` file automatically.

### 6.2 Data Deletion (APP 13)

```
POST /api/compliance/data-deletion
```

**Purpose:** Fulfil data deletion/correction requests under Australian Privacy Principle 13.

**Request body:**
```json
{
  "phone_number": "+61412345678"
}
```

**Response:**
```json
{
  "phone_number": "+61412345678",
  "deleted_at": "2026-03-09T12:00:00Z",
  "affected": {
    "calls": 5,
    "transcripts": 42,
    "function_logs": 0,
    "consent_records": 3
  }
}
```

**Process:**
1. Find all calls for the phone number
2. For each call:
   - Redact transcript entry content to `[REDACTED — data deletion request]`
   - Delete function call logs
   - Delete consent records
3. Update call records: null out `caller_number`, set `pii_redacted=true`, redact summary
4. Log an audit event with action `data_deletion`

**Important:** This is a soft-delete with redaction, not a hard delete. Call records remain for aggregate analytics but are stripped of all PII.

### 6.3 Consent Recording

```
POST /api/compliance/consent
```

**Request body:**
```json
{
  "call_id": "uuid",
  "caller_number": "+61412345678",
  "consent_type": "call_recording",
  "consent_given": true,
  "consent_method": "verbal"
}
```

Consent records have an `expires_at` field automatically set to `DATA_RETENTION_DAYS` from now.

```
GET /api/compliance/consent/{call_id}
```

Returns the consent status and all consent records for a given call:
```json
{
  "call_id": "uuid",
  "consent_given": true,
  "records": [...]
}
```

### 6.4 Retention Cleanup

```
POST /api/compliance/retention/cleanup
```

Triggers the data retention cleanup process manually. Returns:
```json
{
  "status": "completed",
  "cutoff_date": "2025-03-09T00:00:00Z",
  "redacted_calls": 12,
  "redacted_transcripts": 87,
  "retention_days": 365
}
```

### 6.5 Compliance Status

```
GET /api/compliance/status
```

Returns a machine-readable compliance posture checklist:
```json
{
  "checks": [
    {"name": "Security Headers", "status": "enabled", "description": "..."},
    {"name": "CORS Restrictions", "status": "development_mode", "description": "..."},
    {"name": "Rate Limiting", "status": "enabled", "description": "..."},
    {"name": "Audit Logging", "status": "enabled", "description": "..."},
    {"name": "PII Masking", "status": "enabled", "description": "..."},
    {"name": "Data Retention Policy", "status": "configured", "description": "..."},
    {"name": "Error Sanitization", "status": "enabled", "description": "..."},
    {"name": "JWT Validation", "status": "enabled", "description": "..."},
    {"name": "Data Export (APP 12)", "status": "available", "description": "..."},
    {"name": "Data Deletion (APP 13)", "status": "available", "description": "..."},
    {"name": "Consent Recording", "status": "enabled", "description": "..."}
  ],
  "environment": "development",
  "data_retention_days": 365
}
```

### 6.6 Audit Logs

```
GET /api/compliance/audit-logs?limit=50&offset=0
```

Returns recent audit log entries, ordered by timestamp descending. Supports pagination via `limit` and `offset` query parameters.

---

## 7. Phase 5 — Voice Pipeline Consent

**Priority:** P2 (Medium)
**Status:** Implemented
**File:** `backend/livekit_agent.py`

When a call starts and the call status is updated to `in-progress`, the agent automatically inserts a consent record:

```python
db.table("consent_records").insert({
    "call_id": call_id,
    "caller_number": caller_number,
    "consent_type": "call_recording",
    "consent_given": True,
    "consent_method": "implicit_continued_participation",
}).execute()
```

**Consent method:** `implicit_continued_participation` — the caller consented by continuing the call after being informed of recording (assumes the agent's welcome message or IVR includes a recording notice).

**Recommendation:** Configure each agent's welcome message to include: *"This call may be recorded for quality and compliance purposes."*

---

## 8. Phase 6 — Data Retention

**Priority:** P2 (Medium)
**Status:** Implemented
**File:** `backend/app/tasks/retention.py`

### 8.1 How It Works

The retention cleanup process:

1. Calculates the cutoff date: `now() - DATA_RETENTION_DAYS` (default: 365 days)
2. Queries calls where `started_at < cutoff` AND `pii_redacted` is null or false
3. For each expired call:
   - Scans transcript entries for PII patterns (phones, Medicare, emails, TFNs)
   - Replaces matched patterns with redaction markers (e.g. `[PHONE REDACTED]`)
   - Nulls out `caller_number` on the call record
   - Sets `pii_redacted = true` and `retention_expires_at = now()`
4. Returns a summary of how many records were redacted

### 8.2 Running the Cleanup

**Manual trigger via API:**
```bash
curl -X POST http://localhost:8000/api/compliance/retention/cleanup \
  -H "Authorization: Bearer <token>"
```

**Manual trigger via CLI:**
```bash
cd backend
python -m app.tasks.retention
```

**Automated (cron job):**
```bash
# Run daily at 2:00 AM AEST
0 2 * * * cd /path/to/backend && /path/to/venv/bin/python -m app.tasks.retention
```

### 8.3 Database Columns

| Column | Table | Type | Purpose |
|--------|-------|------|---------|
| `pii_redacted` | `calls` | BOOLEAN | Whether PII has been scrubbed from this record |
| `retention_expires_at` | `calls` | TIMESTAMPTZ | When the retention cleanup processed this record |

---

## 9. Phase 7 — Auth Hardening

**Priority:** P3 (Standard)
**Status:** Implemented
**File:** `backend/app/auth.py`

### 9.1 JWKS Cache TTL

**Before:** JWKS keys were cached indefinitely — if Clerk rotated keys, the only way to pick up new keys was a server restart or a cache-miss retry.

**After:** JWKS cache has a 6-hour TTL (`_JWKS_CACHE_TTL = 21600`). After 6 hours, the next request fetches fresh keys from Clerk.

**Key rotation flow:**
1. Request arrives with JWT signed by new key
2. `kid` not found in cached JWKS → cache invalidated, fresh JWKS fetched
3. New key found → JWT validated, cache updated with new TTL

### 9.2 Clock Skew Tolerance

**Before:** No clock skew tolerance — JWTs could be rejected if the server clock was slightly behind Clerk's clock.

**After:** 30-second `leeway` parameter on `jwt.decode()`, allowing tokens issued up to 30 seconds in the future or expired up to 30 seconds ago to be accepted.

---

## 10. Phase 8 — Frontend Dashboard

**Priority:** P2 (Medium)
**Status:** Implemented

### 10.1 Compliance Page

**File:** `frontend/app/compliance/page.tsx`
**Route:** `/compliance`

The dashboard provides three sections:

**Compliance Posture Checklist:**
- Lists all compliance controls with their status (enabled/configured/development_mode)
- Green badges for active controls, yellow for development mode
- Fetched from `GET /api/compliance/status`

**Data Subject Actions:**
- Phone number input field
- "Export Data (APP 12)" button — triggers data export, downloads as JSON file
- "Delete Data (APP 13)" button — confirms with dialog, then redacts all data
- "Run Retention Cleanup" button — triggers manual retention cleanup
- Status message showing results of each action

**Audit Log Table:**
- Shows recent audit entries with timestamp, action, resource, IP address, and status code
- Status codes colour-coded: green (<400), yellow (4xx), red (5xx)
- Fetched from `GET /api/compliance/audit-logs`

### 10.2 Sidebar Navigation

**File:** `frontend/components/Sidebar.tsx`

Added a new "COMPLIANCE" section with a ShieldCheck icon linking to `/compliance`.

### 10.3 API Client

**File:** `frontend/lib/api.ts`

Added compliance API methods:

| Method | Endpoint |
|--------|----------|
| `api.getComplianceStatus()` | `GET /api/compliance/status` |
| `api.getAuditLogs(limit)` | `GET /api/compliance/audit-logs` |
| `api.requestDataExport(phone)` | `POST /api/compliance/data-export` |
| `api.requestDataDeletion(phone)` | `POST /api/compliance/data-deletion` |
| `api.recordConsent(data)` | `POST /api/compliance/consent` |
| `api.getConsent(callId)` | `GET /api/compliance/consent/{callId}` |
| `api.triggerRetentionCleanup()` | `POST /api/compliance/retention/cleanup` |

---

## 11. Database Schema Changes

### 11.1 New Tables

**`audit_logs`** — Stores all audit trail entries for compliance reporting.

```sql
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    timestamp TIMESTAMPTZ DEFAULT now(),
    user_id TEXT,
    user_email TEXT,
    action TEXT NOT NULL,
    resource_type TEXT,
    resource_id TEXT,
    ip_address TEXT,
    user_agent TEXT,
    request_method TEXT,
    request_path TEXT,
    status_code INTEGER,
    details TEXT
);
```

**`consent_records`** — Tracks consent for call recording per call.

```sql
CREATE TABLE IF NOT EXISTS consent_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    call_id UUID REFERENCES calls(id) ON DELETE CASCADE,
    caller_number TEXT,
    consent_type TEXT NOT NULL DEFAULT 'call_recording',
    consent_given BOOLEAN NOT NULL DEFAULT false,
    consent_method TEXT DEFAULT 'verbal',
    recorded_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ
);
```

### 11.2 Modified Tables

**`calls`** — Two new columns:

```sql
ALTER TABLE calls ADD COLUMN IF NOT EXISTS retention_expires_at TIMESTAMPTZ;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS pii_redacted BOOLEAN DEFAULT false;
```

### 11.3 Indexes

```sql
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_consent_records_call_id ON consent_records(call_id);
```

---

## 12. Configuration Reference

All settings are in `backend/app/config.py` and loaded from `backend/.env`.

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_ENV` | `development` | Environment mode: `development`, `staging`, or `production` |
| `ALLOWED_ORIGINS` | `""` (empty) | Comma-separated list of allowed CORS origins. Required when `APP_ENV != development` |
| `DATA_RETENTION_DAYS` | `365` | Number of days before PII is auto-redacted from call records |
| `RATE_LIMIT_PER_MINUTE` | `60` | Maximum requests per minute per client IP |
| `AUDIT_LOG_ENABLED` | `true` | Whether to write audit log entries to the database |

### Example `.env` for Production

```env
APP_ENV=production
ALLOWED_ORIGINS=https://app.trainedlogic.com,https://admin.trainedlogic.com
DATA_RETENTION_DAYS=365
RATE_LIMIT_PER_MINUTE=60
AUDIT_LOG_ENABLED=true
```

---

## 13. Middleware Stack

Middleware executes in reverse registration order. The registration order in `main.py` is:

```python
app.add_middleware(SecurityHeadersMiddleware)  # 1st registered = outermost
app.add_middleware(RateLimitMiddleware)         # 2nd
app.add_middleware(AuditMiddleware)             # 3rd
app.add_middleware(CORSMiddleware)              # 4th registered = innermost
```

**Request flow (outside → inside):**

```
Client Request
  → SecurityHeadersMiddleware  (adds headers on response)
    → RateLimitMiddleware      (rejects if over limit)
      → AuditMiddleware        (logs POST/PUT/PATCH/DELETE)
        → CORSMiddleware       (validates origin, adds CORS headers)
          → FastAPI Router     (auth + business logic)
```

**Response flow (inside → outside):**

```
FastAPI Router response
  → CORSMiddleware            (CORS headers added)
    → AuditMiddleware          (captures status code, writes audit log)
      → RateLimitMiddleware    (passes through)
        → SecurityHeadersMiddleware  (security headers added)
          → Client
```

---

## 14. Verification Checklist

Run these checks to verify the compliance implementation is working correctly.

### 14.1 Security Headers

```bash
curl -s -D - http://localhost:8000/health
```

**Expected:** All 8 security headers present in response:
- `strict-transport-security`
- `content-security-policy`
- `x-content-type-options: nosniff`
- `x-frame-options: DENY`
- `x-xss-protection: 1; mode=block`
- `referrer-policy: strict-origin-when-cross-origin`
- `permissions-policy`
- `cache-control: no-store`

### 14.2 CORS Rejection (Production Mode)

```bash
APP_ENV=production uvicorn app.main:app &
curl -s -D - -H "Origin: https://evil.com" http://localhost:8000/health | grep access-control
```

**Expected:** No `access-control-allow-origin` header in response.

### 14.3 Error Sanitization

Trigger any 500 error. **Expected response:**
```json
{"error": "An internal error occurred", "reference": "a1b2c3d4"}
```

No stack trace, exception type, or internal details exposed.

### 14.4 Audit Logging

Make a POST/PUT/DELETE request, then check:
```bash
curl http://localhost:8000/api/compliance/audit-logs \
  -H "Authorization: Bearer <token>"
```

**Expected:** The request appears in the audit log with correct method, path, and status code.

### 14.5 PII Masking

```bash
curl http://localhost:8000/api/calls \
  -H "Authorization: Bearer <token>"
```

**Expected:** `caller_number` fields show masked values like `+61****5678`.

### 14.6 Rate Limiting

Send 61+ requests within 60 seconds:
```bash
for i in $(seq 1 65); do
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/health
done
```

**Expected:** First 60 return `200`, subsequent return `429`.

### 14.7 Data Export

```bash
curl -X POST http://localhost:8000/api/compliance/data-export \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"phone_number": "+61412345678"}'
```

**Expected:** Complete data bundle with calls, transcripts, function logs, and consent records.

### 14.8 Data Deletion

```bash
curl -X POST http://localhost:8000/api/compliance/data-deletion \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"phone_number": "+61412345678"}'
```

**Expected:** Affected counts returned, data redacted in database.

### 14.9 Retention Cleanup

```bash
cd backend && python -m app.tasks.retention
```

**Expected:** Output showing number of redacted calls and transcripts.

### 14.10 Frontend Dashboard

Visit `http://localhost:3000/compliance`. **Expected:**
- Compliance posture checklist with green/yellow status badges
- Data export/deletion actions functional
- Audit log table populated after actions

---

## 15. Infrastructure Recommendations

These are documented recommendations that require manual action. They are not implemented in code.

| Service | Current State | Recommendation | Reason |
|---------|--------------|----------------|--------|
| **Supabase** | Tokyo (`ap-northeast-1`) | Migrate to Sydney (`ap-southeast-2`) | APP 8 — data sovereignty, lower latency for AU users |
| **LiveKit Cloud** | Default region | Request AU region or self-host in AWS `ap-southeast-2` | Voice data should not leave AU jurisdiction |
| **Clerk** | Development instance | Upgrade to production, set session lifetime to 1 hour | ASD Essential Eight — session management |
| **Pinecone** | Default region | Use `australia-southeast1` (GCP Sydney) | Knowledge base vectors contain potentially sensitive data |
| **Backups** | Supabase default | Enable AES-256 encrypted backups | ISM — data at rest protection |

### Third-Party Data Processing Agreements (DPAs)

Obtain DPAs from the following providers before processing health/government data:

- OpenAI (LLM provider)
- Deepgram (STT provider)
- Cartesia (TTS provider)
- Anthropic (LLM provider)
- ElevenLabs (TTS provider, if used)
- Pinecone (vector database)

---

## 16. Operational Runbooks

### 16.1 Responding to a Data Access Request (APP 12)

1. Verify the requester's identity (phone, email, or government ID)
2. Log into the compliance dashboard at `/compliance`
3. Enter the requester's phone number
4. Click "Export Data (APP 12)"
5. The JSON file downloads automatically
6. Review the export for completeness
7. Deliver to the requester within **30 days** (APP 12 requirement)
8. The action is automatically audit-logged

### 16.2 Responding to a Data Deletion Request (APP 13)

1. Verify the requester's identity
2. Log into the compliance dashboard at `/compliance`
3. Enter the requester's phone number
4. Click "Delete Data (APP 13)" and confirm the dialog
5. Verify the response shows affected record counts
6. Confirm to the requester within **30 days**
7. The action is automatically audit-logged

### 16.3 Running Retention Cleanup

**Automated (recommended):**

Set up a daily cron job:
```bash
0 2 * * * cd /path/to/backend && /path/to/venv/bin/python -m app.tasks.retention >> /var/log/retention.log 2>&1
```

**Manual:**
```bash
cd backend && python -m app.tasks.retention
```

Or via the compliance dashboard: click "Run Retention Cleanup".

### 16.4 Investigating an Audit Log Entry

1. Go to `/compliance` dashboard or query the API:
   ```bash
   curl http://localhost:8000/api/compliance/audit-logs?limit=100 \
     -H "Authorization: Bearer <token>"
   ```
2. Filter by timestamp, action, or IP address
3. Cross-reference the `resource_type` and `resource_id` with the relevant table
4. For error investigation, match the `reference` from error responses to server logs

### 16.5 Configuring Production CORS

1. Add to `backend/.env`:
   ```env
   APP_ENV=production
   ALLOWED_ORIGINS=https://your-frontend-domain.com
   ```
2. Restart the backend server
3. Verify: `curl -H "Origin: https://evil.com" ...` should not return CORS headers

---

## 17. File Inventory

### New Files Created

| File | Lines | Purpose |
|------|-------|---------|
| `backend/app/middleware/__init__.py` | 4 | Package init, re-exports middleware classes |
| `backend/app/middleware/security_headers.py` | 35 | ASGI middleware injecting 8 security headers |
| `backend/app/middleware/rate_limit.py` | 62 | Sliding window rate limiter per client IP |
| `backend/app/audit.py` | 122 | `log_audit_event()` utility + `AuditMiddleware` ASGI class |
| `backend/app/pii.py` | 91 | PII masking (phone, email) and transcript redaction (AU patterns) |
| `backend/app/routers/compliance.py` | 269 | 7 compliance endpoints: export, deletion, consent, retention, status, audit |
| `backend/app/tasks/__init__.py` | 0 | Package init |
| `backend/app/tasks/retention.py` | 77 | Data retention cleanup script, runnable as `python -m app.tasks.retention` |
| `frontend/app/compliance/page.tsx` | ~280 | Compliance dashboard: checklist, data actions, audit log table |

### Modified Files

| File | Changes |
|------|---------|
| `backend/app/config.py` | Added 5 settings: `ALLOWED_ORIGINS`, `APP_ENV`, `DATA_RETENTION_DAYS`, `RATE_LIMIT_PER_MINUTE`, `AUDIT_LOG_ENABLED` + `get_allowed_origins()` method |
| `backend/app/main.py` | CORS origin validation, sanitized error handler, middleware stack, compliance router, `/api/diagnostics` and `/api/migrate` behind auth |
| `backend/app/database.py` | Added `audit_logs` table, `consent_records` table, `retention_expires_at` and `pii_redacted` columns on `calls`, 4 new indexes |
| `backend/app/auth.py` | JWKS cache TTL (6 hours), cache timestamp tracking, 30-second clock skew tolerance on JWT decode |
| `backend/app/routers/calls.py` | Imported `mask_phone_number`, added `_mask_call()` helper, applied to `list_calls` and `get_call` responses |
| `backend/livekit_agent.py` | Inserts `consent_records` entry when call status changes to `in-progress` |
| `frontend/components/Sidebar.tsx` | Added COMPLIANCE section with ShieldCheck icon |
| `frontend/lib/api.ts` | Added 7 compliance API methods |
