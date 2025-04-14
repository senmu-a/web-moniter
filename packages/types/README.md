# @senmu/types

类型定义包 - Web监控SDK类型定义

## 安装

```bash
npm install @senmu/types
# 或
yarn add @senmu/types
# 或
pnpm add @senmu/types
```

## 基本使用

这个包提供了 Web 监控 SDK 系列包所使用的所有 TypeScript 类型定义。它被其他包引用，通常不需要单独安装。

```typescript
import { 
  MoniterConfig,        // 监控配置
  MetricData,           // 监控数据基础类型
  JSErrorMetric,        // JS错误数据
  APIMetric,            // 接口请求数据
  PerformanceMetric     // 性能指标数据
} from '@senmu/types';

// 使用类型
const config: MoniterConfig = {
  project: 'my-app',
  reportUrl: 'https://api.example.com/collect'
};
```

## 主要类型定义

### 核心接口
- `IWebMoniter` - Web监控SDK接口
- `ITracker` - 追踪器接口
- `Plugin` - 插件接口
- `Reporter` - 上报器接口

### 配置与数据类型
- `MoniterConfig` - 核心配置选项
- `MetricType` - 监控数据类型枚举
- `BaseMetric` - 基础监控数据接口
- `JSErrorMetric` - JS错误监控数据
- `APIMetric` - 接口请求监控数据
- `ResourceMetric` - 资源加载监控数据
- `PerformanceMetric` - 性能指标监控数据
- `PVMetric` - 页面访问监控数据
- `CustomMetric` - 自定义指标监控数据

## 许可证

ISC