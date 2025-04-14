# @senmu/reporter

数据上报包 - Web监控SDK数据上报模块

## 安装

```bash
npm install @senmu/reporter
# 或
yarn add @senmu/reporter
# 或
pnpm add @senmu/reporter
```

## 基本使用

```javascript
import { createReporter } from '@senmu/reporter';

const reporter = createReporter({
  reportUrl: 'https://your-api-endpoint.com/collect',
  debug: false,
  reportImmediately: false
});

// 使用reporter上报数据
reporter.send({
  type: 'error',
  message: '发生了一个错误',
  // 其他数据
}, true); // 第二个参数为true表示立即上报
```

## 主要功能

- 提供数据上报的核心能力
- 支持多种上报方式（优先使用Beacon API，降级到Fetch、XHR或Image）
- 提供立即上报和延迟上报两种模式
- 自动处理上报失败场景，提供多种备选上报方式

## 配置选项

```javascript
{
  reportUrl: 'https://your-api-endpoint.com/collect', // 上报URL (必填)
  reportImmediately: false,   // 是否立即上报数据，默认false
  maxCache: 50,               // 最大缓存数量
  debug: false,               // 调试模式，输出日志
  headers: {}                 // 自定义请求头
}
```

## 许可证

ISC