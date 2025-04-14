# @senmu/core

核心追踪器 - Web监控SDK核心功能

## 安装

```bash
npm install @senmu/core
# 或
yarn add @senmu/core
# 或
pnpm add @senmu/core
```

## 基本使用

```javascript
import { createTracker } from '@senmu/core';
import { createReporter } from '@senmu/reporter';

// 创建追踪器
const tracker = createTracker({
  project: 'my-app',
  debug: true,
  sampleRate: 1.0
});

// 设置上报器
const reporter = createReporter({ reportUrl: 'https://api.example.com/collect' });
tracker.setReporter(reporter);

// 使用插件
tracker.use([
  [SomePlugin, { option1: 'value1' }],
  [AnotherPlugin]
]);

// 上报数据
tracker.send({
  name: 'custom_metric',
  value: 100
}, true);

// 销毁追踪器
// tracker.destroy();
```

## 主要功能

- 提供 Web 监控的核心功能实现
- 处理各类监控事件的收集与分发
- 支持丰富的插件系统
- 管理监控数据的采集与缓存

## 许可证

ISC