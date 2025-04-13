/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Tracker, createTracker } from '../src/index';
import { MetricType, MetricData } from '@senmu/types';

// 模拟上报器
const mockReporter = {
  send: vi.fn().mockResolvedValue(undefined),
  setConfig: vi.fn(),
  destroy: vi.fn()
};

// 模拟插件类
class MockPlugin {
  name = 'mock-plugin';
  setUp = vi.fn();
  destroy = vi.fn();
}

describe('Tracker', () => {
  let tracker: ReturnType<typeof createTracker>;
  
  beforeEach(() => {
    vi.clearAllMocks();
    
    // 创建追踪器实例
    tracker = createTracker({
      project: 'test-project',
      debug: false
    });
  });
  
  afterEach(() => {
    if (tracker) {
      tracker.destroy();
    }
    vi.restoreAllMocks();
  });
  
  describe('初始化', () => {
    it('应该正确初始化配置', () => {
      expect(tracker).toBeInstanceOf(Tracker);
      expect(tracker.getConfig().project).toBe('test-project');
    });
    
    it('初始化时应该使用默认配置', () => {
      // 只设置必要的 project 配置
      const t = createTracker({ project: 'test-project' });
      const config = t.getConfig();
      
      // 检查是否有默认配置
      expect(config.sampleRate).toBeDefined();
      expect(config.debug).toBe(false);
    });
  });
  
  describe('插件管理', () => {
    it('应该能注册和使用插件', () => {
      // 创建一个带有间谍方法的插件实例
      const mockInstance = new MockPlugin();
      // 使用 jest.spyOn 替代直接操作原型
      const mockConstructor = vi.fn(() => mockInstance);
      
      const options = { testOption: true };
      
      // 使用自定义的构造函数
      tracker.use([[mockConstructor, options]]);
      
      // 验证插件的 setUp 方法被调用，并传递了正确的参数
      expect(mockInstance.setUp).toHaveBeenCalledWith(expect.any(Object), options);
    });
    
    it('应该在销毁时调用所有插件的销毁方法', () => {
      // 创建一个带有间谍方法的插件实例
      const mockInstance = new MockPlugin();
      const mockConstructor = vi.fn(() => mockInstance);
      
      // 注册插件
      tracker.use([[mockConstructor, {}]]);
      
      // 销毁追踪器
      tracker.destroy();
      
      // 验证插件的 destroy 方法被调用
      expect(mockInstance.destroy).toHaveBeenCalled();
    });
  });
  
  describe('上报管理', () => {
    beforeEach(() => {
      // 设置模拟上报器
      tracker.setReporter(mockReporter);
    });
    
    it('应该能设置并使用上报器', () => {
      // 设置上报 URL 来触发 setConfig
      tracker.setConfig({ reportUrl: 'https://test.com/report' });
      
      // 验证设置上报器
      expect(mockReporter.setConfig).toHaveBeenCalled();
    });
    
    it('应该能发送指标数据', () => {
      const metric: MetricData = {
        type: MetricType.CUSTOM,
        name: 'test-metric',
        value: 100,
        timestamp: Date.now(),
        project: 'test-project',
        pageUrl: 'https://test.com'
      };
      
      tracker.send(metric);
      
      // 因为默认不是立即上报，所以这里不会立即调用 send
      expect(mockReporter.send).not.toHaveBeenCalled();
      
      // 使用 flush 强制上报
      tracker.flush();
      
      // 验证 send 方法被调用
      expect(mockReporter.send).toHaveBeenCalledTimes(1);
      expect(mockReporter.send).toHaveBeenCalledWith(
        [expect.objectContaining({
          type: MetricType.CUSTOM,
          name: 'test-metric',
          value: 100
        })],
        true
      );
    });
    
    it('应该能立即发送指标数据', () => {
      const metric: MetricData = {
        type: MetricType.CUSTOM,
        name: 'test-metric',
        value: 100,
        timestamp: Date.now(),
        project: 'test-project',
        pageUrl: 'https://test.com'
      };
      
      tracker.send(metric, true); // reportNow = true
      
      // 验证 send 方法被立即调用
      expect(mockReporter.send).toHaveBeenCalledTimes(1);
    });
  });
  
  describe('错误处理', () => {
    it('应该能处理错误', () => {
      // 间谍监听 console.error
      const consoleErrorSpy = vi.spyOn(console, 'error');
      
      const error = new Error('测试错误');
      tracker.addError(error, {
        category: 'test',
        level: 'error'
      });
      
      // 验证 console.error 被调用
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });
  
  describe('配置管理', () => {
    it('应该能更新配置', () => {
      // 设置上报器
      tracker.setReporter(mockReporter);
      
      // 更新配置
      tracker.setConfig({
        reportUrl: 'https://new-report-url.com',
        debug: true
      });
      
      // 验证配置是否更新
      const config = tracker.getConfig();
      expect(config.debug).toBe(true);
      expect(config.reportUrl).toBe('https://new-report-url.com');
      
      // 验证上报器的配置也被更新
      expect(mockReporter.setConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          reportUrl: 'https://new-report-url.com'
        })
      );
    });
  });
  
  describe('采样功能', () => {
    it('应该根据采样率发送数据', () => {
      // 设置上报器
      tracker.setReporter(mockReporter);
      
      // 设置 Math.random 返回值大于采样率
      const mathRandomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.8);
      
      // 设置低采样率
      tracker.setConfig({
        sampleRate: 0.5
      });
      
      const metric: MetricData = {
        type: MetricType.CUSTOM,
        name: 'test-metric',
        value: 100,
        timestamp: Date.now(),
        project: 'test-project',
        pageUrl: 'https://test.com'
      };
      
      tracker.send(metric, true);
      
      // 验证由于采样率的原因没有发送数据
      expect(mockReporter.send).not.toHaveBeenCalled();
      
      // 改变 Math.random 返回值小于采样率
      mathRandomSpy.mockReturnValue(0.3);
      
      tracker.send(metric, true);
      
      // 验证数据被发送
      expect(mockReporter.send).toHaveBeenCalledTimes(1);
      
      // 恢复 Math.random
      mathRandomSpy.mockRestore();
    });
  });
  
  describe('会话管理', () => {
    it('应该为每个指标添加会话ID', () => {
      // 设置上报器
      tracker.setReporter(mockReporter);
      
      const metric: MetricData = {
        type: MetricType.CUSTOM,
        name: 'test-metric',
        value: 100,
        timestamp: Date.now(),
        project: 'test-project',
        pageUrl: 'https://test.com'
      };
      
      tracker.send(metric, true);
      
      // 验证发送的数据中包含会话ID
      expect(mockReporter.send).toHaveBeenCalledWith(
        [expect.objectContaining({
          sessionId: expect.any(String)
        })],
        true
      );
    });
  });
});