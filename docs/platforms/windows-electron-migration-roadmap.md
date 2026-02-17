---
summary: "Windows 原生 Electron 桌面化迁移架构与分阶段路线图（仅规划）"
read_when:
  - 准备把 OpenClaw 从 WSL2 路径迁移到 Windows 原生桌面形态
  - 需要按阶段落地 Electron 托管 Gateway 的执行方案
title: "Windows Electron Migration Roadmap"
---

# Windows Electron 迁移架构与路线图（仅规划）

> 状态：规划 + 落地跟踪（已进入实现阶段）。
> 
> 范围：面向 Windows 设备执行，避免跨平台编译假设。

## 0. 当前进展快照（2026-02-17）

### 0.1 已完成（与路线图对齐）

- [x] `apps/windows-electron/` 工程骨架与 workspace 接入。
- [x] Main/Preload/IPC v1 主链路与 schema 校验落地。
- [x] Gateway 启停与状态探测，Scheduled Task 状态编排落地。
- [x] MCP strict 配置校验与应用链路可用。
- [x] 更新应用 + 回滚入口（last-known-good）可用。
- [x] Windows Electron owner stability soak 可通过。
- [x] Electron 托盘常驻模型（关闭隐藏、托盘恢复、显式退出）可用。
- [x] 非 iframe 模式：Bootstrap 页 + 主窗口直接导航 Control UI（bootstrap/onboarding/full）。

### 0.2 待完成（发布前关键）

- [ ] 完成 Beta Ring 发布与反馈回收（第 23.4 节任务 29）。
- [ ] 完成 Stable Gate 决议与签署记录（第 23.4 节任务 30）。
- [ ] 建立并固化每周 upstream 吸收流水线（第 23.4 节任务 28）。
  - 已完成：`apps/windows-electron/scripts/upstream-sync-win.ps1` 会产出可追溯执行报告到 `~/.openclaw/runtime/windows-electron/upstream-sync/sync-*.json`。
- [x] 补齐 Windows 平台联动文档（`docs/platforms/windows.md`、`docs/platforms/index.md`、`docs/install/updating.md`）。

### 0.3 本地打包/发布命令（当前标准）

```powershell
# 在仓库根目录执行
corepack pnpm windows:electron:package:dir
corepack pnpm windows:electron:package:nsis
corepack pnpm windows:electron:package:portable
corepack pnpm windows:electron:release:prep
# 在本地脏工作区可先跑 verify-only 周期验证
corepack pnpm windows:electron:sync:verify

# tag 发布（需要发布渠道配置与凭据）
corepack pnpm --dir apps/windows-electron run release:win:tag
```

> 注：本地打包默认 `--publish never`；若遇到 Electron 二进制下载超时，需先解决网络或镜像源可达性。

## 1. 目标与约束

### 1.1 目标

- 在现有 monorepo 内引入一个 **Electron 托管的 Windows 桌面外壳**，负责 Gateway 生命周期、可视化状态、日志入口、更新入口。
- 最大化复用现有核心能力，尤其是 `src/gateway/*`、`src/cli/*`、`src/daemon/*`、`src/channels/*`。
- 建立可持续吸收 upstream 滚动更新的机制，避免后续分叉失控。

### 1.2 非目标

- 本阶段不追求 macOS 功能对齐。
- 本阶段不做跨平台一次编译发布。
- 本阶段不做架构重写，不替换现有 Gateway 核心。

### 1.3 现状依据（仓库事实）

- Windows 服务能力已存在：`src/daemon/service.ts` 在 `win32` 分支接入 Scheduled Task，具体实现见 `src/daemon/schtasks.ts`。
- ACP Translator 对 `mcpServers` 目前是忽略策略：`src/acp/translator.ts`。
- ACP Client 新建会话默认传空 `mcpServers`：`src/acp/client.ts`。
- CLI backend 可通过参数注入 MCP 配置，且 live test 覆盖 `--strict-mcp-config` + `--mcp-config` 组合：`src/gateway/gateway-cli-backend.live.test.ts`。
- 当前官方文档对 Windows 推荐路径仍是 WSL2：`docs/platforms/windows.md`。

## 2. 是否需要开新项目？

**结论：不建议开新仓库，建议在现有 monorepo 内新增 Windows Electron 应用包。**

推荐方案：

- 在 `apps/` 下新增 `apps/windows-electron/`（新包，不是新仓库）。
- 保持 Gateway、CLI、Daemon、Channels 继续在现有 `src/` 维护。
- Windows 桌面层只做编排和适配，不复制核心业务逻辑。

原因：

- 上游滚动更新频繁，分仓会显著增加合并成本。
- 现有 `src/daemon/schtasks.ts`、`src/gateway/*` 已能提供关键能力，没必要重复造轮子。
- monorepo 内更容易做契约测试，确保适配层在上游升级后可快速验证。

## 3. 目标架构（Windows First）

### 3.1 ASCII 架构图

```text
+--------------------------------------------------------------------------------+
|                            Windows Desktop (Electron)                          |
|                                                                                |
|  +---------------------------+        IPC        +--------------------------+  |
|  | Renderer (UI)             | <---------------> | Main Process             |  |
|  | - 启停按钮                |                   | - 生命周期编排           |  |
|  | - 健康状态/日志入口       |                   | - 配置桥接               |  |
|  +-------------+-------------+                   +------------+-------------+  |
|                |                                              |                |
|                |                                              v                |
|                |                                 +--------------------------+  |
|                |                                 | Gateway Runner Adapter   |  |
|                |                                 | - 启动 openclaw gateway  |  |
|                |                                 | - 读取状态/错误码        |  |
|                |                                 +------------+-------------+  |
+----------------+----------------------------------------------|----------------+
                                                             Reuse
                                                               |
                                                               v
+--------------------------------------------------------------------------------+
|                             OpenClaw Existing Core                             |
| src/gateway/* | src/cli/* | src/daemon/* | src/channels/* | src/acp/* | src/web/* |
+--------------------------------------------------------------------------------+
```

### 3.2 模块边界

| 模块 | 路径 | 角色 | 边界规则 |
| --- | --- | --- | --- |
| Windows Desktop Shell | `apps/windows-electron/`（规划新增） | Windows UI 与本地编排 | 不直接改写 Gateway 内核逻辑 |
| Gateway Core | `src/gateway/*` | 协议、会话、服务端核心 | 作为黑盒能力复用，改动需契约测试护栏 |
| CLI/Command Surface | `src/cli/*`, `src/commands/*` | 控制入口、运维命令 | Electron 仅调用，不复制命令语义 |
| Windows Service Runtime | `src/daemon/service.ts`, `src/daemon/schtasks.ts` | Scheduled Task 安装与状态读取 | 继续作为 Windows 常驻入口，避免并行双服务模型 |
| ACP Bridge | `src/acp/*` | ACP 会话转换 | 当前不作为 MCP 配置真源，先做兼容兜底 |
| Channels + Routing | `src/channels/*`, `src/routing/*`, `src/{telegram,discord,slack,...}` | 消息入口与路由 | 不在 Electron 层改协议 |

## 4. MCP 适配策略（结合当前仓库现实）

### 4.1 约束现实

- `src/acp/translator.ts` 对 `mcpServers` 只记录日志并忽略。
- `src/acp/client.ts` 新会话时传入 `mcpServers: []`。
- `src/gateway/gateway-cli-backend.live.test.ts` 已体现 CLI backend 参数注入 MCP 的路径，即 `--strict-mcp-config` + `--mcp-config <path>`。

### 4.2 规划策略

- **短中期主路径**：由 Windows Electron 生成本地 MCP 配置文件，交由 CLI backend 参数注入，不依赖 ACP Translator 的 `mcpServers`。
- **ACP 兼容路径**：ACP 通道继续允许空 `mcpServers`，并在 UI 明确提示“ACP 侧 MCP 注入暂未生效”。
- **严格模式默认开启**：默认注入 `--strict-mcp-config`，确保 MCP 配置错误快速失败，不进入静默降级。

### 4.3 契约测试建议

- 参数契约：启动参数必须包含 `--mcp-config` 与 `--strict-mcp-config`。
- 文件契约：生成的 MCP JSON 必须满足 `{ "mcpServers": { ... } }` 结构。
- 错误契约：strict 模式下配置无效时，UI 能捕获并展示失败原因。
- 回归契约：升级 upstream 后，复跑 `src/gateway/gateway-cli-backend.live.test.ts` 同类断言。

## 5. 滚动更新吸收策略（Upstream Rolling Releases）

### 5.1 分支模型

- `main`：保持贴近官方 upstream 主线，不承载长期 Windows 私有改动。
- `windows-electron/dev`：Windows 桌面集成分支，持续 rebase `main`。
- `windows-electron/release/<YYYYMMDD>`：候选发布分支，用于冻结与回归。

### 5.2 Adapter Boundary 原则

- 新增能力优先放在 `apps/windows-electron/`，减少对 `src/gateway/*` 的侵入。
- 必须改核心时，先定义接口契约，再做最小补丁，避免把 Windows 细节渗透到通用模块。
- Electron 与核心之间使用“命令 + 状态查询”边界，不共享私有内部状态。

### 5.3 Contract Tests 体系

- Gateway Lifecycle Contract：启动、停止、重启、健康检查。
- Service Contract：Scheduled Task 安装、查询、重启一致性。
- MCP Contract：参数注入和 strict 错误可观测。
- Update Contract：升级后配置迁移和回滚可执行。

### 5.4 发布节奏

- Dev Ring（每周）：跟进 `main`，仅内部 Windows 设备。
- Beta Ring（每两周）：固定候选分支，扩大到外部试用。
- Stable Ring（每月）：通过回归门禁后发布稳定版本。
- 与官方通道对齐：Dev Ring 对应 `dev/main`，Beta Ring 对应 `beta`，Stable Ring 对应 `latest`。
- 升级吸收顺序固定为：`main` 同步 -> 契约测试 -> Windows smoke -> Beta 扩围 -> Stable 发布。

发布门禁建议：

- Windows 真机 smoke 通过。
- 关键契约测试全绿。
- 回滚演练成功（可回到前一版并保留用户配置）。

## 6. Windows Only 落地路径（避免跨编译假设）

- 开发、构建、打包、验收都在 Windows 主机执行。
- CI 至少提供一条 Windows runner 主线，不把 Windows 产物依赖于 macOS/Linux 交叉构建。
- 首发范围限定为 Windows 10/11 x64，后续再评估 ARM64。
- 发布包与自动更新源按 Windows 独立渠道管理，不与 macOS 发布流程绑死。

## 7. 分阶段路线图（M0/M1/M2/M3）

### M0: 架构冻结与执行准备

**入口条件**

- [ ] 本文档评审通过。
- [ ] 明确不做新仓库，只在 monorepo 新增 Windows 应用包。

**任务清单**

- [ ] 固化模块边界和职责图。
- [ ] 定义 Gateway Lifecycle、Service、MCP、Update 四类契约。
- [ ] 定义 Windows 开发机基线（Node、pnpm、签名工具、日志采集方式）。

**退出条件**

- [ ] M1 所需接口定义完成。
- [ ] 风险台账和降级策略被接受。

### M1: Electron 壳层最小可用（本地托管 Gateway）

**入口条件**

- [ ] M0 退出条件全部达成。
- [ ] 已有一台可持续使用的 Windows 开发机。

**任务清单**

- [ ] 建立 `apps/windows-electron/` 基础骨架（仅规划阶段定义，不在此文实现）。
- [ ] 通过 Main Process 启停本地 Gateway 进程。
- [ ] Renderer 提供最小状态面板（运行态、端口、最近错误）。
- [ ] 接入现有 daemon 命令能力，显示 Scheduled Task 状态。

**退出条件**

- [ ] 用户可在桌面 UI 完成启停与状态确认。
- [ ] Gateway 异常退出可被 UI 感知。
- [ ] 不依赖 WSL 即可完成本地运行闭环。

### M2: MCP 与更新通道接入

**入口条件**

- [ ] M1 退出条件全部达成。

**任务清单**

- [ ] 实装 MCP 文件生成和参数注入（`--mcp-config` + `--strict-mcp-config`）。
- [ ] 在 UI 暴露 MCP 校验失败信息。
- [ ] 建立 upstream 同步脚本和回归流程（契约测试优先）。
- [ ] 完成 Beta Ring 的升级与回滚演练。

**退出条件**

- [ ] MCP 注入链路在 Windows 端可观测、可回滚。
- [ ] upstream 周期性吸收流程可重复执行。

### M3: 稳定发布与运维化

**入口条件**

- [ ] M2 退出条件全部达成。

**任务清单**

- [ ] 完成 Stable Ring 发布节奏与发布手册。
- [ ] 引入崩溃日志、升级日志、恢复指引。
- [ ] 建立用户支持分层处理流程（安装、升级、回滚、MCP 故障）。

**退出条件**

- [ ] Windows 版本具备持续发布能力。
- [ ] 回滚、升级、恢复都有文档化流程与演练记录。

## 8. 风险台账与缓解

| 风险 | 概率 | 影响 | 触发信号 | 缓解策略 | 兜底方案 |
| --- | --- | --- | --- | --- | --- |
| upstream 高频变更导致适配层失效 | 高 | 高 | rebase 后契约测试失败 | 强制 adapter boundary，先修契约再合并 | 暂停升级，停留在上个 release 分支 |
| Scheduled Task 与桌面生命周期冲突 | 中 | 高 | 重启后出现双实例或孤儿进程 | 统一由一个控制源编排，避免并行守护机制 | 一键清理任务并回退到手动启动 |
| ACP 路径无法承载 MCP 透传 | 高 | 中 | ACP 会话存在 MCP 功能缺失 | 主路径改为 CLI backend 参数注入 | 保持 ACP 仅基础能力，UI 给出限制提示 |
| strict MCP 配置导致启动失败 | 中 | 中 | 首次启动报配置错误 | 启动前做 JSON 结构校验与预检查 | 提供“回退到上次可用配置” |
| Windows 环境差异（权限、杀软、路径） | 中 | 高 | 用户机启动失败率上升 | 首周建立标准化诊断脚本与日志采集 | 提供安全模式启动和最小配置模板 |
| 更新后配置迁移异常 | 中 | 高 | 升级后网关无法拉起 | 升级前备份配置，升级后跑健康检查 | 一键回滚到上一版本和备份配置 |

## 9. 验收标准（文档级）

- [ ] 已明确回答“是否需要开新项目”，并给出可执行建议。
- [ ] 包含至少一个 ASCII 架构图。
- [ ] 明确模块边界与仓库真实路径。
- [ ] 含 M0/M1/M2/M3 分阶段入口与退出条件。
- [ ] 含 upstream 滚动更新吸收策略（分支、边界、契约测试、节奏）。
- [ ] 含 MCP 适配策略，并反映当前 ACP 与 CLI backend 事实。
- [ ] 含 Windows only 推进路径与首周执行清单。

## 10. Windows 开工首周执行清单

### Day 1: 环境和基线

- [ ] 在 Windows 真机完成开发环境准备（Node 22+、pnpm、Git、签名基础）。
- [ ] 拉取仓库并执行一次全量构建与测试基线。
- [ ] 记录本机权限模型与杀软策略，确认可启动本地 Gateway。

### Day 2: 运行链路打样

- [ ] 验证 `src/daemon/schtasks.ts` 相关能力在本机可调用。
- [ ] 确认 Gateway 启停与健康查询最小闭环。
- [ ] 固化日志采集路径与最小问题复现模板。

### Day 3: 架构落地准备

- [ ] 确认 `apps/windows-electron/` 目录规划与 workspace 接入方案。
- [ ] 固化 IPC 契约草案（启动、停止、状态、日志、升级）。
- [ ] 评审“不侵入核心”的边界约束。

### Day 4: MCP 与更新策略验证

- [ ] 以测试样例为基准验证 `--mcp-config` + `--strict-mcp-config` 参数链路设计。
- [ ] 设计 MCP 配置文件生命周期（生成、校验、回滚）。
- [ ] 完成 upstream 同步节奏和分支策略演练。

### Day 5: 里程碑门禁

- [ ] 召开 M0 退出评审，锁定 M1 backlog。
- [ ] 建立风险跟踪节奏（每日更新风险台账）。
- [ ] 形成下一周的可执行任务拆分与 owner。

---

如果你同意这个规划，下一步就是在 Windows 机器上按“首周执行清单”推进，并在 Day 5 做 M0 退出评审，再进入 M1。

## 11. 建议补充：`apps/windows-electron/` 工程骨架（仅规划）

> 目标：让你在 Windows 真机上开工时，第一天就有清晰目录和职责，不需要边做边猜。

```text
apps/windows-electron/
  package.json
  tsconfig.json
  electron-builder.yml (或 forge config)
  scripts/
    dev-win.ps1
    build-win.ps1
    smoke-win.ps1
  src/
    main/
      index.ts                 # app ready / single-instance / lifecycle
      window-manager.ts        # 主窗口与托盘窗口管理
      tray-manager.ts          # tray 菜单与状态灯
      ipc/
        register.ts            # IPC 注册入口
        channels.ts            # channel 常量与版本
      gateway/
        supervisor.ts          # 进程托管（start/stop/restart）
        health-probe.ts        # 健康检查与退避
        log-tail.ts            # 日志采集与裁剪
      service/
        scheduled-task.ts      # 调用现有 daemon 命令/接口
      mcp/
        config-writer.ts       # 生成 mcp 配置文件
        config-validator.ts    # 严格校验（启动前）
      updates/
        updater.ts             # 更新检查/下载/回滚入口
      telemetry/
        event-bus.ts
    preload/
      index.ts                 # contextBridge 暴露白名单 API
      schema.ts                # IPC payload schema
    renderer/
      index.html
      main.ts
      pages/
        dashboard.ts           # 运行态仪表板
        logs.ts                # 日志视图
        settings.ts            # 启动参数 / MCP 设置
      state/
        gateway-store.ts
        update-store.ts
        mcp-store.ts
      components/
        status-pill.ts
        danger-banner.ts
```

### 11.1 核心职责分配（不越界）

- Main Process：唯一系统权限入口（进程、文件、更新、任务计划）。
- Preload：能力收敛层，只暴露最小可用 API。
- Renderer：纯展示和用户交互，不直连 Node 能力。
- Gateway Core（现有 `src/*`）：保持黑盒复用，不复制实现。

## 12. 建议补充：IPC 白名单契约（v1）

### 12.1 通道列表（建议）

- `gateway:start`
- `gateway:stop`
- `gateway:restart`
- `gateway:status:get`
- `gateway:logs:tail`
- `service:scheduled-task:get`
- `service:scheduled-task:install`
- `service:scheduled-task:restart`
- `mcp:config:validate`
- `mcp:config:apply`
- `updates:check`
- `updates:apply`

### 12.2 安全约束

- Renderer 不允许传入可执行命令字符串；只允许结构化参数。
- 所有文件路径由 Main 端归一化并限制在允许目录内。
- IPC 每个请求附 `requestId` 与 `schemaVersion`，便于追踪与向后兼容。
- 统一错误结构：`{ code, message, hint, retriable }`。

## 13. 建议补充：Windows 本地状态目录规范

> 目标：日志、缓存、临时文件、MCP 配置可定位、可清理、可回滚。

建议目录（示意）：

```text
%USERPROFILE%\.openclaw\
  logs\
    electron-main.log
    gateway.log
    updater.log
  mcp\
    active.json
    backup\YYYYMMDD-HHmmss.json
  runtime\
    last-known-good.json
    lock\
  crash\
    renderer\
    main\
```

规则：

- `mcp/active.json` 永远可被回滚覆盖。
- 每次更新前备份 `last-known-good.json` + MCP active 配置。
- 日志按大小滚动，避免无限增长。

## 14. 建议补充：滚动更新吸收 SOP（可直接执行）

### 14.1 周期（每周一次）

1. 从 upstream 同步到 `main`。
2. 将 `windows-electron/dev` rebase 到最新 `main`。
3. 跑契约测试（Lifecycle/Service/MCP/Update）。
4. 在 Windows 真机跑 smoke：启动、重启、更新、回滚。
5. 通过后打 Beta Ring；下一周期进入 Stable Ring。

### 14.2 冲突处理优先级

- 优先保持 `src/gateway/*` 原样，先改 `apps/windows-electron/*` 适配。
- 若必须修改核心：先补契约测试，再提最小补丁。
- 禁止“为了过编译”把平台分支逻辑散落到多个核心模块。

## 15. 建议补充：M1 前的 Done 定义（DoD）

- [ ] 只用 Windows 真机即可完成开发-构建-打包-验证闭环。
- [ ] Gateway 可被 UI 一键启停，异常可见，日志可读。
- [ ] Scheduled Task 状态在 UI 内可见且可执行恢复。
- [ ] MCP 配置错误在 30 秒内可定位到具体字段。
- [ ] 升级失败可一键回滚到 last-known-good。
- [ ] upstream 合并后 1 个工作日内可完成适配回归。

## 16. 建议补充：你在 Windows 设备上的首批开工顺序

1. 先做 `main + preload` 最小链路（不做复杂 UI）。
2. 再接 `gateway supervisor` 与 `status + log`。
3. 然后接 `mcp config validate/apply`。
4. 最后做 `updates + rollback`。

这样能最大限度避免“UI 已完成但底层不稳”的返工。

## 17. 建议补充：逐文件职责表（M1 优先级）

> 说明：以下为“先做能跑，再做好用”的 M1 目标文件表。估时为单人全职的保守估计（不含等待外部依赖）。

| 优先级 | 文件（规划） | 主要职责 | 依赖 | 预估工时 |
| --- | --- | --- | --- | --- |
| P0 | `apps/windows-electron/src/main/index.ts` | 应用生命周期、单实例锁、窗口启动顺序 | 无 | 0.5-1 天 |
| P0 | `apps/windows-electron/src/main/ipc/register.ts` | 注册 IPC handler，统一鉴权与错误包装 | `ipc/channels.ts` | 0.5 天 |
| P0 | `apps/windows-electron/src/main/ipc/channels.ts` | IPC 通道常量与版本号 | 无 | 0.25 天 |
| P0 | `apps/windows-electron/src/preload/index.ts` | `contextBridge` 暴露最小 API | `preload/schema.ts` | 0.5 天 |
| P0 | `apps/windows-electron/src/preload/schema.ts` | 请求/响应 schema 校验 | 无 | 0.5 天 |
| P0 | `apps/windows-electron/src/main/gateway/supervisor.ts` | Gateway 进程启停/重启/状态机 | `health-probe.ts` | 1-1.5 天 |
| P0 | `apps/windows-electron/src/main/gateway/health-probe.ts` | 健康检查、退避重试 | `src/gateway/*`（复用协议） | 0.5 天 |
| P1 | `apps/windows-electron/src/main/gateway/log-tail.ts` | 读取并裁剪日志、推送 Renderer | 状态目录规范 | 0.5 天 |
| P1 | `apps/windows-electron/src/main/service/scheduled-task.ts` | 查询/安装/重启 Scheduled Task 编排 | `src/daemon/schtasks.ts` | 1 天 |
| P1 | `apps/windows-electron/src/main/mcp/config-validator.ts` | MCP 配置结构校验、strict 前置检查 | `config-writer.ts` | 0.5 天 |
| P1 | `apps/windows-electron/src/main/mcp/config-writer.ts` | 生成 `mcp/active.json` + 备份回滚 | 状态目录规范 | 0.75 天 |
| P1 | `apps/windows-electron/src/renderer/state/gateway-store.ts` | 渲染层运行态状态管理 | IPC | 0.5 天 |
| P1 | `apps/windows-electron/src/renderer/pages/dashboard.ts` | 启停按钮、状态摘要 | state | 0.5-1 天 |
| P2 | `apps/windows-electron/src/main/updates/updater.ts` | 检查更新、应用更新、失败回滚入口 | 发布渠道 | 1-1.5 天 |
| P2 | `apps/windows-electron/src/renderer/pages/settings.ts` | MCP 与更新设置页 | IPC + state | 0.75-1 天 |
| P2 | `apps/windows-electron/src/renderer/pages/logs.ts` | 日志查看与导出 | log-tail | 0.5 天 |

### 17.1 M1 最小文件集合（必须先完成）

- `src/main/index.ts`
- `src/main/ipc/register.ts`
- `src/main/ipc/channels.ts`
- `src/preload/index.ts`
- `src/preload/schema.ts`
- `src/main/gateway/supervisor.ts`
- `src/main/gateway/health-probe.ts`
- `src/renderer/pages/dashboard.ts`
- `src/renderer/state/gateway-store.ts`

## 18. 建议补充：阶段排期（按周）

### Week 1（M0 收口 + M1 启动）

- 交付：工程骨架、IPC v1、Gateway 启停链路打通。
- 验收：桌面 UI 可显示状态，并能 start/stop/restart。

### Week 2（M1 收尾）

- 交付：日志链路、Scheduled Task 管理、错误提示闭环。
- 验收：异常可观测（退出码、最后错误、恢复建议）。

### Week 3（M2 启动）

- 交付：MCP 配置生成/校验/应用，strict 启动前检查。
- 验收：配置错误可定位到字段，可一键回滚上次可用配置。

### Week 4（M2 收口 + 预备 M3）

- 交付：更新吸收流程演练（upstream 同步 + 回归 + smoke）。
- 验收：一次完整“升级 -> 发现问题 -> 回滚 -> 恢复”演练通过。

## 19. 建议补充：测试矩阵（Windows 真机）

| 测试类别 | 场景 | 通过标准 |
| --- | --- | --- |
| 启动稳定性 | 连续 20 次冷启动 | 无双实例、无卡死、状态可达 |
| 服务管理 | 安装/重启/查询 Scheduled Task | UI 与实际系统状态一致 |
| Gateway 异常恢复 | 强制杀进程后自动恢复 | 30 秒内显示异常并可手动恢复 |
| MCP 严格模式 | 无效 JSON / 缺字段 / 错路径 | 启动前阻断并给可读错误 |
| 更新回滚 | 升级后故障回滚 | 可恢复到 last-known-good |
| 日志可观测 | 导出日志并定位问题 | 关键链路有 requestId 可串联 |

## 20. 建议补充：最容易踩坑的 10 个点（提前规避）

1. 让 Renderer 直接调用 Node API（安全红线）。
2. IPC 不做 schema 校验，导致线上不可控输入。
3. 同时启用两套守护机制（Electron + Scheduled Task）造成双实例。
4. 把 Windows 逻辑散落到 `src/gateway/*`，后续难以吸收 upstream。
5. MCP 配置不做 strict 预检，问题延迟到运行期。
6. 没有 `last-known-good`，更新失败无法快速恢复。
7. 日志没有 requestId，跨进程问题无法追踪。
8. 把跨平台打包当先决条件，拖慢 Windows 首发。
9. 没有 smoke 脚本，手工验证不可重复。
10. 一次性大改，缺少 M0/M1 的阶段门禁。

## 21. 建议补充：执行看板模板（可直接抄到 issue）

```markdown
### Epic: Windows Electron M1

- [ ] P0-1 `main/index.ts` + 单实例锁
- [ ] P0-2 IPC 注册与 schema 验证
- [ ] P0-3 Gateway supervisor（start/stop/restart）
- [ ] P0-4 Dashboard 最小状态页
- [ ] P1-1 日志 tail 与导出
- [ ] P1-2 Scheduled Task 管理页
- [ ] P1-3 MCP config validate/apply
- [ ] P2-1 更新检查与回滚入口

### Exit Criteria
- [ ] M1 DoD 全部满足
- [ ] Windows smoke 脚本连续 3 天全绿
- [ ] upstream 同步演练至少 1 次通过
```

## 22. 建议补充：默认决策（减少开工分歧）

- 默认不新开仓库；只新增 `apps/windows-electron/`。
- 默认先保证本地稳定，再追求 UI 完整度。
- 默认 MCP 走 CLI backend 参数注入主路径。
- 默认所有发布与验收在 Windows 真机完成。
- 默认每周一次 upstream 吸收，不积压大版本差异。

---

## 23. 可直接执行的 30 条任务清单（含输入/输出/验收）

> 说明：按顺序执行。每条都尽量做到“可验证、可回滚、可交接”。

### 23.1 M0（1-8）

1. 确认 Windows 开发机基线
- 输入：Node 22+、pnpm、Git、PowerShell 7
- 输出：环境检查记录
- 验收：版本命令全部可执行

2. 拉取并安装依赖
- 输入：仓库代码
- 输出：依赖安装完成
- 验收：安装无阻塞错误

3. 跑一次现有基线构建
- 输入：当前主分支代码
- 输出：构建结果日志
- 验收：构建通过或有明确阻塞清单

4. 跑一次现有基线测试
- 输入：当前主分支代码
- 输出：测试结果日志
- 验收：测试通过或有明确阻塞清单

5. 建立 Windows 日志目录规范
- 输入：目录规范（第 13 节）
- 输出：日志/运行时目录创建脚本
- 验收：目录结构可重复创建

6. 确认 Scheduled Task 能力可用
- 输入：`src/daemon/schtasks.ts` 对应链路
- 输出：任务查询结果
- 验收：可读取任务状态

7. 定义 IPC v1 通道清单冻结版
- 输入：第 12 节草案
- 输出：项目内部约定文档
- 验收：团队评审通过

8. 冻结 M1 最小文件集合
- 输入：第 17.1 节列表
- 输出：M1 scope 清单
- 验收：不再新增 P0 范围

### 23.2 M1（9-18）

9. 初始化 `apps/windows-electron/` 包结构
- 输入：第 11 节目录规划
- 输出：基础目录与占位文件
- 验收：能被 workspace 识别

10. 实现主进程入口与单实例锁
- 输入：`main/index.ts`
- 输出：应用生命周期基础能力
- 验收：重复启动只保留一个实例

11. 实现 IPC 注册中心
- 输入：`main/ipc/register.ts`
- 输出：统一 handler 注册
- 验收：未注册通道请求被拒绝

12. 实现 preload 白名单桥接
- 输入：`preload/index.ts`
- 输出：Renderer 可用最小 API
- 验收：Renderer 仅能访问白名单能力

13. 实现 schema 校验层
- 输入：`preload/schema.ts`
- 输出：请求/响应校验
- 验收：非法 payload 被拦截并返回统一错误

14. 实现 Gateway supervisor（start/stop/restart）
- 输入：`main/gateway/supervisor.ts`
- 输出：网关进程状态机
- 验收：启停重启动作可重复执行

15. 实现 health probe 与退避策略
- 输入：`main/gateway/health-probe.ts`
- 输出：健康检查与重试
- 验收：异常退出可被检测并提示恢复

16. 实现 Dashboard 最小页
- 输入：`renderer/pages/dashboard.ts`
- 输出：状态+启停按钮
- 验收：UI 操作可驱动主进程动作

17. 实现日志 tail 能力
- 输入：`main/gateway/log-tail.ts`
- 输出：最近日志读取接口
- 验收：UI 能看到最新日志且不会卡顿

18. 接入 Scheduled Task 状态视图
- 输入：`main/service/scheduled-task.ts`
- 输出：任务状态查询/重启入口
- 验收：UI 与系统实际状态一致

### 23.3 M2（19-25）

19. 实现 MCP 配置写入器
- 输入：`main/mcp/config-writer.ts`
- 输出：`mcp/active.json` + 备份
- 验收：每次应用配置都会生成可回滚副本

20. 实现 MCP 配置校验器
- 输入：`main/mcp/config-validator.ts`
- 输出：strict 前置校验结果
- 验收：非法配置在启动前被阻断

21. 接入 CLI backend 参数注入
- 输入：`--mcp-config` + `--strict-mcp-config`
- 输出：统一参数组装逻辑
- 验收：启动参数可被日志和测试验证

22. UI 增加 MCP 配置页
- 输入：`renderer/pages/settings.ts`
- 输出：编辑/校验/应用/回滚
- 验收：错误能定位到字段级提示

23. 建立更新检查入口
- 输入：`main/updates/updater.ts`
- 输出：手动检查更新能力
- 验收：可返回“有/无更新”与错误详情

24. 建立回滚入口
- 输入：last-known-good 机制
- 输出：一键回滚能力
- 验收：可恢复到上次可用版本和配置

25. 完成一次“升级-失败-回滚-恢复”演练
- 输入：测试更新包或模拟失败场景
- 输出：演练记录
- 验收：全流程可在文档内复现

### 23.4 M3（26-30）

26. 完善错误码字典与用户提示
- 输入：统一错误结构
- 输出：错误码映射表
- 验收：关键故障有明确用户可执行建议

27. 完善 smoke 脚本
- 输入：`scripts/smoke-win.ps1`
- 输出：可重复的一键检查
- 验收：连续 3 天执行稳定

28. 建立 upstream 每周吸收流水线
- 输入：第 14 节 SOP
- 输出：固定同步节奏与检查清单
- 验收：至少连续两周成功执行

29. 完成 Beta Ring 发布与回收反馈
- 输入：候选构建
- 输出：Beta 试用报告
- 验收：关键阻塞问题清零或有延期决议

30. 通过 Stable Gate
- 输入：DoD + 测试矩阵
- 输出：稳定版发布决策
- 验收：Go/No-Go 结论与签署记录

## 24. Windows 开工当天命令清单（顺序执行）

> 说明：以下是建议命令模板，用于你在 Windows 真机上快速拉起“可验证起点”。

```powershell
# 0) 基线检查
node -v
pnpm -v
git --version

# 1) 拉代码（示例）
git fetch --all --prune
git checkout <your-working-branch>

# 2) 安装依赖
pnpm install

# 3) 基线构建与检查（按仓库已有脚本）
pnpm build
pnpm check
pnpm test

# 4) 记录当前 gateway 状态（为后续对比）
openclaw gateway status

# 5) 如果要先跑服务管理链路（示意）
openclaw gateway install
openclaw gateway status
```

执行产物建议保存：

- `logs/day1-build.log`
- `logs/day1-test.log`
- `logs/day1-gateway-status.log`

## 25. 首个里程碑评审模板（M0 Exit / Go-NoGo）

> 建议时长：10 分钟；只讨论是否进入 M1，不扩散到实现细节。

```markdown
# M0 Exit Review

## 1) 范围确认
- [ ] 是否确认“不新开仓库，只新增 apps/windows-electron”
- [ ] 是否确认 M1 最小文件集合冻结

## 2) 技术基线
- [ ] Windows 真机环境检查完成
- [ ] 基线构建/测试结果可追溯
- [ ] Scheduled Task 能力可调用

## 3) 架构与安全
- [ ] IPC v1 通道清单冻结
- [ ] Renderer 无直接 Node 能力
- [ ] 错误结构统一 `{code,message,hint,retriable}`

## 4) 风险
- [ ] 风险台账已更新并排序
- [ ] 每个高风险有 owner 与兜底方案

## 5) 决议
- [ ] GO M1
- [ ] NOGO（列出阻塞项和修复截止时间）
```

## 26. 建议补充：最小化文档联动更新点

为避免后续信息分裂，进入 M1 后建议同步更新：

- `docs/platforms/windows.md`（新增“Windows Electron 试验路径”小节）
- `docs/platforms/index.md`（平台支持状态文案）
- `docs/install/updating.md`（Windows 桌面版更新与回滚说明）

---

至此这份路线图已经覆盖：架构、边界、分期、逐文件职责、任务清单、执行命令、评审模板。你可以直接带到 Windows 设备开工。

## 27. 关键可行性闸门补丁（架构评审后新增）

> 目标：把“可做”改成“可判定”，避免进入 M1 后才暴露不可落地前提。

### 27.1 “核心完整实现”边界定义（V1 与 V2）

**V1（必须先达成）**

- Windows Electron 壳层完成 Gateway 启停、状态展示、日志入口、错误可见。
- MCP 仅走 CLI backend 参数注入，固定为 `--mcp-config` + `--strict-mcp-config`。
- 单一进程所有权已冻结并可验证，禁止并行守护。
- 更新链路最少支持一次完整“升级 -> 失败 -> 回滚 -> 恢复”演练。

**V2（在 V1 稳定后再开）**

- ACP 侧原生 `mcpServers` 支持（当前未实现，不计入 V1）。
- 更新对象扩展策略（例如独立 Gateway 灰度）和高级发布分流。
- 更细粒度多后端运行策略（按 profile 选择 backend）。

**Go/No-Go 判定**

- Go 条件：
  - [ ] V1 四项能力全部可在 Windows 真机复现。
  - [ ] 每项能力都有对应验收记录，且可追溯到代码路径。
- No-Go 条件：
  - [ ] 任何 V1 项仍依赖“后续实现再补”描述。
  - [ ] 以 V2 未落地能力作为 M1/M2 的前置前提。

### 27.2 MCP capability split 冻结决议

**V1 决议**

- MCP 只认 CLI backend 参数路径：`--mcp-config` + `--strict-mcp-config`。
- ACP translator 当前会忽略 `mcpServers`，不能作为 V1 的 MCP 能力来源。

**V2 决议**

- ACP 原生 `mcpServers` 支持单独立项，进入 V2。
- 在 V2 立项完成前，任何需求评审不得把 ACP `mcpServers` 视为已支持。

**事实声明（必须写入评审结论）**

- 当前 `src/acp/translator.ts` 对 `mcpServers` 是忽略策略。
- 当前路线图不宣称 ACP 原生 MCP 已支持。

**Go/No-Go 判定**

- Go 条件：
  - [ ] 启动参数日志可见并包含 `--mcp-config` 与 `--strict-mcp-config`。
  - [ ] strict 模式错误可被 UI 捕获并展示。
- No-Go 条件：
  - [ ] 发现任何实现路径仅依赖 ACP `mcpServers` 注入。
  - [ ] MCP 配置失败时仍允许静默启动。

### 27.3 单一进程所有权策略（Electron 与 Scheduled Task 二选一）

**可选策略（必须二选一，不可并行）**

- 方案 A，Electron Owner：Electron 主进程持有唯一 Gateway 生命周期，Scheduled Task 仅用于安装辅助。
- 方案 B，Scheduled Task Owner：Scheduled Task 持有常驻生命周期，Electron 只做控制台与状态读写。

**推荐默认**

- 默认选 **方案 B（Scheduled Task Owner）**，理由是重启后自恢复更稳定，且与现有 `src/daemon/schtasks.ts` 事实路径一致。

**防双实例规则（必须全部满足）**

- [ ] 启动前先做 owner 探测，若发现非本 owner 已运行则拒绝拉起。
- [ ] Electron 侧使用单实例锁，重复启动只激活现有窗口。
- [ ] Scheduled Task 与 Electron 共享同一状态探针，不各自做“盲启动重试”。
- [ ] 每次启动写入唯一 `requestId`，日志可追踪 owner 决策链。

**Go/No-Go 判定**

- Go 条件：
  - [ ] 连续 20 次冷启动，无双实例与孤儿进程。
- No-Go 条件：
  - [ ] 任一场景出现并行守护或 owner 决策冲突。

### 27.4 更新对象定义（App-only vs App+Gateway 同包）

**选项定义**

- App-only：仅更新 Electron UI 壳层，Gateway 二进制或 CLI 由外部机制维护。
- App+Gateway 同包：桌面壳层与 Gateway 运行时同版本发布、同事务回滚。

**推荐默认**

- 默认选 **App+Gateway 同包**，先保证版本一致性与回滚原子性，减少 UI 与 Gateway 协议漂移。

**选择门槛**

- Go（采用 App+Gateway 同包）条件：
  - [ ] 升级后可自动验证 Gateway 可启动。
  - [ ] 回滚可同时恢复 app 与 Gateway 到上次可用版本。
- No-Go（禁止进入 Beta）条件：
  - [ ] 仅更新 app 会导致协议不兼容且无自动阻断。
  - [ ] 无法证明跨版本组合在 smoke 中稳定。

### 27.5 外部 CLI backend 就绪门槛

**目标**

- 在 M1 开工前，确认目标 backend 在 Windows 本机可调用、可鉴权、可稳定拉起。

**必过清单**

- [ ] 目标命令存在性检查通过（例如 `claude` 或 `codex` 在 PATH 可执行）。
- [ ] Electron 主进程与 Scheduled Task 上下文都能解析到同一 backend 命令路径。
- [ ] 环境变量与认证资料可读取，且 profile 与默认模型配置一致。
- [ ] backend 首次调用成功，失败信息可回传到 UI。
- [ ] 至少完成一次断网或鉴权失效演练，并有可执行恢复步骤。

**Go/No-Go 判定**

- Go 条件：
  - [ ] `gateway-cli` 启动链路在目标 backend 下通过 smoke。
- No-Go 条件：
  - [ ] 命令可见但鉴权不可用，或不同运行上下文命令解析不一致。

### 27.6 M1 开工前冻结决议清单

- [ ] 已冻结“核心完整实现”V1 范围，不夹带 V2 目标。
- [ ] 已冻结 MCP split，明确 ACP `mcpServers` 不计入 V1。
- [ ] 已冻结单一 owner 策略（A 或 B），并完成防双实例演练。
- [ ] 已冻结更新对象（App-only 或 App+Gateway），并记录默认方案。
- [ ] 已完成外部 CLI backend 就绪检查，阻塞项清零或有书面延期决议。
- [ ] 已指定每个冻结项的 owner、验收人、复验日期。

### 27.7 M2 进入条件（新增硬门槛）

- [ ] M1 退出条件全部达成，且连续 5 个工作日无 P0 稳定性回归。
- [ ] MCP strict 注入链路在 Windows 真机和 CI Windows runner 均通过。
- [ ] 更新链路完成一次“升级 -> 故障注入 -> 回滚 -> 恢复”全流程演练。
- [ ] 单一 owner 策略在冷启动、热重启、用户注销后均无双实例。
- [ ] 外部 CLI backend 在目标 profile 下通过可用性与鉴权复测。

### 27.8 No-Go 触发条件（新增）

- [ ] 发现需求或实现依赖“ACP 原生 `mcpServers` 已支持”的前提。
- [ ] 出现 Electron 与 Scheduled Task 并行拉起 Gateway 的路径。
- [ ] 更新方案无法保证可回滚到 last-known-good。
- [ ] backend 命令在任一运行上下文不可用，或鉴权状态不可判定。
- [ ] 关键追踪日志缺失，无法还原启动失败或 owner 冲突原因。

触发任一项时，结论固定为 **No-Go**，必须先修复再继续阶段推进。

### 27.9 代码可追溯引用（短链）

- MCP translator 现状：`src/acp/translator.ts`
- CLI backend MCP 参数注入测试：`src/gateway/gateway-cli-backend.live.test.ts`
- Windows Scheduled Task 能力：`src/daemon/schtasks.ts`
- Gateway CLI 启动入口：`src/cli/gateway-cli/run.ts`
- 默认 agent/profile 类型定义：`src/config/types.agent-defaults.ts`
