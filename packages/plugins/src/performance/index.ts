import { BasePlugin } from '../index';
import { MetricType as MonitorMetricType, PerformanceMetric } from '@senmu/types';
import { 
  onCLS, 
  onFID, 
  onLCP, 
  onFCP, 
  onTTFB,
  onINP,
  type MetricType
} from 'web-vitals';

interface PerformancePluginOptions {
  // 是否自动监控页面性能指标
  autoCollect?: boolean;
  // 上报时机: 'load' | 'beforeunload' | 'visibilitychange' | 'immediate'
  reportTime?: 'load' | 'beforeunload' | 'visibilitychange' | 'immediate';
  // 自定义上报延迟(ms)，当 reportTime 为 immediate 时有效
  reportDelay?: number;
}

// V4 版本指标类型定义 - 使用 web-vitals 提供的类型
interface Metric {
  name: 'CLS' | 'FCP' | 'FID' | 'INP' | 'LCP' | 'TTFB';
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  delta: number;
  id: string;
  entries: PerformanceEntry[];
  navigationType: 'navigate' | 'reload' | 'back-forward' | 'back-forward-cache' | 'prerender' | 'restore';
}

/**
 * 基于 web-vitals 的性能监控插件
 */
export class PerformancePlugin extends BasePlugin<PerformancePluginOptions> {
  name = 'performance';
  private metricsCollected: Record<string, number> = {};
  private eventHandlers: { type: string; handler: any }[] = [];
  private timeout: NodeJS.Timeout | null = null;

  protected init(): void {
    const options = this.options;
    
    // 默认启用自动收集
    if (options.autoCollect !== false) {
      this.setupWebVitals();
    }
    
    // 根据上报时机设置上报点
    this.setupReportTiming();
  }

  destroy(): void {
    // 移除事件监听
    for (const { type, handler } of this.eventHandlers) {
      window.removeEventListener(type, handler);
    }
    
    // 清除定时器
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
  }

  /**
   * 设置 web-vitals 监控
   */
  private setupWebVitals(): void {
    // 使用正确的指标类型，不再使用废弃的 ReportCallback
    const handleMetric = (metric: MetricType) => {
      this.handleMetric(metric);
    };
    
    // 收集核心 Web Vitals - V4 版本用法
    onCLS(handleMetric);
    onFID(handleMetric);
    onLCP(handleMetric);
    onFCP(handleMetric);
    onTTFB(handleMetric);
    onINP(handleMetric); // V4 新增的交互到绘制延迟指标
    
    // 收集额外的性能指标（如导航计时）
    this.collectNavigationTiming();
  }

  /**
   * 处理 web-vitals 指标
   */
  private handleMetric(metric: MetricType): void {
    // 将 web-vitals 的指标值存储到我们的指标集合中
    this.metricsCollected[metric.name] = metric.value;
  }

  /**
   * 收集导航计时API数据
   * 使用现代的Performance API代替废弃的timing接口
   */
  private collectNavigationTiming(): void {
    // 等待页面加载完成
    if (document.readyState !== 'complete') {
      const onLoad = () => {
        window.removeEventListener('load', onLoad);
        // 延迟一段时间确保性能条目已经完成收集
        setTimeout(() => this.processNavigationTiming(), 0);
      };
      window.addEventListener('load', onLoad);
      this.eventHandlers.push({ type: 'load', handler: onLoad });
    } else {
      this.processNavigationTiming();
    }
  }

  /**
   * 处理导航计时数据
   * 使用Navigation Timing API Level 2 (PerformanceNavigationTiming)
   */
  private processNavigationTiming(): void {
    if (!window.performance || !window.performance.getEntriesByType) {
      return;
    }
    
    // 获取导航计时条目
    const navEntries = window.performance.getEntriesByType('navigation');
    if (!navEntries || navEntries.length === 0) {
      return;
    }
    
    const navTiming = navEntries[0] as PerformanceNavigationTiming;
    
    // 关键性能指标
    this.metricsCollected = {
      ...this.metricsCollected,
      // DOM完成加载时间
      domReady: navTiming.domContentLoadedEventEnd,
      // 页面完全加载时间
      loadTime: navTiming.loadEventEnd,
      // DNS查询时间
      dnsTime: navTiming.domainLookupEnd - navTiming.domainLookupStart,
      // TCP连接时间
      tcpTime: navTiming.connectEnd - navTiming.connectStart,
      // 首字节时间
      ttfb: navTiming.responseStart - navTiming.requestStart,
      // 白屏时间
      blankTime: navTiming.domInteractive,
      // 请求响应时间
      responseTime: navTiming.responseEnd - navTiming.responseStart,
      // DOM解析时间
      domParse: navTiming.domComplete - navTiming.domInteractive,
      // 资源加载时间
      resourceTime: navTiming.loadEventEnd - navTiming.domContentLoadedEventEnd
    };
    
    // 收集其他类型的性能指标
    this.collectResourceTiming();
  }

  /**
   * 收集资源加载性能数据
   */
  private collectResourceTiming(): void {
    if (!window.performance || !window.performance.getEntriesByType) {
      return;
    }
    
    const resourceEntries = window.performance.getEntriesByType('resource');
    
    // 计算资源加载相关指标
    let totalResourceLoad = 0;
    let longestResource = 0;
    let resourceCount = resourceEntries.length;
    
    resourceEntries.forEach((entry: PerformanceResourceTiming) => {
      const duration = entry.responseEnd - entry.startTime;
      totalResourceLoad += duration;
      longestResource = Math.max(longestResource, duration);
    });
    
    // 添加资源指标
    this.metricsCollected = {
      ...this.metricsCollected,
      resourceCount,
      totalResourceLoad,
      longestResource,
      avgResourceLoad: resourceCount ? totalResourceLoad / resourceCount : 0
    };
  }

  /**
   * 设置上报时机
   */
  private setupReportTiming(): void {
    const options = this.options;
    const reportTime = options.reportTime || 'beforeunload';
    
    switch (reportTime) {
      case 'load':
        const onLoad = () => {
          window.removeEventListener('load', onLoad);
          this.reportPerformanceMetrics();
        };
        window.addEventListener('load', onLoad);
        this.eventHandlers.push({ type: 'load', handler: onLoad });
        break;
      
      case 'beforeunload':
        const onBeforeUnload = () => {
          this.reportPerformanceMetrics();
        };
        window.addEventListener('beforeunload', onBeforeUnload);
        this.eventHandlers.push({ type: 'beforeunload', handler: onBeforeUnload });
        break;
      
      case 'visibilitychange':
        const onVisibilityChange = () => {
          if (document.visibilityState === 'hidden') {
            this.reportPerformanceMetrics();
          }
        };
        document.addEventListener('visibilitychange', onVisibilityChange);
        this.eventHandlers.push({ type: 'visibilitychange', handler: onVisibilityChange });
        break;
      
      case 'immediate':
        // 延迟一段时间上报，确保大部分指标已收集
        const delay = options.reportDelay || 10000;
        this.timeout = setTimeout(() => {
          this.reportPerformanceMetrics();
        }, delay);
        break;
    }
  }

  /**
   * 上报性能指标
   */
  private reportPerformanceMetrics(): void {
    const performanceMetric: PerformanceMetric = {
      type: MonitorMetricType.PERFORMANCE,
      metrics: this.metricsCollected,
      timestamp: Date.now(),
      project: this.coreInstance.getConfig().project,
      pageUrl: window?.location?.href
    };
    
    this.coreInstance.send(performanceMetric);
  }

  /**
   * 手动上报性能指标
   * 可以由外部调用，添加自定义指标
   */
  reportPerformance(customMetrics?: Record<string, number>): void {
    if (customMetrics) {
      this.metricsCollected = {
        ...this.metricsCollected,
        ...customMetrics
      };
    }
    
    this.reportPerformanceMetrics();
  }
}
