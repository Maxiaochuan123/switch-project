<div align="center">
  <img src="./src-tauri/icons/icon.png" width="128" height="128" alt="Current Logo" />
  <h1>⚡ Current (电蝾螈)</h1>
  <p><strong>极致优雅的桌面级 Node.js 项目管理专家</strong></p>

[![Tauri 2.0](https://img.shields.io/badge/Tauri-2.0-blue?logo=tauri)](https://tauri.app/)
[![React 18](https://img.shields.io/badge/React-18-61DAFB?logo=react)](https://reactjs.org/)
[![Node 24](https://img.shields.io/badge/Node-24.14-green?logo=node.js)](https://nodejs.org/)
[![License MIT](https://img.shields.io/badge/License-MIT-yellow)](./LICENSE)

</div>

---

## 😫 你是否也遇到过这些痛点？

作为前端开发者，我们每天都在与这些“琐事”斗争：
- **版本地狱**：同时维护 5 个项目，Vue 2 用 Node 12，React 用 Node 18，Next.js 用 Node 20。每次 `cd` 都要手动 `nvm use`，偶尔忘了切版本，项目启动报错半天找不到原因。
- **终端疲劳**：任务栏堆满了 10 个黑乎乎的终端窗口，分不清哪个是哪个，为了看个日志得一个个点开翻找。
- **配置黑盒**：新拉下来的项目启动失败？不知道是 `node_modules` 坏了还是 Node 版本不对，又得手动删文件夹重装，重复劳动极其低效。
- **环境碎片化**：虽然有 `fnm`，但命令行交互依然存在摩擦感。我们需要一个上帝视角来控场。

**Current (电蝾螈) 正是为了终结这些混乱而生的。**

---

## 🔥 核心功能特性

### 🚀 智能 Node.js 运行时调度
- **自动对齐**：为每个项目独立绑定 Node 版本，支持识别 `.nvmrc`、`.node-version`。
- **一键补全自动化**：面板缺失版本时自动触发安装，无需记忆安装命令。
- **静默环境隔离**：每个项目进程精准启动在预设的 fnm 上下文中，彻底消除全局污染。

### 📊 十字准星级项目诊断 (Diagnosis)
- **环境透视**：秒级分析项目 `node_modules`、锁文件与当前 Rust/Node 运行环境的匹配度。
- **自助修复**：针对常见的环境失效问题，提供一键重置功能。

### 📋 工业级实时日志流
- **统一监控**：所有项目日志汇聚在统一界面，支持关键词高亮，像看 IDE 控制台一样舒服。
- **状态锁定**：Action Locks 机制确保在进程启动/编译中时，不会因重复点击导致并发混乱。

### 📂 灵活的项目组织
- **拖放添加**：直接将文件夹丢进面板，瞬间识别项目元数据。
- **自由排序**：支持 DND 拖拽排序，按项目优先级自定义你的工作区布局。

---

## 🛠️ 技术栈

- **桌面架构**: [Tauri 2.0](https://tauri.app/) (Rust 强力驱动，低内存、高性能)
- **前端引擎**: React 18 + TailwindCSS 4 + Framer Motion
- **版本核心**: 集成 `fnm` 实现毫秒级切换
- **构建分发**: GitHub Actions 自动化流水线 + Vercel 全自动更新服务

---

## 🏃 快速开始

### 开发环境准备
1. 安装 **fnm**: `winget install Schniz.fnm` (Windows 用户)。
2. 安装 **Node.js**: `24.14.1`。
3. 配置 Rust 环境：[安装指南](https://tauri.app/v1/guides/getting-started/prerequisites)。

### 启动开发
```powershell
npm install
npm run dev
```

---

## ❤️ 支持与赞助

如果你觉得 **Current** 帮你节省了宝贵的时间，欢迎请作者喝杯咖啡！你的支持是我持续迭代的动力。

<div align="center">
  <table border="0">
    <tr>
      <td align="center">
        <img src="./payment-QR-code/wx.png" width="200" alt="微信支付" /><br />
        <b>微信支付</b>
      </td>
      <td align="center">
        <img src="./payment-QR-code/zfb.jpg" width="200" alt="支付宝支付" /><br />
        <b>支付宝支付</b>
      </td>
    </tr>
  </table>
</div>

---

<p align="center">Made with ❤️ by MXC</p>
