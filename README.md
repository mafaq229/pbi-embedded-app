# Power BI Embed Playground

A local Python webapp that embeds **interactive Power BI reports**, **paginated reports (RDL)**, and **dashboards** from a workspace you own, using a service principal and the Power BI REST API. Built as a hands-on learning sandbox for the full embedding flow — auth, token minting, and the JS SDK.

---

## What this does

- Lists every report and dashboard in a Power BI workspace via the REST API
- Mints a **V2 multi-resource embed token** that covers all reports and datasets in one call (required for paginated reports and for paginated report visuals embedded inside interactive reports)
- Handles cross-workspace semantic model resolution for paginated reports bound to datasets in other workspaces via XMLA
- Renders all three content types (interactive `.pbix`, paginated `.rdl`, dashboard) in a single-page UI using the `powerbi-client` JS SDK

---

## Stack

| Layer | Technology |
|---|---|
| Web framework | FastAPI + Uvicorn |
| Auth | MSAL (client-credentials, no user login) |
| Power BI API | httpx (async) |
| Templates | Jinja2 |
| Config | pydantic-settings + `.env` |
| Package manager | [uv](https://github.com/astral-sh/uv) |
| Python | 3.11+ |

---

## Quickstart

### 1. Azure + Power BI setup (first time only, ~60 min)

Follow **[docs/01-azure-setup.md](docs/01-azure-setup.md)** end-to-end. By the end you will have:

- A Microsoft Entra app registration with a client secret (service principal)
- A Power BI workspace on F2 Fabric capacity with the service principal as **Member**
- At least one interactive report and one paginated report published

### 2. Install dependencies

```sh
uv sync
```

### 3. Configure secrets

```sh
cp .env.example .env
```

Fill in the four values:

| Key | Where to find it |
|---|---|
| `TENANT_ID` | Entra app → Overview → Directory (tenant) ID |
| `CLIENT_ID` | Entra app → Overview → Application (client) ID |
| `CLIENT_SECRET` | Entra app → Certificates & secrets → **Value** column |
| `WORKSPACE_ID` | Power BI workspace URL: `/groups/<WORKSPACE_ID>/list` |

### 4. Make sure your F2 capacity is running

Azure Portal → your Fabric resource → click **Resume** if paused. Wait ~30 seconds.

### 5. Start the app

```sh
uv run uvicorn app.main:app --reload
```

Open [http://localhost:8000](http://localhost:8000).

Full verification checklist: [docs/02-running-the-app.md](docs/02-running-the-app.md).

---

## API endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Web UI — sidebar + embed pane |
| `GET` | `/api/reports` | List all reports in workspace |
| `GET` | `/api/dashboards` | List all dashboards in workspace |
| `GET` | `/api/embed-info/{report_id}` | Mint V2 embed token for a report |
| `GET` | `/api/embed-info/dashboard/{dashboard_id}` | Mint V1 embed token for a dashboard |

Quick auth smoke test:

```sh
uv run python -c "from app.auth import get_access_token; print(get_access_token()[:40])"
```

---

## Project structure

```
.
├── app/
│   ├── auth.py        # MSAL client-credentials token acquisition
│   ├── config.py      # pydantic-settings — reads .env
│   ├── main.py        # FastAPI routes
│   ├── models.py      # Pydantic models: Report, Dashboard, EmbedInfo, …
│   └── powerbi.py     # Power BI REST API calls + token minting
├── static/
│   ├── css/app.css
│   └── js/embed.js    # powerbi-client SDK wiring
├── templates/
│   └── index.html     # Jinja2 template
├── docs/
│   ├── 01-azure-setup.md
│   ├── 02-running-the-app.md
│   └── 03-troubleshooting.md
├── .env.example
└── pyproject.toml
```

---

## Non-obvious implementation details

### V2 embed token (not V1)

Paginated reports backed by a Power BI semantic model require the V2 multi-resource `POST /v1.0/myorg/GenerateToken` endpoint. V1 (the per-report endpoint) returns `400 InvalidRequest` for that combination. V2 needs an explicit `datasets[]` list with `xmlaPermissions: "ReadOnly"` per dataset. Dashboards are the inverse — they have no V2 endpoint and must use V1.

### All workspace reports in one token

`generate_embed_token()` always includes every report in the workspace in the token's `reports[]` array, not just the requested report. This is necessary because an interactive `.pbix` may contain paginated report visuals; those visuals require the paginated report's ID to be in the token, and you cannot enumerate which paginated reports a `.pbix` references via the REST API at runtime.

### Paginated reports and the powerbi-client SDK

The RDL viewer engine does not support `settings.panes`, `settings.background`, or the `loaded`/`rendered` events. Passing those config options causes the RDL viewer to silently hang during cold initialization. `embed.js` passes no `settings` for paginated reports and calls `showReady()` immediately after `powerbi.embed()` rather than waiting for events that never fire.

### Cross-workspace dataset resolution

If a paginated report references a semantic model in a different workspace (via XMLA), `generate_embed_token()` resolves the remote workspace ID and dataset ID by parsing the XMLA server URL and doing two extra REST calls. The resolved workspace is added to `targetWorkspaces[]` in the V2 token body.

### XMLA endpoints must be enabled

Paginated reports that use a Power BI semantic model as a datasource access it over XMLA. Two settings must both be on (neither is on by default):

1. **Admin portal** → Tenant settings → *Allow XMLA endpoints and Analyze in Excel*
2. **Workspace settings** → Premium → XMLA Endpoint → **Read Only**

If the embed token succeeds but the report renders blank, these settings are almost certainly the cause.

---

## Cost discipline

The F2 Fabric capacity costs **~$0.36/hr** while active. **Pause it in the Azure portal every time you stop working.** Paused = $0/hr, no data loss.

End-of-day routine:

1. `Ctrl+C` to stop uvicorn
2. Azure Portal → Fabric capacity → **Pause**
3. Confirm status shows **Paused**

Forgetting this drains the $200 free trial in under two weeks.

---

## Linting

```sh
uv run ruff check
uv run ruff format --check
```

---

## Troubleshooting

See [docs/03-troubleshooting.md](docs/03-troubleshooting.md) for a full symptom → cause → fix reference. Most common issues:

| Symptom | Likely cause |
|---|---|
| `401` on `/api/reports` | A5 tenant setting not propagated yet (wait 15 min) |
| `[]` on `/api/reports` | Service principal not Member of workspace |
| `403` on embed token | Workspace not on Fabric capacity, or capacity paused |
| `400` on embed token for paginated report | Reverted to V1 token endpoint, or XMLA not enabled |
| `invalid_client` from MSAL | Pasted Secret ID instead of Secret Value |
| Paginated report blank / spinner forever | XMLA endpoints disabled (tenant or workspace setting) |
