/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Reporter, createReporter } from '../src/index';
import { MetricType, MetricData } from '@senmu/types';

// 模拟 fetch 函数
global.fetch = vi.fn().mockImplementation(() => 
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({})
  })
);

// 模拟 navigator.sendBeacon
try {
  Object.defineProperty(navigator, 'sendBeacon', {
    value: vi.fn().mockReturnValue(true),
    writable: true,
    configurable: true
  });
  console.log('已模拟 sendBeacon 函数');
} catch (error) {
  console.error('模拟 sendBeacon 失败:', error);
}

describe('Reporter', () => {
  let reporter: Reporter;
  
  beforeEach(() => {
    console.log('准备测试用例');
    vi.clearAllMocks();
    
    // 创建上报器实例
    reporter = createReporter({
      project: 'test-project',
      reportUrl: 'https://test.com/report'
    });
    console.log('创建测试 reporter 实例完成');
  });
  
  afterEach(() => {
    if (reporter) {
      reporter.destroy();
    }
  });
  
  describe('初始化', () => {
    it('应该正确初始化配置', () => {
      console.log('执行测试: 应该正确初始化配置');
      expect(reporter).toBeInstanceOf(Reporter);
    });
  });
  
  describe('配置管理', () => {
    it('应该能更新配置', () => {
      reporter.setConfig({
        reportUrl: 'https://new-url.com/report'
      });
      
      // 发送数据来测试配置是否生效
      const metric: MetricData = {
        type: MetricType.CUSTOM,
        name: 'test-metric',
        value: 100,
        timestamp: Date.now(),
        project: 'test-project',
        pageUrl: 'https://test.com'
      };
      
      reporter.send(metric, true);
      
      // 验证 fetch 调用时使用了新的 URL
      expect(fetch).toHaveBeenCalledWith(
        'https://new-url.com/report',
        expect.objectContaining({
          method: 'POST'
        })
      );
    });
  });
  
  describe('数据发送', () => {
    it('应该能立即发送数据 (fetch)', async () => {
      // 构造测试数据
      const metric: MetricData = {
        type: MetricType.CUSTOM,
        name: 'test-metric',
        value: 100,
        timestamp: Date.now(),
        project: 'test-project',
        pageUrl: 'https://test.com'
      };
      
      // 执行测试方法
      await reporter.send(metric, true);
      
      // 验证 fetch 被正确调用
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledWith(
        'https://test.com/report',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          })
        })
      );
      
      // 验证 sendBeacon 不被调用
      expect(navigator.sendBeacon).not.toHaveBeenCalled();
    });
    
    it('应该使用 sendBeacon 发送数据', async () => {
      const metric: MetricData = {
        type: MetricType.CUSTOM,
        name: 'test-metric',
        value: 200,
        timestamp: Date.now(),
        project: 'test-project',
        pageUrl: 'https://test.com'
      };
      
      // 使用默认设置（非立即发送）
      await reporter.send(metric);
      
      // 验证 sendBeacon 被调用
      expect(navigator.sendBeacon).toHaveBeenCalledTimes(1);
      expect(navigator.sendBeacon).toHaveBeenCalledWith(
        'https://test.com/report',
        expect.any(Object)  // Blob 在测试环境中可能不完全一样
      );
      
      // 验证 fetch 不被调用
      expect(fetch).not.toHaveBeenCalled();
    });
    
    it('当 sendBeacon 失败时应该回退到 fetch', async () => {
      // 设置 sendBeacon 返回失败
      vi.mocked(navigator.sendBeacon).mockReturnValueOnce(false);
      
      const metric: MetricData = {
        type: MetricType.CUSTOM,
        name: 'test-metric',
        value: 300,
        timestamp: Date.now(),
        project: 'test-project',
        pageUrl: 'https://test.com'
      };
      
      await reporter.send(metric);
      
      // 验证 sendBeacon 被调用
      expect(navigator.sendBeacon).toHaveBeenCalledTimes(1);
      
      // 验证回退到 fetch
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });
  
  describe('错误处理', () => {
    it('应该处理 fetch 错误', async () => {
      // 模拟 fetch 失败
      vi.mocked(fetch).mockRejectedValueOnce(new Error('网络错误'));
      
      const consoleSpy = vi.spyOn(console, 'error');
      
      const metric: MetricData = {
        type: MetricType.CUSTOM,
        name: 'test-metric',
        value: 400,
        timestamp: Date.now(),
        project: 'test-project',
        pageUrl: 'https://test.com'
      };
      
      // 捕获抛出的错误
      await expect(reporter.send(metric, true)).rejects.toThrow();
      
      // 验证 fetch 被调用
      expect(fetch).toHaveBeenCalledTimes(1);
      
      // 验证错误被记录
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[web-moniter] 上报数据失败'),
        expect.any(Error)
      );
    });
    
    it('应该处理未配置上报 URL 的情况', async () => {
      // 创建没有 reportUrl 的上报器
      const noUrlReporter = createReporter({
        project: 'test-project'
      });
      
      const consoleSpy = vi.spyOn(console, 'error');
      
      const metric: MetricData = {
        type: MetricType.CUSTOM,
        name: 'test-metric',
        value: 500,
        timestamp: Date.now(),
        project: 'test-project',
        pageUrl: 'https://test.com'
      };
      
      await noUrlReporter.send(metric, true);
      
      // 验证错误被记录
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[web-moniter] 未配置上报URL')
      );
      
      // 验证 fetch 不被调用
      expect(fetch).not.toHaveBeenCalled();
    });
  });
  
  describe('销毁功能', () => {
    it('应该正确标记为已销毁', async () => {
      reporter.destroy();
      
      // 发送数据尝试
      const consoleSpy = vi.spyOn(console, 'warn');
      
      await reporter.send({
        type: MetricType.CUSTOM,
        name: 'test-metric',
        value: 600,
        timestamp: Date.now(),
        project: 'test-project',
        pageUrl: 'https://test.com'
      });
      
      // 验证没有发送数据
      expect(fetch).not.toHaveBeenCalled();
      expect(navigator.sendBeacon).not.toHaveBeenCalled();
      
      // 验证警告被记录
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[web-moniter] 上报器已销毁')
      );
    });
  });
});