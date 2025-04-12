# Web监控SDK架构文档 (Monorepo版)

```
┌────────────────────────────────────────────────────────────────────┐
│                     web-moniter Monorepo                           │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                      @senmu/web-moniter                      │  │
│  │                       (入口包/整合层)                          │  │
│  └────────────────────────────┬─────────────────────────────────┘  │
│                               │                                    │
│               ┌───────────────┼────────────────┐                   │
│               │               │                │                   │
│               ▼               ▼                ▼                   │
│  ┌────────────────────┐ ┌──────────────┐ ┌───────────────────┐     │
│  │  @senmu/core       │ │ @senmu/types │ │  @senmu/reporter  │     │
│  │   (核心追踪器)      │ │  (类型定义)   │ │    (数据上报)       │     │
│  └────────┬───────────┘ └──────────────┘ └───────────────────┘     │
│           │                                                        │
│           │                                                        │
│           ▼                                                        │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │                     插件包 (@senmu/plugins)                 │    │
│  │                                                            │    │
│  │  ┌──────────────┐ ┌─────────────┐ ┌───────────────────┐    │    │
│  │  │              │ │             │ │                   │    │    │
│  │  │   js-error   │ │   network   │ │   performance     │... │    │
│  │  │              │ │             │ │                   │    │    │
│  │  └──────────────┘ └─────────────┘ └───────────────────┘    │    │
│  │                                                            │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

## 1. 架构概述

web-moniter 是一个采用 Monorepo 结构的前端监控 SDK，通过模块化、插件化的架构设计，为 Web 应用提供全面的性能监控、错误监控和用户行为监控能力。SDK 将核心功能、插件和上报模块拆分成独立的包，以实现更好的代码组织和维护。

Monorepo 架构的优势：

- **代码共享**：各个包之间可以共享代码和类型定义
- **统一版本管理**：所有包的版本可以集中管理和发布
- **独立开发与发布**：每个包可以独立开发、测试和发布
- **渐进式引入**：用户可以按需引入所需的监控能力

## 2. 包结构设计

### 2.1 核心包

#### @senmu/web-moniter (入口包)

- **功能职责**：作为整个监控系统的入口和整合层
- **主要内容**：
  - 导出所有公共 API
  - 提供便捷的初始化方法
  - 集成和组装各个子包功能

#### @senmu/core (核心追踪器)

- **功能职责**：
  - 插件管理：注册、初始化和销毁插件
  - 配置管理：存储和管理全局配置
  - 事件分发：提供事件发布/订阅机制
  - 上下文管理：维护监控数据的上下文信息

- **主要接口**：
  - `init(config)`: 初始化核心追踪器
  - `use(pluginCtors)`: 注册用户插件
  - `addError(err, opts)`: 上报错误
  - `send(metricList, reportNow)`: 发送指标数据
  - `setConfig(newConfig)`: 设置配置
  - `destroy()`: 销毁实例

#### @senmu/types (类型定义包)

- **功能职责**：提供所有包共用的 TypeScript 类型定义
- **主要内容**：
  - 插件接口定义
  - 配置选项类型
  - 事件类型定义
  - 监控数据结构定义

#### @senmu/reporter (数据上报包)

- **功能职责**：
  - 格式化监控数据
  - 调用 API 将数据发送到服务器
  - 处理上报的成功与失败
  - 提供多种上报策略（批量、实时、离线缓存等）

- **实现细节**：
  - 支持批量上报和实时上报
  - 包含错误处理和重试机制
  - 支持多种上报方式（Beacon API、XHR、Image等）

### 2.2 插件系统

#### @senmu/plugins (插件集合包)

插件是 SDK 功能扩展的主要方式，每个插件负责特定的监控功能，集成在插件集合包中：

- **基础插件抽象类**:
  - 所有插件的基类
  - 提供通用的方法如数据上报、采样处理等

- **具体插件实现**:
  - `@senmu/plugins/js-error`: JavaScript 错误捕获
  - `@senmu/plugins/network`: 网络请求监控
  - `@senmu/plugins/resource`: 资源加载监控
  - `@senmu/plugins/performance`: 性能指标监控
  - `@senmu/plugins/pv`: 页面访问(PV)监控
  - `@senmu/plugins/metric`: 业务指标监控

- **插件接口**:
  - `name`: 插件名称
  - `setUp()`: 初始化插件，设置监听器
  - `destroy()`: 销毁插件，清理资源
  - `apply()`: 挂载插件提供的方法到核心实例

## 3. 数据流向

在 Monorepo 架构中，数据流转过程：

1. **数据采集**：
   - 插件包中的插件通过各种手段采集数据
   - 采集的原始数据经过插件初步处理

2. **数据处理**：
   - 插件将处理后的数据传递给核心包
   - 核心包对数据进行聚合和采样，添加上下文信息

3. **数据上报**：
   - 核心包将数据传递给上报包
   - 上报包将数据格式化并上报到服务器

## 4. 包依赖关系

```
@senmu/web-moniter
 ├── @senmu/core
 ├── @senmu/plugins
 └── @senmu/reporter

@senmu/core
 ├── @senmu/types
 └── @senmu/reporter

@senmu/plugins
 ├── @senmu/types
 └── @senmu/core

@senmu/reporter
 └── @senmu/types
```

## 5. 配置系统

SDK 提供丰富的配置选项，可以灵活调整监控行为：

- **全局配置**：通过入口包设置
- **包级配置**：可针对特定包设置特定选项
- **插件配置**：每个插件都有独立的配置项

## 6. 调用流程

典型的 SDK 使用流程：

```javascript
// 引入入口包
import moniter from '@senmu/web-moniter'

// 引入需要的插件
import jsErrorPlugin from '@senmu/plugins/js-error'
import networkPlugin from '@senmu/plugins/network'
import performancePlugin from '@senmu/plugins/performance'

// 配置SDK
moniter.init({
  project: 'yourProject',
  webVersion: '1.0.0',
  // 其他配置...
})

// 注册插件
moniter.use([
  [jsErrorPlugin, { /* 插件配置 */ }],
  [networkPlugin, { /* 插件配置 */ }],
  [performancePlugin, { /* 插件配置 */ }]
])

// 使用SDK提供的API
moniter.addError(new Error('自定义错误'), {
  category: 'custom',
  level: 'error'
})
```

## 7. 按需加载

Monorepo 架构的一个主要优势是支持按需加载，用户可以根据需求只引入必要的包：

```javascript
// 轻量级引入方式
import { createTracker } from '@senmu/core'
import jsErrorPlugin from '@senmu/plugins/js-error'
import { Reporter } from '@senmu/reporter'

const tracker = createTracker({
  project: 'yourProject',
  // 其他配置...
})

// 手动注册插件
tracker.use([
  [jsErrorPlugin, { /* 插件配置 */ }]
])

// 自定义上报
const reporter = new Reporter({
  url: 'your-api-endpoint'
})
tracker.setReporter(reporter)
```

## 8. 总结

web-moniter SDK 基于 Monorepo 架构设计，将核心功能、插件和上报模块拆分成独立的包，实现了高度的可扩展性和可配置性。这种设计使得 SDK 能够满足不同业务场景的前端监控需求，同时保持代码的可维护性和扩展性。通过按需引入所需的功能模块，用户可以构建既轻量又功能完善的监控系统.
