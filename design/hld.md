# AdoTracker — High-Level Design (HLD)

An Azure DevOps Boards–style work-item tracker built as a **static single-page app**.
It runs entirely in the browser and persists board data to a **single JSON file in a
GitHub repository** (via the GitHub Contents REST API), with **localStorage** as an
always-on offline backup.

---

## 1. Overview

| Aspect | Choice |
|--------|--------|
| Type | Client-only SPA (no backend server) |
| Framework | React 18 + TypeScript |
| Build tool | Vite 5 |
| Routing | `react-router-dom` **HashRouter** (GitHub Pages friendly) |
| State | **zustand** (`store.ts` = board data, `ui.ts` = drawer/UI) |
| Persistence | GitHub Contents API (primary) + `localStorage` (backup) |
| Config | `public/appsettings.json` (read at runtime) + localStorage override |
| Auth | Client-side password gate for the Settings page only |
| Hosting | Static host / GitHub Pages (`base: "./"`) |

> Note: there is no server. All GitHub calls happen directly from the browser using a
> Personal Access Token (PAT). The PAT is client-visible, so this design targets
> personal/internal use, not multi-tenant security.

---

## 2. Component Architecture

```mermaid
graph TD
  subgraph Browser["Browser (Static SPA)"]
    main["main.tsx<br/>bootstrap"] --> App["App.tsx<br/>shell + routes + SyncPill + ErrorBanner"]

    App --> Router["HashRouter"]
    Router --> Pages

    subgraph Pages["Pages"]
      Dash["Dashboard"]
      Boards["Boards (Kanban)"]
      Backlogs["Backlogs"]
      Sprints["Sprints"]
      WI["WorkItemsPage"]
      Queries["Queries"]
      Settings["Settings"]
    end

    subgraph Components["Shared Components"]
      Drawer["WorkItemDrawer"]
      Gate["SettingsGate (auth)"]
      NewBtn["NewWorkItemButton"]
      TeamMgr["TeamManager"]
    end

    subgraph State["State (zustand)"]
      Store["store.ts<br/>board data + actions"]
      UI["ui.ts<br/>drawer state"]
    end

    subgraph Services["Services"]
      GH["githubStorage.ts<br/>config + fetch/save"]
      Auth["auth.ts<br/>settings password"]
      Seed["seed.ts<br/>demo data"]
    end

    Pages --> Store
    Components --> Store
    Pages --> UI
    Drawer --> UI
    Gate --> Auth
    Store --> GH
    App --> GH
  end

  subgraph External["External"]
    Cfg["public/appsettings.json"]
    LS[("localStorage<br/>adotracker.*")]
    GHApi["GitHub Contents API<br/>api.github.com"]
  end

  GH --> Cfg
  GH --> LS
  GH --> GHApi
```

---

## 3. Data Model

```mermaid
classDiagram
  class BoardData {
    WorkItem[] workItems
    Iteration[] iterations
    TeamMember[] team
    Query[] queries
    number lastId
    Meta meta
  }
  class WorkItem {
    number id
    WorkItemType type
    string title
    string state
    string assignedTo
    string areaPath
    string iterationPath
    number priority
    string[] tags
    number|null parentId
    Comment[] comments
    History[] history
  }
  class TeamMember {
    string id
    string displayName
    number capacityPerDay
  }
  class Iteration {
    string id
    string name
    string path
  }
  class Query { string id; string name; ... }
  class Meta { string updatedAt; number version }

  BoardData "1" --> "*" WorkItem
  BoardData "1" --> "*" TeamMember
  BoardData "1" --> "*" Iteration
  BoardData "1" --> "*" Query
  BoardData "1" --> "1" Meta
```

The **entire board** is serialized as one JSON document and stored at the configured
path (e.g. `adotracker-data.json`) in the GitHub repo.

---

## 4. Configuration Resolution

`githubStorage.loadConfig()` resolves the active GitHub config in this order:

```mermaid
flowchart TD
  A["initConfig() on startup"] --> B["fetch public/appsettings.json"]
  B --> C{"owner + repo + path present?"}
  C -->|yes| D["fileConfig populated"]
  C -->|no| E["fileConfig = null"]

  F["loadConfig()"] --> G{"localStorage override<br/>adotracker.github.config?"}
  G -->|yes| H["use saved override<br/>(fallback token from fileConfig)"]
  G -->|no| I["use fileConfig"]
```

| Key | Purpose |
|-----|---------|
| `public/appsettings.json` | Default `owner/repo/branch/path/token` shipped with the app |
| `adotracker.github.config` | User override entered in Settings (localStorage) |
| `adotracker.local.data` | Last-known board JSON backup (localStorage) |

---

## 5. Load Flow (startup)

```mermaid
sequenceDiagram
  participant U as User
  participant App as App.tsx
  participant S as store.ts
  participant GH as githubStorage
  participant Cfg as appsettings.json
  participant API as GitHub API
  participant LS as localStorage

  U->>App: open app
  App->>GH: initConfig()
  GH->>Cfg: fetch appsettings.json (no-store)
  Cfg-->>GH: {owner, repo, branch, path, token}
  App->>S: load()
  S->>GH: fetchBoard()
  GH->>API: GET /contents/{path}?ref={branch}
  alt 200 OK
    API-->>GH: base64 content + sha
    GH-->>S: {data, source:"github"}
  else 404 (file not created yet)
    API-->>GH: Not Found
    GH->>LS: read backup
    GH-->>S: {data: backup?, source:"local"/"empty"}
  else non-OK (401/403/...)
    API-->>GH: error
    GH->>LS: read backup (never discard work)
    GH-->>S: {data: backup, source, error}
  end
  S-->>App: render (SyncPill / ErrorBanner)
```

---

## 6. Save Flow (create/update/delete work item)

Writes are **debounced** and always mirror to localStorage so no edit is ever lost.

```mermaid
sequenceDiagram
  participant U as User
  participant P as Page/Drawer
  participant S as store.ts
  participant GH as githubStorage
  participant API as GitHub API
  participant LS as localStorage

  U->>P: edit work item
  P->>S: createWorkItem / updateWorkItem
  S->>S: update in-memory state
  S->>S: debouncedPersist()  %% ~200ms
  S->>GH: saveBoard(data)  %% stamps meta.version++
  GH->>LS: (on any failure) write backup

  alt token missing
    GH->>LS: write backup
    GH-->>S: {ok:true, source:"local"}
  else configured
    GH->>API: GET sha (if unknown)
    GH->>API: PUT /contents/{path} (content, branch, sha?)
    alt 409/422 (stale sha)
      GH->>API: re-fetch sha
      GH->>API: PUT retry
    end
    alt 2xx OK
      API-->>GH: new content.sha + commit
      GH->>LS: write backup
      GH-->>S: {ok:true, source:"github"}
    else error (e.g. 403 no Contents perm)
      GH->>LS: write backup
      GH-->>S: {ok:false, source:"github", error}
    end
  end
  S-->>P: SyncPill = GitHub / Local / Sync error<br/>ErrorBanner shows exception
```

Key resilience features:
- **SHA tracking** (`currentSha`) so updates to an existing file are accepted; auto
  re-fetch + single retry on `409/422`.
- **localStorage backup on every path** — data is never discarded on a failed push.
- **UTF-8-safe base64** encode/decode for the file content.
- **ErrorBanner** surfaces the raw GitHub exception on the main page.

---

## 7. Settings & Auth Flow

```mermaid
flowchart TD
  A["Navigate to /settings"] --> B["SettingsGate"]
  B --> C{"isAuthed()?<br/>sessionStorage"}
  C -->|no| D["Password prompt"]
  D --> E{"password == SETTINGS_PASSWORD"}
  E -->|no| D
  E -->|yes| F["login() -> sessionStorage flag"]
  C -->|yes| G["Settings page"]
  F --> G
  G --> H["edit owner/repo/branch/token/path"]
  H --> I["Save & connect: saveConfig() + load()"]
  I --> J{"source == github?"}
  J -->|no| K["persist() to create remote file"]
  J -->|yes| L["connected"]
```

> The settings password is a **client-side gate only** (obfuscation, not real security),
> since all code runs in the browser.

---

## 8. Routing Map

| Route | Page | Notes |
|-------|------|-------|
| `/` | → redirect `/dashboard` | |
| `/dashboard` | Dashboard | overview widgets + TeamManager |
| `/workitems` | WorkItemsPage | flat list |
| `/boards` | Boards | Kanban columns |
| `/backlogs` | Backlogs | hierarchical backlog |
| `/sprints` | Sprints | iteration/capacity view |
| `/queries` | Queries | saved queries |
| `/settings` | Settings (gated) | GitHub config + auth |

HashRouter is used so deep links like `/#/boards` work on static hosts / GitHub Pages
without server-side rewrite rules.

---

## 9. Deployment

```mermaid
flowchart LR
  Src["src/*"] --> TSC["tsc -b (typecheck)"]
  TSC --> Vite["vite build"]
  Pub["public/* (appsettings.json, favicon)"] --> Vite
  Vite --> Dist["dist/ (index.html, assets, appsettings.json)"]
  Dist --> Host["Static host / GitHub Pages"]
  Host --> API["Browser -> GitHub Contents API"]
```

- Build: `tsc -b && vite build` → `dist/`.
- `vite.config.ts` sets `base: "./"` for relative asset URLs on Pages.
- `public/appsettings.json` is copied verbatim to `dist/` and served publicly.

> Security caveat: any token placed in `public/appsettings.json` is bundled into `dist`
> and served publicly. For anything beyond personal use, keep the token blank in the
> file and enter it via the Settings screen (localStorage only).

---

## 10. Trust & Security Notes

- The GitHub PAT is client-visible; treat the repo/token as personal scope.
- Least-privilege PAT: **Contents = Read and write** on the single data repo only.
- Private repo is fine; the token just needs the Contents permission (missing it
  returns `403 "Resource not accessible by personal access token"`).
- No secrets should be committed in `appsettings.json` for a public deployment.
