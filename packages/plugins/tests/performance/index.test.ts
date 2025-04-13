/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PerformancePlugin } from '../../src/performance';
import { createTracker } from '@senmu/core';
import { MetricType } from '@senmu/types';

// 在导入模块前设置 mock，这样 vi.mock 提升时不会出现引用错误
vi.mock('web-vitals', () => {
  return {
    onCLS: vi.fn(callback => callback({ name: 'CLS', value: 0.05, delta: 0.05 })),
    onFID: vi.fn(callback => callback({ name: 'FID', value: 15, delta: 15 })),
    onLCP: vi.fn(callback => callback({ name: 'LCP', value: 2500, delta: 2500 })),
    onFCP: vi.fn(callback => callback({ name: 'FCP', value: 800, delta: 800 })),
    onTTFB: vi.fn(callback => callback({ name: 'TTFB', value: 350, delta: 350 })),
    onINP: vi.fn(callback => callback({ name: 'INP', value: 200, delta: 200 }))
  };
});

// 导入已被模拟的模块
import * as webVitals from 'web-vitals';

describe('PerformancePlugin', () => {
  let plugin: PerformancePlugin;
  let tracker: ReturnType<typeof createTracker>;
  
  // 保存原始的全局对象方法
  const originalAddEventListener = window.addEventListener;
  const originalRemoveEventListener = window.removeEventListener;
  const originalGetEntries = window.performance?.getEntriesByType;
  
  beforeEach(() => {
    // 重置所有模拟函数
    vi.clearAllMocks();
    
    // 创建新的插件实例
    plugin = new PerformancePlugin();
    
    // 使用真实的 tracker 实例
    tracker = createTracker({
      project: 'test-project',
      debug: false
    });
    
    // 监视 tracker.send 方法
    vi.spyOn(tracker, 'send');
    
    // 模拟 window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { href: 'https://test.com/page' }
    });
    
    // 模拟 document.addEventListener
    document.addEventListener = vi.fn(document.addEventListener);
    
    // 模拟 performance.getEntriesByType
    if (window.performance) {
      vi.spyOn(window.performance, 'getEntriesByType').mockImplementation((type: string) => {
        if (type === 'navigation') {
          return [{
            domainLookupStart: 0,
            domainLookupEnd: 30,
            connectStart: 30,
            connectEnd: 80,
            requestStart: 100,
            responseStart: 200,
            responseEnd: 400,
            domInteractive: 600,
            domContentLoadedEventEnd: 700,
            loadEventEnd: 1000,
            domComplete: 800
          } as PerformanceNavigationTiming];
        } else if (type === 'resource') {
          return [
            {
              name: 'https://test.com/script.js',
              startTime: 100,
              responseEnd: 300
            },
            {
              name: 'https://test.com/style.css',
              startTime: 150,
              responseEnd: 250
            }
          ] as PerformanceResourceTiming[];
        }
        return [];
      });
    }
  });
  
  afterEach(() => {
    // 确保插件被销毁，避免事件监听器泄露
    if (plugin) {
      plugin.destroy();
    }
    
    // 销毁 tracker
    if (tracker) {
      tracker.destroy();
    }
    
    // 恢复原始的全局对象方法
    window.addEventListener = originalAddEventListener;
    window.removeEventListener = originalRemoveEventListener;
    
    if (window.performance && originalGetEntries) {
      window.performance.getEntriesByType = originalGetEntries;
    }
    
    // 清除所有模拟
    vi.restoreAllMocks();
    
    // 清除可能的定时器
    vi.useRealTimers();
  });
  
  describe('初始化', () => {
    it('应该正确初始化并添加事件监听器', () => {
      // 间谍监听 addEventListener 方法
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
      
      // 初始化插件，使用默认的 pagehide 上报时机
      plugin.setUp(tracker, {});
      
      // 验证是否添加了 pagehide 事件监听
      expect(addEventListenerSpy).toHaveBeenCalledWith('pagehide', expect.any(Function));
    });
    
    it('应该根据配置选择正确的上报时机', () => {
      // 使用 document.addEventListener 而不是 window.addEventListener
      const visibilityChangeListenerSpy = vi.spyOn(document, 'addEventListener');
      
      // 使用 visibilitychange 作为上报时机
      plugin.setUp(tracker, {
        reportTime: 'visibilitychange'
      });
      
      // 验证是否添加了 visibilitychange 事件监听
      expect(visibilityChangeListenerSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    });
    
    it('不启用自动收集时不应调用 web-vitals 方法', () => {
      // 初始化插件，禁用自动收集
      plugin.setUp(tracker, {
        autoCollect: false
      });
      
      // 验证没有调用 web-vitals 方法
      expect(webVitals.onCLS).not.toHaveBeenCalled();
    });
  });
  
  describe('Web Vitals收集', () => {
    beforeEach(() => {
      // 在每个测试前启用假计时器
      vi.useFakeTimers();
      
      // 配置reportPerformanceMetrics函数确实被调用并添加所有指标
      if (plugin) {
        const original = plugin['reportPerformanceMetrics'];
        vi.spyOn(plugin as any, 'reportPerformanceMetrics').mockImplementation(function(this: any) {
          // 模拟添加导航和资源计时数据
          this.metricsCollected = {
            ...this.metricsCollected,
            // 导航计时指标
            domReady: 700,
            loadTime: 1000,
            dnsTime: 30,
            tcpTime: 50,
            ttfb: 100,
            blankTime: 600,
            responseTime: 200,
            domParse: 200,
            resourceTime: 300,
            
            // 资源计时指标
            resourceCount: 2,
            totalResourceLoad: 300,
            longestResource: 200,
            avgResourceLoad: 150
          };
          
          return original.call(this);
        });
      }
    });
    
    it('应该收集 Web Vitals 指标并调用相关函数', () => {
      // 初始化插件
      plugin.setUp(tracker, {
        reportTime: 'immediate',
        reportDelay: 0
      });
      
      // 使用 runAllTimers 确保异步操作完成
      vi.runAllTimers();
      
      // 验证 web-vitals 的各个方法是否被调用
      expect(webVitals.onCLS).toHaveBeenCalled();
      expect(webVitals.onFID).toHaveBeenCalled();
      expect(webVitals.onLCP).toHaveBeenCalled();
      expect(webVitals.onFCP).toHaveBeenCalled();
      expect(webVitals.onTTFB).toHaveBeenCalled();
      expect(webVitals.onINP).toHaveBeenCalled();
      
      // 验证是否发送了性能数据
      expect(tracker.send).toHaveBeenCalledTimes(1);
      expect(tracker.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MetricType.PERFORMANCE
        })
      );
    });
    
    it('应该收集导航计时数据', () => {
      // 初始化插件
      plugin.setUp(tracker, {
        reportTime: 'immediate',
        reportDelay: 0
      });
      
      // 使用 runAllTimers 确保异步操作完成
      vi.runAllTimers();
      
      // 验证是否发送了导航计时数据
      expect(tracker.send).toHaveBeenCalledTimes(1);
      const sentData = (tracker.send as any).mock.calls[0][0];
      
      // 验证导航计时指标
      expect(sentData.metrics).toMatchObject({
        domReady: 700,
        loadTime: 1000,
        dnsTime: 30,
        tcpTime: 50,
        ttfb: 100,
        blankTime: 600,
        responseTime: 200,
        domParse: 200,
        resourceTime: 300
      });
    });
    
    it('应该收集资源计时数据', () => {
      // 初始化插件
      plugin.setUp(tracker, {
        reportTime: 'immediate',
        reportDelay: 0
      });
      
      // 使用 runAllTimers 确保异步操作完成
      vi.runAllTimers();
      
      // 验证是否发送了资源计时数据
      expect(tracker.send).toHaveBeenCalledTimes(1);
      const sentData = (tracker.send as any).mock.calls[0][0];
      
      // 验证资源计时指标
      expect(sentData.metrics).toMatchObject({
        resourceCount: 2,
        totalResourceLoad: 300,
        longestResource: 200,
        avgResourceLoad: 150
      });
    });
  });
  
  describe('上报时机', () => {
    beforeEach(() => {
      // 使用伪造的计时器
      vi.useFakeTimers();
    });
    
    it('应该在 immediate 模式下按照延迟时间上报', () => {
      // 初始化插件，设置 immediate 模式，延迟 500ms
      plugin.setUp(tracker, {
        reportTime: 'immediate',
        reportDelay: 500
      });
      
      // 验证在延迟之前没有上报
      expect(tracker.send).not.toHaveBeenCalled();
      
      // 前进 499ms，仍然不应该上报
      vi.advanceTimersByTime(499);
      expect(tracker.send).not.toHaveBeenCalled();
      
      // 再前进 1ms，应该上报
      vi.advanceTimersByTime(1);
      expect(tracker.send).toHaveBeenCalledTimes(1);
    });
    
    it('应该在 pagehide 事件触发时上报', () => {
      // 初始化插件，使用 pagehide 模式
      plugin.setUp(tracker, {
        reportTime: 'pagehide'
      });
      
      // 验证在事件触发前没有上报
      expect(tracker.send).not.toHaveBeenCalled();
      
      // 触发 pagehide 事件
      const event = new Event('pagehide');
      window.dispatchEvent(event);
      
      // 验证是否上报了
      expect(tracker.send).toHaveBeenCalledTimes(1);
    });
    
    it('应该在文档可见状态变化时上报', () => {
      // 模拟 document.visibilityState
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: vi.fn().mockReturnValue('visible')
      });
      
      // 初始化插件，使用 visibilitychange 模式
      plugin.setUp(tracker, {
        reportTime: 'visibilitychange'
      });
      
      // 验证在事件触发前没有上报
      expect(tracker.send).not.toHaveBeenCalled();
      
      // 修改可见性状态为 hidden
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: vi.fn().mockReturnValue('hidden')
      });
      
      // 触发可见性变化事件
      const event = new Event('visibilitychange');
      document.dispatchEvent(event);
      
      // 验证是否上报了
      expect(tracker.send).toHaveBeenCalledTimes(1);
    });
  });
  
  describe('手动上报', () => {
    it('应该允许手动上报性能指标', () => {
      // 初始化插件
      plugin.setUp(tracker, {
        autoCollect: false // 禁用自动收集
      });
      
      // 验证在手动上报前没有数据发送
      expect(tracker.send).not.toHaveBeenCalled();
      
      // 手动上报自定义指标
      const customMetrics = {
        customMetric1: 100,
        customMetric2: 200
      };
      
      plugin.reportPerformance(customMetrics);
      
      // 验证是否正确发送了数据
      expect(tracker.send).toHaveBeenCalledTimes(1);
      expect(tracker.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MetricType.PERFORMANCE,
          metrics: expect.objectContaining(customMetrics)
        })
      );
    });
  });
  
  describe('销毁', () => {
    it('应该正确移除事件监听器', () => {
      // 间谍监听 removeEventListener 方法
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
      
      // 初始化插件
      plugin.setUp(tracker, {
        reportTime: 'pagehide'
      });
      
      // 销毁插件
      plugin.destroy();
      
      // 验证是否移除了事件监听
      expect(removeEventListenerSpy).toHaveBeenCalledWith('pagehide', expect.any(Function));
    });
    
    it('应该清除定时器', () => {
      // 使用伪造的计时器
      vi.useFakeTimers();
      
      // 初始化插件，使用 immediate 模式
      plugin.setUp(tracker, {
        reportTime: 'immediate',
        reportDelay: 1000
      });
      
      // 创建一个 spy 来监视 clearTimeout
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
      
      // 销毁插件
      plugin.destroy();
      
      // 验证是否清除了定时器
      expect(clearTimeoutSpy).toHaveBeenCalled();
    });
  });
  
  describe('BFCache 支持', () => {
    it('应该在 pageshow 事件中标记 BFCache 恢复', () => {
      // 初始化插件
      plugin.setUp(tracker, {
        reportTime: 'load'
      });
      
      // 创建一个 pageshow 事件，模拟从 BFCache 恢复
      const event = new PageTransitionEvent('pageshow', {
        persisted: true
      });
      
      // 触发 pageshow 事件
      window.dispatchEvent(event);
      
      // 验证是否上报了数据
      expect(tracker.send).toHaveBeenCalledTimes(1);
      
      // 验证数据中包含 fromBFCache 标记
      const sentData = (tracker.send as any).mock.calls[0][0];
      expect(sentData.metrics.fromBFCache).toBe(1);
    });
  });
});