# ⚡ Current (CurrentApp)

[![Tauri Build](https://img.shields.io/badge/Tauri-2.0-blue?logo=tauri)](https://tauri.app/)
[![React](https://img.shields.io/badge/Frontend-React-61DAFB?logo=react)](https://reactjs.org/)
[![Node Version](https://img.shields.io/badge/Node-24.14.1-green?logo=node.js)](https://nodejs.org/)

**Current** 是一款专为前端开发者打造的精美桌面级 **Node.js 项目管理面板**。它旨在解决开发者在处理多个遗留项目与现代项目时遇到的 Node 版本切换繁琐、启动配置复杂等痛点。

---

## 📖 项目背景

在日常开发中，前端开发者往往需要同时维护数十个项目。不同的项目（如传统 Vue 2 应用与最新的 Next.js 应用）往往依赖完全不同的 Node.js 运行环境。

虽然有 `nvm` 或 `fnm` 等命令行工具，但频繁的 `cd` 和 `use` 容易产生心智负担。**Current** 应运而生——它通过一个直观的图形化界面，让你能够：
- **一键切换**：为每个项目预设特定的 Node 版本。
- **并行启动**：自动调用 `fnm` 上下文，多项目并发运行互不干扰。
- **极简体验**：摆脱终端命令，让项目管理回归高效与优雅。

---

## ✨ 核心功能

- 🎨 **精美设计**：基于现代毛玻璃 (Glassmorphism) 与动态渐变效果，提供极致的视觉享受。
- 🚀 **智能 Node 管理**：深度集成 `fnm`，支持识别并自动切换项目所需的 Node 版本。
- 📦 **一键启动**：自动扫描项目脚本，支持自定义启动命令。
- 🔗 **全自动更新**：集成 Tauri 2.0 Updater，基于 Vercel + GitHub Actions 实现全自动平滑升级。
- 🛠️ **开发者友好**：支持自动读取 `.node-version`、`.nvmrc` 和 `package.json` 中的版本声明。

---

## 🛠️ 技术栈

| 维度 | 技术选型 |
| :--- | :--- |
| **容器架构** | [Tauri 2.0](https://tauri.app/) (Rust 驱动，极小体积，原生性能) |
| **前端框架** | React 18 + TypeScript |
| **样式引擎** | TailwindCSS + Vanilla CSS |
| **构建工具** | Vite 5 |
| **后端/系统交互** | Rust (Tokio 异步运行时) |
| **CI/CD** | GitHub Actions (自动构建 Windows/macOS 安装包) |
| **部署/分发** | Vercel (Update Manifest 服务器) |

---

## 🚀 快速开始

### 1. 环境依赖

本面板自身开发及运行需要以下环境：
- **Node.js**: `24.14.1` (推荐)
- **fnm**: 用于管理受控项目的 Node 版本 (Windows 建议通过 `winget install Schniz.fnm` 安装)

### 2. 开发环境搭建

```powershell
# 使用 fnm 切换版本
fnm install 24.14.1
fnm use 24.14.1

# 安装依赖
npm install

# 启动开发模式
npm run dev
```

### 3. 命令说明

- `npm run dev`: 启动 Tauri 桌面应用及前端 Vite 服务。
- `npm run build`: 构建正式安装包（包含 MSI 和 EXE，需配置加密私钥）。
- `npm run contracts:generate`: 从 Rust 端自动生成前端 TS 类型定义。

---

## 📐 架构模型

Current 采用了双层 Node 版本隔离模型：

1.  **面板自身层 (The Panel)**：固定运行在 `Node 24`，保证管理界面的高性能与现代 API 支持。
2.  **受控项目层 (Managed Projects)**：每个项目可以独立配置其运行环境（如项目 A 跑在 `Node 16`，项目 B 跑在 `Node 20`）。面板会智能地开启隔离进程。

---

## 🛡️ 开源协议

本项目采用 MIT 协议。

---

**Current** —— 让前端开发流转更顺滑。⚡
