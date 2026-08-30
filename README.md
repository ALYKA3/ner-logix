# NER-LOGIX — SIH26002

AI-Based Smart Logistics & Accessibility Intelligence Platform for the North Eastern Region. The working prototype uses Assam as the pilot corridor and demonstrates how essential supplies can be planned, monitored, protected and rerouted during floods, landslides and road or bridge failures.

The product is a decision-support system, not another GPS tracker. It answers: **which road is unsafe, which mission is affected, which delivery is most urgent, which safer route is available, and who must approve the action?**

## Working demo story

1. Admin runs a pre-trip risk scan for `MED-001`, carrying emergency medicines.
2. The Driver explicitly starts device geolocation; authenticated GPS samples are broadcast through WebSockets.
3. A Driver, Field Officer or Control Room operator reports a sudden flood on road `R-02`.
4. The risk engine marks the segment critical and the routing graph removes the blocked edge.
5. NetworkX Dijkstra calculates a safer route through Chandrapur.
6. The Control Room reviews risk, confidence, ETA and mission priority, then approves the reroute.
7. The Driver receives the approved route and accepts it.
8. Field Officer evidence, road status and synchronization state remain visible to the operation.

## Implemented features

### Admin / Control Room

- Locked dark command-dashboard UI with live Assam map
- KPI cards, alerts, risk panel, district connectivity, bottlenecks and supply-gap views
- Pre-trip scan calculated from the latest live corridor risks
- Live `MED-001` device-GPS location updates (simulator is disabled by default)
- Configurable 1–8 vehicle demo-GPS replay with selectable source and destination
- Safe, risky and blocked road styling
- Genuine segment-aligned road geometry from OSRM/OpenStreetMap over Esri satellite imagery, so current, safer and risk routes share the same physical corridors, with cached offline fallback
- Trusted incident declaration and digital road blocking
- Explainable risk, confidence, data source, freshness and factor output
- Affected critical-mission identification
- NetworkX risk-weighted alternate route
- Four-route live risk monitor, re-ranked every 10 seconds and immediately after incident/risk events
- Human-in-the-loop **Approve Reroute** action
- Live activity events through authenticated WebSockets

### Driver PWA

- Current mission, cargo, priority, speed, ETA and route risk
- Approved-route warning with authority and route comparison
- **Accept Approved Route** with server-side approval enforcement
- Ola/Uber-style accepted-route navigation with a live follow map, next safe waypoint, ETA, remaining distance, progress, speed and route risk
- Persistent **Report Unsafe**, Control Room contact and SOS actions
- SOS confirmation guard
- Live GPS and WebSocket instructions
- Offline report queue using IndexedDB
- Automatic synchronization when connectivity returns

### Field Officer PWA

- Assigned ground-verification task
- GPS capture and accuracy display
- Camera/file evidence with validated 5 MB upload
- Road/bridge incident type, severity and description
- Safe, caution, restricted and blocked accessibility status
- Direction affected, vehicle access and clearance estimate
- Authenticated verified-report submission
- Real satellite sector map and synchronized incident history
- Offline report queue and synchronization receipt

### Platform and data

- JWT authentication with `ADMIN`, `DRIVER` and `FIELD_OFFICER` authorization
- FastAPI REST contracts and automatic OpenAPI documentation
- WebSocket fleet/event channel
- SQLite development fallback
- PostgreSQL/PostGIS Docker deployment and spatial schema
- Device-GPS telemetry ingestion; optional simulator only when explicitly enabled
- Service Worker application-shell caching
- IndexedDB mutation queue
- Dockerfiles and full Docker Compose stack
- Live Open-Meteo forecast and GloFAS river-discharge adapters
- Adapter interfaces for authorized IMD, government/PWD and bridge-monitoring feeds

## Final technology stack

| Layer | Technology |
|---|---|
| Web and mobile PWA | Next.js 16, React 19, TypeScript |
| Styling | Responsive CSS design system |
| Mapping | Leaflet, Esri satellite/labels, OpenStreetMap and OSRM road geometry |
| Backend | FastAPI + Python 3.12 |
| Realtime | Authenticated WebSockets |
| Offline | Service Worker + IndexedDB |
| Development DB | SQLite + SQLAlchemy |
| Deployment DB | PostgreSQL 16 + PostGIS 3.4 |
| Routing | NetworkX Dijkstra with risk-weighted edges |
| Risk engine | Continuous explainable Python scoring using live Open-Meteo/GloFAS, verified incidents and corridor attributes |
| File evidence | FastAPI multipart upload + static evidence storage |
| Testing | Pytest + FastAPI TestClient + Next production build |
| Deployment | Unified Docker image, Render Blueprint, managed PostgreSQL and GitHub auto-deploy |

## Architecture

```text
Next.js PWA
├── Admin / Control Room
├── Driver
└── Field Officer
       │ REST + authenticated WebSocket
       ▼
FastAPI
├── JWT role authorization
├── Incident and verification service
├── Explainable risk engine
├── NetworkX routing service
├── Device-GPS telemetry ingestion
├── Evidence upload
├── Continuous live-risk scheduler
└── Open-Meteo/GloFAS plus government-data adapter contracts
       │
       ├── SQLite (local)
       └── PostgreSQL + PostGIS (Docker/production)
```

## Repository structure

```text
ner-logix/
├── apps/
│   ├── api/
│   │   ├── app/
│   │   │   ├── adapters/        External integration contracts
│   │   │   ├── services/        Live risk, routing and telemetry services
│   │   │   ├── auth.py          JWT and role enforcement
│   │   │   ├── database.py      SQLite/PostgreSQL connection
│   │   │   ├── main.py          REST and WebSocket application
│   │   │   ├── models.py        SQLAlchemy persistence
│   │   │   └── schemas.py       API request contracts
│   │   ├── sql/                 PostGIS spatial schema
│   │   ├── tests/               End-to-end API test
│   │   └── Dockerfile
│   └── web/
│       ├── app/
│       │   ├── admin/            Control Room dashboard
│       │   ├── driver/           Driver mobile PWA
│       │   ├── field-officer/    Field verification PWA
│       │   └── page.tsx          Role selection
│       ├── components/           Map, role guard and PWA registration
│       ├── lib/                  API, types and IndexedDB queue
│       ├── public/               Manifest and Service Worker
│       └── Dockerfile
├── docker-compose.yml
├── package.json
└── .env.example
```

## Quick start — local SQLite

Requirements: Node.js 20+ and Python 3.12.

For a new Windows laptop, the quickest path is:

```powershell
.\setup-demo.ps1
.\start-demo.ps1
```

This keeps the fast SQLite development database and launches the API and web application together. Docker is only required when the judge specifically needs the PostgreSQL/PostGIS deployment profile.

### 1. Backend

```powershell
cd apps/api
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
```

API docs: `http://localhost:8001/docs`

### 2. Frontend

Open another terminal at the repository root:

```powershell
npm install
npm run dev:web -- --port 3001
```

Application: `http://localhost:3001`

Copy `apps/web/.env.local.example` to `apps/web/.env.local` if the backend URL differs.

Live weather and river-discharge retrieval is enabled by default. Set `LIVE_DATA_ENABLED=false` only for isolated automated tests. GPS simulation is disabled by default; the Driver must press **Start Device GPS** or a fleet telematics gateway must call the telemetry endpoint.

## Quick start — complete PostGIS stack

```powershell
docker compose up --build
```

- Web: `http://localhost:3000`
- API: same-origin at `http://localhost:3000/api/v1/...`
- OpenAPI: `http://localhost:3000/docs`
- PostgreSQL/PostGIS: `localhost:5432`

Change JWT and demo passwords before exposing the stack outside a local demonstration.

## Demo accounts

The role-selection page signs into these accounts automatically for a fast SIH demo:

| Role | Username | Default password |
|---|---|---|
| Admin | `admin` | `admin123` |
| Driver | `driver` | `driver123` |
| Field Officer | `field` | `field123` |

Passwords are environment-configurable and deliberately simple only for the prototype.

## Primary API contracts

| Method | Endpoint | Role | Purpose |
|---|---|---|---|
| POST | `/api/v1/auth/login` | Public | Issue JWT for a demo user |
| GET | `/api/v1/auth/me` | Any | Return current identity and role |
| GET | `/api/v1/bootstrap` | Any authenticated role | Initial vehicles, roads, incidents and routes |
| POST | `/api/v1/risk/pre-trip` | Admin/Driver | Explainable pre-trip route-risk result |
| POST | `/api/v1/risk/recalculate` | Admin | Refresh continuous road risk |
| POST | `/api/v1/incidents` | Admin | Create an authoritative road incident/closure |
| GET | `/api/v1/incidents` | Any authenticated role | Read synchronized incident history |
| POST | `/api/v1/incidents/{id}/resolve` | Admin | Verify reopening and recalculate risk |
| POST | `/api/v1/field/verify` | Field Officer | Submit ground evidence for Control Room review |
| POST | `/api/v1/uploads/incident-photo` | Field Officer | Upload evidence image |
| POST | `/api/v1/routes/alternate` | Admin | Generate risk-aware route |
| GET | `/api/v1/routes/monitor` | Admin | Rank Route 1–4 from the latest road risk state |
| POST | `/api/v1/reroutes/{id}/approve` | Admin | Approve route for Driver |
| POST | `/api/v1/driver/{vehicle}/routes/{id}/accept` | Driver | Accept approved route |
| POST | `/api/v1/driver/{vehicle}/reports` | Driver | Report unsafe road |
| POST | `/api/v1/driver/{vehicle}/sos` | Driver | Send emergency event |
| POST | `/api/v1/telemetry/vehicles/{vehicle}/location` | Driver/Admin | Ingest an actual device or telematics GPS sample |
| WS | `/ws/fleet?token={jwt}` | Any | Vehicle and operational events |

### Risk response example

```json
{
  "road_id": "R-02",
  "risk_score": 96,
  "risk_level": "CRITICAL",
  "confidence": 0.96,
  "status": "BLOCKED",
  "reason": "trusted live incidents +55; soil saturation +6.2; terrain susceptibility +7.4",
  "data_status": "LIVE",
  "data_source": "Open-Meteo Forecast API + GloFAS v4 Flood API",
  "source_observed_at": "2026-08-28T11:15",
  "factors": []
}
```

### WebSocket event types

- `vehicle.location`
- `roads.risk_updated`
- `incident.created`
- `field.verification`
- `reroute.proposed`
- `reroute.approved`
- `reroute.driver_accepted`
- `driver.unsafe_report`
- `driver.sos`

## Risk and routing logic

The road score remains separate from mission priority. It is recalculated every 10 seconds and immediately after trusted incident changes. External weather/flood responses are cached for 60 seconds to avoid unnecessary provider traffic while incident evidence is applied immediately:

```text
Road risk = current precipitation + 6-hour rain + soil saturation + wind gusts
          + river discharge vs rolling 30-day p90 + trusted incident evidence
Mission priority = cargo urgency 40% + destination criticality 25% + stock risk 20% + delay 15%
Route edge cost = distance + risk × 0.12
```

A verified severe flood or bridge failure is a hard safety override: the road is removed from the NetworkX graph. Missing external data is reported as `STALE` or `UNAVAILABLE`; the engine does not fabricate replacement measurements. The AI recommends; the Control Room approves; the Driver accepts. Blocked roads must be verified before reopening.

Open-Meteo forecast conditions are model-derived current data, not roadside sensor measurements. GloFAS river discharge is approximately 5 km resolution and must be combined with field verification for operational closure decisions. Production government feeds require credentials/data-sharing access from the respective agency.

## Offline behavior

- The Service Worker caches the role shell and mobile workspaces.
- Driver and Field Officer JSON reports are stored in IndexedDB when offline.
- The queue is retried when the browser emits an `online` event.
- Evidence upload is performed when online; the report itself can still be queued offline.
- Every mobile screen displays live/offline and pending-sync status.

## Team parallel-work guidance

Agree on API schemas first and keep work in separate folders/branches:

| Owner | Area | Suggested branch |
|---|---|---|
| Frontend 1 | Admin dashboard and map | `frontend/admin-dashboard` |
| Frontend 2 | Driver PWA and offline queue | `frontend/driver-pwa` |
| Frontend 3 | Field Officer and evidence | `frontend/field-officer` |
| Backend 1 | Auth, incidents and WebSockets | `backend/core-api` |
| Backend 2 | Risk, priority and routing | `backend/risk-routing` |
| Integration | PostGIS, Docker, tests and demo | `integration/deployment` |

Rules:

1. Never commit directly to `main`; merge small pull requests.
2. Frontend developers use the documented JSON contracts; the integrated judge flow always uses the running FastAPI service.
3. Avoid editing another owner's files without coordination.
4. Run `npm run build:web` and backend tests before merging.
5. Keep the judge demo path stable even while secondary analytics improve.

## Verification

```powershell
# Backend
cd apps/api
.\.venv\Scripts\python.exe -m pytest -q

# Frontend
cd ../..
npm run build:web

# Container configuration
docker compose config
```

The API test covers login and role enforcement, photo upload, pre-trip risk, incident creation, NetworkX alternate routing, Admin approval, Driver acceptance, Field Officer verification and final bootstrap state.

## Production expansion

The adapter and service boundaries support later IMD/weather, PWD/government road feeds, bridge sensors, district accessibility, multilingual notifications, offline map packages, hospital inventory, bottleneck analysis, supply-chain gaps, audit storage, cloud identity and trained scikit-learn/XGBoost models without replacing the three user applications or their API workflow.
