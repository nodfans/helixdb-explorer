<div align="center">
  <img src="docs/assets/logo.png" width="120" height="120" alt="HelixDB Explorer Logo" />
  <h1>HelixDB Explorer</h1>
  <p>
    A GUI Tool for <strong>HelixDB</strong>.<br/>
    Intelligent HQL editor, graph visualization, and schema management for macOS, built with Tauri.
  </p>

  <p>
    <a href="https://nodfans.github.io/helixdb-explorer"><strong>🌐 Visit Official Website</strong></a>
    ·
    <a href="https://github.com/nodfans/helixdb-explorer/releases/latest/download/HelixDB-Explorer-macOS.dmg"><strong>📥 Download for macOS</strong></a>
    ·
    <a href="https://github.com/nodfans/helixdb-explorer/issues">🐞 Report Bug</a>
  </p>

    <img src="https://img.shields.io/github/license/nodfans/helixdb-explorer?style=flat-square&cacheSeconds=3600" />
    <img src="https://img.shields.io/github/v/release/nodfans/helixdb-explorer?style=flat-square&color=6366f1&cacheSeconds=3600" />
    <img src="https://img.shields.io/github/downloads/nodfans/helixdb-explorer/total?style=flat-square&color=22c55e&label=downloads&cacheSeconds=3600" />

</div>

## 📦 Installation

### Option 1: One-liner Install (Recommended)

The easiest way to install HelixDB Explorer and automatically bypass macOS Gatekeeper warnings is to use our terminal installer:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/nodfans/helixdb-explorer/main/scripts/install.sh)"
```

### Option 2: Manual Download

[**📥 Download latest HelixDB Explorer for macOS**](https://github.com/nodfans/helixdb-explorer/releases/latest/download/HelixDB-Explorer-macOS.dmg)

> [!IMPORTANT]
> **"App is damaged" or "Cannot be opened" Error**: Since this app is not signed by a registered Apple Developer yet (Ad-hoc signed), macOS may block it on first launch.
>
> <div align="center">
>   <img src="docs/assets/warning.png" alt="Gatekeeper Warning" width="400" />
> </div>
>
> To fix this, run this command in your terminal:
>
> ```bash
> xattr -cr "/Applications/HelixDB Explorer.app"
> ```

## ✨ Features

### 🧠 Intelligent Editor

Write HQL queries faster with syntax highlighting, schema-aware autocomplete, and real-time error checking. The editor understands your graph structure and suggests valid traversals as you type.

<div align="center">
  <img src="docs/assets/hql.png" alt="HelixDB Explorer Screenshot" width="100%" style="border-radius: 10px; border: 1px solid #e5e5e5;" />
</div>

### 🧩 Visual Query Modeler

Build complex HQL queries without writing code. Use a block-based interface to define traversals, filters, and projections visually.

<div align="center">
  <img src="docs/assets/modeler.png" alt="Visual Query Modeler" width="100%" style="border-radius: 10px; border: 1px solid #e5e5e5;" />
</div>

### 🛠️ Production Workbench

Manage multiple connections (Local, Staging, Prod) and maintain a library of common queries. Seamlessly switch between **Table View** and **JSON View** for deep data inspection.

<div align="center">
  <img src="docs/assets/queries.png" alt="Query Workbench" width="100%" style="border-radius: 10px; border: 1px solid #e5e5e5;" />
</div>

### 📐 Schema Manager

Visualize and understand your graph structure at a glance. Inspect node types, edge definitions, and property constraints in a clean, card-based interface.

<div align="center">
  <img src="docs/assets/schema.png" alt="Schema Manager" width="100%" style="border-radius: 10px; border: 1px solid #e5e5e5;" />
</div>

### 🕸️ Graph Visualization

Interact with your data using high-performance node-link diagrams. Explore clusters, trace paths, and inspect properties visually.

<div align="center">
  <img src="docs/assets/graph.png" alt="Graph Visualization" width="100%" style="border-radius: 10px; border: 1px solid #e5e5e5;" />
</div>

### Build from Source

Requirements:

- Node.js (v18+)
- Rust (stable)
- pnpm

```bash
# Clone the repository
git clone https://github.com/nodfans/helixdb-explorer.git
cd helixdb-explorer

# Install dependencies
pnpm install

# Run in development mode
pnpm tauri dev

# Build production binary
pnpm tauri build
```

## 🛠️ Tech Stack

- **Core**: [Rust](https://www.rust-lang.org/) (Tauri 2 Backend)
- **Frontend**: [SolidJS](https://www.solidjs.com/) + TypeScript
- **Protocol**: [MCP](https://modelcontextprotocol.io/) (Model Context Protocol)
- **Styling**: Vanilla CSS (Custom Design System)

## 📄 License

MIT © [HelixDB Explorer Team](https://github.com/nodfans)
