# 🌌 HelixDB Explorer

**HelixDB Explorer** is a high-performance, modern GUI designed specifically for **HelixDB**. Built with **Tauri 2** and **SolidJS**, it provides a seamless, native-feeling experience for managing your graph data, writing complex HQL (Helix Query Language), and synchronizing your workshop queries.

![HelixDB Explorer Hero](https://github.com/helixdb/helix-explorer/raw/main/assets/hero-placeholder.png)

## ✨ Features

- **🎨 Premium Interface**: A sleek, dark-themed UI with glassmorphism effects and micro-animations, optimized for long coding sessions.
- **🛡️ Intelligent HQL Editor**:
  - Real-time syntax highlighting and diagnostics.
  - Interactive auto-completion based on your live schema.
  - One-click query beautification/formatting.
- **🚀 Dynamic Execution (MCP)**: Leverages the **Model Context Protocol** to parse and execute HQL traversals on the fly without complex backend boilerplate.
- **📊 Adaptive Results Visualization**: Switch instantly between high-density **Table Views** for nodes/edges and interactive **JSON Trees** for raw query responses.
- **🔄 Local Project Sync**: Automatically sync your HQL queries from the Explorer directly into your local development workspace, supporting instant codegen and validation.
- **🔍 Full-Text Search**: Built-in support for BM25 search across your graph nodes.
- **🛠️ Multi-Connection Management**: Easily switch between local, staging, and production HelixDB instances.

## 🛠️ Stack

- **Framework**: [Tauri 2](https://v2.tauri.app/) (Rust Backend)
- **Frontend**: [SolidJS](https://www.solidjs.com/) + Vite
- **Styling**: Vanilla CSS (Custom Design System)
- **Protocol**: [MCP](https://modelcontextprotocol.io/)

## 📖 License

HelixDB Explorer is released under the **MIT License**.

---

<p align="center">Made with ❤️ by the HelixDB Team</p>
