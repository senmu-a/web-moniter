# @senmu/plugins

插件集合包 - Web监控SDK插件

## 安装

```bash
npm install @senmu/plugins
# 或
yarn add @senmu/plugins
# 或
pnpm add @senmu/plugins
```

## 基本使用

```javascript
import JSErrorPlugin from '@senmu/plugins/js-error'
import NetworkPlugin from '@senmu/plugins/network'
import PerformancePlugin from '@senmu/plugins/performance'
import { createTracker } from '@senmu/core';

// 创建监控实例
const tracker = createTracker({
  project: 'my-app'
});

// 使用插件
tracker.use([
  [JSErrorPlugin, { 
    enablePromiseError: true, 
    enableResourceError: true 
  }],
  [NetworkPlugin, { 
    ignoreUrls: ['/health']
  }],
  [PerformancePlugin]
]);
```

## 可用插件

- **JS错误监控插件 (JSErrorPlugin)**: 捕获 JavaScript 运行时错误、Promise 未处理异常和资源加载错误
- **网络请求监控插件 (NetworkPlugin)**: 监控 XHR 和 Fetch 请求，收集请求性能指标
- **性能监控插件 (PerformancePlugin)**: 收集网页性能指标，如 FP、FCP、LCP 等

## 配置选项

### JS错误监控插件

```javascript
{
  enablePromiseError: true,    // 是否捕获未处理的Promise错误
  enableResourceError: true,   // 是否捕获资源加载错误
  captureConsoleError: false,  // 是否捕获console.error
  errorSampleRate: 1.0         // 错误采样率
}
```

### 网络请求监控插件

```javascript
{
  ignoreUrls: ['/api/log'],    // 忽略的URL列表
  captureBody: false,          // 是否捕获请求体
  sampleRate: 1.0              // 采样率
}
```

## 许可证

ISC