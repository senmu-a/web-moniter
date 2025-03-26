# Web监控SDK架构文档

```
┌────────────────────────────────────────────────────────────────────┐
│                         mt-apm-web SDK                             │
│                                                                    │
│  ┌──────────────┐      ┌─────────────┐       ┌─────────────────┐  │
│  │              │      │             │       │                 │  │
│  │  Entry Point ├─────►│  Core       ├──────►│  Plugins        │  │
│  │  (mt.ts)     │      │  (Tracker)  │       │  (多种监控插件)  │  │
│  │              │      │             │       │                 │  │
│  └──────────────┘      └──────┬──────┘       └────────┬────────┘  │
│                               │                       │           │
│                               ▼                       ▼           │
│                     ┌─────────────────┐      ┌────────────────┐   │
│                     │                 │      │                │   │
│                     │  Context        │      │  Data          │   │
│                     │  (上下文管理)    │      │  Collection    │   │
│                     │                 │      │  (数据采集)     │   │
│                     └────────┬────────┘      └────────┬───────┘   │
│                              │                        │           │
│                              └──────────┬─────────────┘           │
│                                         │                         │
│                                         ▼                         │
│                              ┌──────────────────┐                 │
│                              │                  │                 │
│                              │  Reporter        │                 │
│                              │  (数据上报)       │                 │
│                              │                  │                 │
│                              └──────────────────┘                 │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

## 1. 架构概述

web-moniter是前端监控SDK，采用模块化、插件化的架构设计，旨在为Web应用提供全面的性能监控、错误监控和用户行为监控能力。SDK的核心是一个可扩展的框架，支持通过插件扩展各种监控功能。

## 2. 核心组件

### 2.1 Tracker (核心追踪器)

Tracker是整个SDK的核心，负责协调各个组件的工作：

- **功能职责**:
  - 插件管理: 注册、初始化和销毁插件
  - 配置管理: 存储和管理全局配置
  - 事件分发: 提供事件发布/订阅机制
  - 数据转发: 将收集的数据转发给Reporter进行上报

- **主要接口**:
  - `init(config)`: 初始化SDK
  - `use(pluginCtors)`: 注册用户插件
  - `addError(err, opts)`: 上报错误
  - `send(metricList, reportNow)`: 发送指标数据
  - `setConfig(newConfig)`: 设置配置
  - `destroy()`: 销毁SDK实例

- **实现原理**:
  - 基于发布/订阅模式实现组件间通信
  - 使用插件注册表管理所有已注册的插件
  - 提供公共API供插件和用户调用

### 2.2 Plugin (插件系统)

插件是SDK功能扩展的主要方式，每个插件负责特定的监控功能:

- **基础插件类(BasePlugin)**:
  - 所有插件的基类
  - 提供通用的方法如数据上报、采样处理等

- **系统内置插件**:
  - `PvPlugin`: 页面访问(PV)监控
    - **功能**: 记录用户访问页面的次数，包括 `SPA` 两种模式
  - `jsErrorPlugin`: JavaScript错误捕获
    - **功能**: 捕获并上报JavaScript错误信息
    - **事件**: `error`、`unhandledrejection`、`window.console.error`
  - `networkPlugin`: 网络请求监控
    - **功能**: 劫持 `ajax` 和 `fetch` 请求，记录请求的URL、状态码、响应时间等
  - `resourcePlugin`: 资源加载监控
  - `performancePlugin`: 性能指标监控
  - `MetricPlugin`: 业务指标监控

- **插件接口**:
  - `name`: 插件名称
  - `setUp()`: 初始化插件，设置监听器
  - `destroy()`: 销毁插件，清理资源
  - `apply()`: 挂载插件提供的方法到Tracker

- **插件工作流程**:
  1. 在SDK初始化时注册插件
  2. Tracker调用插件的setUp方法
  3. 插件开始监听事件并收集数据
  4. 插件调用Tracker提供的方法上报数据

### 2.3 Context (上下文管理)

Context负责维护监控数据的上下文信息:

- **主要职责**:
  - 维护全局标签(globalTags)
  - 提供页面和用户信息
  - 生成和管理上下文ID

- **核心属性**:
  - `project`: 项目名称
  - `webVersion`: 网页版本
  - `traceId`: 跟踪ID
  - `pageId`: 页面ID
  - `contextId`: 上下文ID
  - `ua`: 用户代理信息
  - `babelid`: 用户ID
  - `pageUrl`: 页面URL
  - `sdkVersion`: SDK版本

- **接口方法**:
  - `getInfo()`: 获取完整上下文信息
  - `setGlobalTags(tags)`: 设置全局标签
  - `getGlobalTags()`: 获取全局标签
  - `setUnionId(unionId)`: 设置用户ID

### 2.4 Reporter (数据上报)

Reporter负责将采集到的数据上报到后端服务:

- **主要职责**:
  - 格式化监控数据
  - 调用API将数据发送到服务器
  - 处理上报的成功与失败

- **实现细节**:
  - 支持批量上报和实时上报
  - 包含错误处理和重试机制

### 2.5 Entry (入口模块)

SDK的入口模块，负责初始化整个监控系统:

- **mt.ts**: 主入口文件
  - 创建Tracker实例
  - 注册内置插件
  - 初始化系统

- **初始化流程**:
  1. 创建Tracker实例
  2. 注册系统插件和用户插件
  3. 设置配置项
  4. 触发初始化事件
  5. 开始监控

## 3. 数据流向

整个SDK的数据流转过程如下:

1. **数据采集**:
   - 插件通过各种手段(如事件监听、API拦截)采集数据
   - 采集的原始数据经过插件初步处理

2. **数据聚合**:
   - 插件将处理后的数据传递给Tracker
   - Tracker对数据进行聚合和采样

3. **上下文关联**:
   - Tracker从Context获取上下文信息
   - 将上下文信息关联到监控数据中

4. **数据上报**:
   - Tracker将数据传递给Reporter
   - Reporter将数据格式化并上报到服务器

## 4. 插件化设计

SDK采用高度可扩展的插件化设计:

- **系统插件**: 由SDK内置，提供基础监控能力
- **用户插件**: 用户自定义，通过SDK的API注册

插件化设计的优势:

- 功能模块化，便于维护和扩展
- 按需加载，减小SDK体积
- 可定制性强，用户可根据需求调整监控内容

## 5. 配置系统

SDK提供丰富的配置选项，可以灵活调整监控行为:

- **全局配置**:
  - `project`: 项目名称
  - `devMode`: 是否为开发模式
  - `pageUrl`: 页面URL
  - `webVersion`: 网页版本
  - `delay`: 上报延迟
  - `trigger`: 触发阈值

- **插件配置**:
  - 每个插件都有独立的配置项
  - 可以单独禁用特定插件
  - 可调整采样率和其他参数

## 6. 技术特点

SDK的主要技术特点:

- **TypeScript开发**: 提供完整类型定义
- **模块化设计**: 核心功能解耦
- **可扩展架构**: 支持插件扩展
- **事件驱动**: 基于事件机制实现组件通信
- **可配置性**: 支持丰富的配置项
- **错误容错**: 插件错误不影响SDK整体运行

## 7. 调用流程

典型的SDK使用流程:

```javascript
// 初始化SDK
import moniter from '@senmu/web-moniter'

// 配置SDK
moniter.init({
  project: 'yourProject',
  webVersion: '1.0.0',
  // 其他配置...
})

// 注册自定义插件
moniter.use([
  [YourCustomPlugin, { option1: 'value1' }]
])

// 使用SDK提供的API
moniter.addError(new Error('自定义错误'), {
  category: 'custom',
  level: 'error'
})
```

## 8. 总结

web-moniter SDK采用模块化、插件化的架构设计，具有高度的可扩展性和可配置性。核心组件Tracker负责协调各个模块的工作，通过插件系统实现了丰富的监控功能，使用Context管理上下文信息，通过Reporter将数据上报到后端服务。这种设计使SDK能够满足不同业务场景的前端监控需求，同时保持代码的可维护性和扩展性。
