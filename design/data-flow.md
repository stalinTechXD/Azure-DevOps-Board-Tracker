# AdoTracker — Data Flow Diagrams (DFD)

Data-flow view of how board data moves between the user, the SPA, browser storage,
and GitHub. Complements [hld.md](hld.md).

---

## Legend

| Symbol | Meaning |
|--------|---------|
| External Entity | Actor/system outside the app (User, GitHub) |
| Process | Logic that transforms data |
| Data Store | Where data rests (localStorage, GitHub file) |
| →→ | Data flow direction |

---

## Level 0 — Context Diagram

```mermaid
flowchart LR
  User(("User")):::ext
  GitHub(("GitHub<br/>Contents API")):::ext

  App["AdoTracker SPA"]:::proc

  User -- "create/edit work items,<br/>manage team, settings" --> App
  App -- "board UI, sync status,<br/>error banner" --> User

  App -- "GET/PUT board JSON<br/>(Bearer PAT)" --> GitHub
  GitHub -- "file content + sha,<br/>commit result / errors" --> App

  classDef ext fill:#264f78,stroke:#9cc,color:#fff;
  classDef proc fill:#0e639c,stroke:#9cf,color:#fff;
```

---

## Level 1 — Main Data Flows

```mermaid
flowchart TD
  User(("User")):::ext
  GitHub(("GitHub Contents API")):::ext

  subgraph SPA["AdoTracker SPA"]
    P1["P1: Init & Load"]:::proc
    P2["P2: Edit Board<br/>(create/update/delete)"]:::proc
    P3["P3: Persist / Sync"]:::proc
    P4["P4: Configure & Auth<br/>(Settings)"]:::proc
  end

  Cfg[("D1: appsettings.json<br/>(config defaults)")]:::store
  LS[("D2: localStorage<br/>adotracker.local.data")]:::store
  Ovr[("D3: localStorage<br/>adotracker.github.config")]:::store
  Store[("D4: In-memory store<br/>BoardData")]:::store
  Remote[("D5: GitHub file<br/>adotracker-data.json")]:::store

  %% Load path
  Cfg -- "owner/repo/branch/path/token" --> P1
  Ovr -- "override config" --> P1
  P1 -- "GET contents" --> GitHub
  GitHub -- "board JSON + sha" --> P1
  LS -- "backup (on 404/error)" --> P1
  P1 -- "hydrate" --> Store
  Store -- "render board" --> User

  %% Edit path
  User -- "actions" --> P2
  P2 -- "mutate" --> Store
  Store -- "changed data" --> P3

  %% Persist path
  P3 -- "write backup (always)" --> LS
  P3 -- "PUT contents (+sha)" --> GitHub
  GitHub -- "new sha / commit / error" --> P3
  P3 -- "update source + error" --> Store
  Store -- "SyncPill / ErrorBanner" --> User

  %% Config path
  User -- "enter GitHub config + password" --> P4
  P4 -- "save override" --> Ovr
  P4 -- "trigger load" --> P1

  classDef ext fill:#264f78,stroke:#9cc,color:#fff;
  classDef proc fill:#0e639c,stroke:#9cf,color:#fff;
  classDef store fill:#3a3d41,stroke:#888,color:#fff;
```

---

## Level 2 — Persist / Sync (P3) Detail

```mermaid
flowchart TD
  In["Changed BoardData"]:::proc --> Stamp["Stamp meta.updatedAt<br/>+ version++"]:::proc
  Stamp --> Enc["UTF-8 → base64 encode"]:::proc
  Enc --> HasTok{"token present?"}

  HasTok -- "no" --> LocalOnly["write localStorage backup"]:::proc --> RLocal(["result: source=local, ok"]):::proc

  HasTok -- "yes" --> Sha{"currentSha known?"}
  Sha -- "no" --> GetSha["GET file sha"]:::proc --> Put
  Sha -- "yes" --> Put["PUT /contents/{path}<br/>(content, branch, sha?)"]:::proc

  Put --> Code{"HTTP status"}
  Code -- "409 / 422<br/>(stale sha)" --> Refetch["re-fetch sha"]:::proc --> Put2["PUT retry"]:::proc --> Code2{"status"}
  Code -- "2xx" --> OK
  Code2 -- "2xx" --> OK["store new sha"]:::proc
  Code -- "other error" --> Err
  Code2 -- "error" --> Err["capture error text"]:::proc

  OK --> Backup1["write localStorage backup"]:::proc --> RGit(["result: source=github, ok"]):::proc
  Err --> Backup2["write localStorage backup"]:::proc --> RErr(["result: source=github, ok=false, error"]):::proc

  classDef proc fill:#0e639c,stroke:#9cf,color:#fff;
```

Key invariant: **localStorage is written on every terminal path**, so a failed GitHub
push never loses the user's edits.

---

## Data Flow Summary Table

| # | Flow | From | To | Trigger |
|---|------|------|----|---------|
| 1 | Config defaults | `appsettings.json` | Init (P1) | App startup |
| 2 | Config override | localStorage `github.config` | Init (P1) | Startup / after Settings save |
| 3 | Remote read | GitHub file | Init (P1) | `fetchBoard()` |
| 4 | Backup read | localStorage `local.data` | Init (P1) | 404 / error fallback |
| 5 | Hydrate | Init (P1) | In-memory store | After load |
| 6 | Edit | User | Edit (P2) → store | Create/update/delete |
| 7 | Persist trigger | store | Persist (P3) | Debounced (~200ms) |
| 8 | Backup write | Persist (P3) | localStorage `local.data` | Every save attempt |
| 9 | Remote write | Persist (P3) | GitHub file | `saveBoard()` PUT |
| 10 | Sync status | Persist (P3) | User (SyncPill/Banner) | After save |
| 11 | Settings save | User | Configure (P4) | Save & connect |

---

## Storage Keys Reference

| Key | Location | Contents |
|-----|----------|----------|
| `adotracker.github.config` | localStorage | User's GitHub config override |
| `adotracker.local.data` | localStorage | Last-known board JSON (backup) |
| `adotracker.settings.authed` | sessionStorage | Settings auth flag (per session) |
| `github` section | `public/appsettings.json` | Default owner/repo/branch/path/token |
| configured `path` | GitHub repo | Canonical board JSON (source of truth) |
