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

import { BasePlugin } from '../base';

// 定义性能指标类型
export type PerformanceMetricType = 'CLS' | 'FID' | 'LCP' | 'FCP' | 'TTFB' | 'INP';

// 定义性能指标配置类型
type MetricConfig = {
  [K in PerformanceMetricType]?: boolean;
};

interface PerformancePluginOptions {
  // 是否自动监控页面性能指标
  autoCollect?: boolean;
  // 上报时机: 'load' | 'beforeunload' | 'visibilitychange' | 'pagehide' | 'immediate'
  reportTime?: 'load' | 'beforeunload' | 'visibilitychange' | 'pagehide' | 'immediate';
  // 自定义上报延迟(ms)，当 reportTime 为 immediate 时有效
  reportDelay?: number;
  // 性能指标配置
  reportAllChanges?: boolean | MetricConfig;
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
    const handleMetric = (metric: MetricType) => {
      this.handleMetric(metric);
    };
    const { reportAllChanges = false } = this.options;

    // 处理 reportAllChanges 配置
    const getMetricConfig = (metric: PerformanceMetricType): boolean => {
      if (typeof reportAllChanges === 'boolean') {
        return reportAllChanges;
      }
      return reportAllChanges[metric] ?? false;
    };

    // 设置各个指标的监控
    onCLS(handleMetric, { reportAllChanges: getMetricConfig('CLS') }); 
    onFID(handleMetric, { reportAllChanges: getMetricConfig('FID') });
    onLCP(handleMetric, { reportAllChanges: getMetricConfig('LCP') });
    onFCP(handleMetric, { reportAllChanges: getMetricConfig('FCP') });
    onTTFB(handleMetric, { reportAllChanges: getMetricConfig('TTFB') });
    onINP(handleMetric, { reportAllChanges: getMetricConfig('INP') });
    
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
   * 使用pageshow事件而非load事件，以支持BFCache场景
   */
  private collectNavigationTiming(): void {
    // 处理函数
    const handlePageShow = (event: PageTransitionEvent) => {
      window.removeEventListener('pageshow', handlePageShow);
      // 延迟一段时间确保性能条目已经完成收集
      setTimeout(() => {
        this.processNavigationTiming();
        // 如果是从BFCache恢复，标记这个指标
        if (event.persisted) {
          this.metricsCollected['fromBFCache'] = 1;
        }
      }, 0);
    };
    
    // 如果页面已完成加载，立即处理
    if (document.readyState === 'complete') {
      this.processNavigationTiming();
    } else {
      // 使用pageshow事件替代load事件，可以捕获BFCache恢复的情况
      window.addEventListener('pageshow', handlePageShow);
      this.eventHandlers.push({ type: 'pageshow', handler: handlePageShow });
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
    // 默认使用 pagehide 而非 beforeunload，更好地支持 BFCache 场景
    const reportTime = options.reportTime || 'pagehide';
    
    switch (reportTime) {
      case 'load':
        // 使用 pageshow 代替 load，支持 BFCache 恢复场景
        const onPageShow = (event: PageTransitionEvent) => {
          // 从 BFCache 恢复时需要重新收集并上报指标
          if (event.persisted) {
            // 标记是从 BFCache 恢复
            this.metricsCollected['fromBFCache'] = 1;
            this.reportPerformanceMetrics();
          } else {
            // 正常加载时，移除事件监听并上报
            window.removeEventListener('pageshow', onPageShow);
            this.reportPerformanceMetrics();
          }
        };
        window.addEventListener('pageshow', onPageShow);
        this.eventHandlers.push({ type: 'pageshow', handler: onPageShow });
        break;
      
      case 'beforeunload':
        // 使用 pagehide 代替 beforeunload，更好地支持 BFCache
        this.setupPageHideReporting();
        break;
      
      case 'pagehide':
        // 添加新的选项，使用 pagehide 事件
        this.setupPageHideReporting();
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
   * 设置基于 pagehide 事件的上报
   * 这对 BFCache 场景更友好
   */
  private setupPageHideReporting(): void {
    const onPageHide = (event: PageTransitionEvent) => {
      // persisted=true 表示页面可能进入 BFCache
      this.reportPerformanceMetrics();
    };
    window.addEventListener('pagehide', onPageHide);
    this.eventHandlers.push({ type: 'pagehide', handler: onPageHide });
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
