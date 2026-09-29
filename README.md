# AdoTracker

A lightweight **Azure DevOps Boards clone** — plan sprints, manage work items on a Kanban board, track team capacity, and run queries. It's a fully static single-page app (SPA) that persists your board to a **GitHub repository** via the Contents API, with automatic **localStorage** backup so you never lose edits.

> No backend, no database, no server to run. Just a static site + your own GitHub repo as the data store.

---

## ✨ Features

- **Kanban board** with drag-and-drop work items (`@dnd-kit`)
- **Sprints / iterations** planning
- **Team capacity** tracking per member
- **Queries** to slice and filter work items
- **Charts** for burndown / progress (`recharts`)
- **GitHub-backed storage** — your data lives in a JSON file in *your* repo
- **Offline-safe** — every change is mirrored to `localStorage`; a failed push never loses work
- **Sync status pill + error banner** so you always know the save state

---

## 🧱 Tech Stack

| Layer | Choice |
|-------|--------|
| Build | Vite 5 |
| UI | React 18 + TypeScript 5 |
| Routing | `react-router-dom` (HashRouter, Pages-friendly) |
| State | `zustand` |
| DnD | `@dnd-kit` |
| Charts | `recharts` |
| Storage | GitHub Contents API + `localStorage` backup |

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+

### Install & run

```bash
npm install
npm run dev
```

Open the printed `localhost` URL.

### Build for production

```bash
npm run build      # outputs static site to dist/
npm run preview    # preview the production build locally
```

---

## ⚙️ Configuration

Runtime defaults live in [public/appsettings.json](public/appsettings.json):

```json
{
  "github": {
    "owner": "<your-github-username>",
    "repo": "adotracker-data",
    "branch": "master",
    "path": "adotracker-data.json",
    "token": ""
  }
}
```

- **owner / repo / branch / path** — where the board JSON is stored.
- **token** — leave **blank** in the committed file. Enter your GitHub PAT at runtime via the in-app **Settings** page; it is stored in `localStorage`, never shipped in the build.

### GitHub token (PAT)

Create a **fine-grained personal access token** scoped to the data repo with:

- **Contents: Read and write** (this is what actually lets the app save)

> ⚠️ Never commit a real token into `appsettings.json` — it bundles into `dist/` and would be served publicly. See [design/github-setup.md](design/github-setup.md) for the full walkthrough and troubleshooting.

---

## 📦 Deployment

The app is a static bundle, so it deploys anywhere that serves files.

### Netlify (drag-and-drop)
1. `npm run build`
2. Drag the `dist/` folder (or a zip of its contents) onto Netlify's **Deploy manually** drop zone.

`HashRouter` means deep links work with no redirect rules.

### GitHub Pages
`vite.config.ts` uses `base: "./"` for relative assets, so Pages sub-paths work out of the box.

---

## 🗂️ Repositories

This project uses **two** repos:

| Repo | Purpose |
|------|---------|
| **`adotracker`** | The application source code (this repo) |
| **`adotracker-data`** | Private repo holding the board JSON (the data store) |

---

## 📐 Design Docs

All architecture and design documents live under [design/](design/):

- [High-Level Design (HLD)](design/hld.md) — components, data model, load/save flows, routing, deployment
- [Data Flow Diagrams (DFD)](design/data-flow.md) — context / level-1 / level-2 flows, storage keys
- [GitHub Setup Guide](design/github-setup.md) — PAT creation, permissions, troubleshooting

---

## 🔐 Security Notes

- Keep the PAT out of the committed build; enter it via **Settings** at runtime.
- Use a **private** `adotracker-data` repo for your board data.
- Rotate/revoke the token if it is ever exposed.

---

## 📄 License

Private / internal use.
