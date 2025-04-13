/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MetricType, MetricData } from '@senmu/types';

// 创建模拟的 tracker 和 reporter
const mockTracker = {
  use: vi.fn().mockReturnThis(),
  setReporter: vi.fn().mockReturnThis(),
  setConfig: vi.fn().mockReturnThis(),
  getConfig: vi.fn().mockReturnValue({ project: 'test-project' }),
  addError: vi.fn(),
  send: vi.fn(),
  flush: vi.fn(),
  destroy: vi.fn()
};

const mockReporter = {
  send: vi.fn().mockResolvedValue(undefined),
  setConfig: vi.fn(),
  destroy: vi.fn()
};

// 模拟依赖模块
vi.mock('@senmu/core', () => ({
  createTracker: vi.fn(() => mockTracker),
  Tracker: class MockTracker {}
}));

vi.mock('@senmu/reporter', () => ({
  createReporter: vi.fn(() => mockReporter)
}));

// 导入被测模块（在模拟之后导入）
import { createTracker } from '@senmu/core';
import { createReporter } from '@senmu/reporter';

// 导入默认导出的 moniter 实例
import moniter from '../src/index';

describe('WebMoniter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // 确保每次测试前实例是未初始化的
    if ((moniter as any).initialized) {
      moniter.destroy();
    }
  });
  
  afterEach(() => {
    moniter.destroy();
  });
  
  describe('初始化', () => {
    it('应该正确初始化实例', () => {
      expect(() => {
        moniter.init({
          project: 'test-project',
          debug: false
        });
      }).not.toThrow();
      
      // 验证 createTracker 被调用
      expect(createTracker).toHaveBeenCalledWith(
        expect.objectContaining({
          project: 'test-project'
        })
      );
      
      // 验证 createReporter 被调用
      expect(createReporter).toHaveBeenCalled();
    });
    
    it('初始化时应该检查必要的配置项', () => {
      expect(() => {
        // @ts-ignore 故意忽略类型检查以测试错误情况
        moniter.init({});
      }).toThrow('[web-moniter] 必须提供项目标识(project)');
    });
    
    it('不应该重复初始化', () => {
      // 第一次初始化
      moniter.init({
        project: 'test-project'
      });
      
      // 监听 console.warn
      const consoleSpy = vi.spyOn(console, 'warn');
      
      // 第二次初始化
      moniter.init({
        project: 'another-project'
      });
      
      // 验证警告被记录
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[web-moniter] SDK已经初始化')
      );
    });
  });
  
  describe('插件管理', () => {
    beforeEach(() => {
      moniter.init({
        project: 'test-project'
      });
    });
    
    it('应该能注册插件', () => {
      const mockPlugin = class MockPlugin {
        name = 'mock';
        setUp = vi.fn();
        destroy = vi.fn();
      };
      
      moniter.use([[mockPlugin, { option: true }]]);
      
      // 验证 tracker.use 被调用
      expect(mockTracker.use).toHaveBeenCalledWith([[mockPlugin, { option: true }]]);
    });
    
    it('未初始化时不应注册插件', () => {
      // 重置实例
      moniter.destroy();
      
      const mockPlugin = class MockPlugin {};
      
      // 验证未初始化时抛出错误
      expect(() => {
        moniter.use([[mockPlugin, {}]]);
      }).toThrow('[web-moniter] 必须先调用init初始化SDK');
    });
  });
  
  describe('错误处理', () => {
    beforeEach(() => {
      moniter.init({
        project: 'test-project'
      });
    });
    
    it('应该能添加错误', () => {
      const error = new Error('测试错误');
      const options = {
        category: 'test',
        level: 'error'
      };
      
      moniter.addError(error, options);
      
      // 验证 tracker.addError 被调用
      expect(mockTracker.addError).toHaveBeenCalledWith(error, options);
    });
    
    it('未初始化时不应添加错误', () => {
      // 重置实例
      moniter.destroy();
      
      // 监听 console.error
      const consoleSpy = vi.spyOn(console, 'error');
      
      moniter.addError(new Error('测试错误'));
      
      // 验证错误被记录
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[web-moniter] 必须先调用init初始化SDK')
      );
    });
  });
  
  describe('配置管理', () => {
    beforeEach(() => {
      moniter.init({
        project: 'test-project'
      });
    });
    
    it('应该能更新配置', () => {
      const newConfig = {
        debug: true,
        reportUrl: 'https://new-url.com'
      };
      
      moniter.setConfig(newConfig);
      
      // 验证 tracker.setConfig 被调用
      expect(mockTracker.setConfig).toHaveBeenCalledWith(newConfig);
    });
    
    it('未初始化时不应更新配置', () => {
      // 重置实例
      moniter.destroy();
      
      // 监听 console.error
      const consoleSpy = vi.spyOn(console, 'error');
      
      moniter.setConfig({ debug: true });
      
      // 验证错误被记录
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[web-moniter] 必须先调用init初始化SDK')
      );
    });
  });
  
  describe('数据发送', () => {
    beforeEach(() => {
      moniter.init({
        project: 'test-project'
      });
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
      
      moniter.send(metric);
      
      // 验证 tracker.send 被调用
      expect(mockTracker.send).toHaveBeenCalledWith(metric, false); // 修改为期望 false 而不是 undefined
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
      
      moniter.send(metric, true);
      
      // 验证 tracker.send 被调用，并且 reportNow = true
      expect(mockTracker.send).toHaveBeenCalledWith(metric, true);
    });
    
    it('未初始化时不应发送数据', () => {
      // 重置实例
      moniter.destroy();
      
      // 监听 console.error
      const consoleSpy = vi.spyOn(console, 'error');
      
      moniter.send({
        type: MetricType.CUSTOM,
        name: 'test-metric',
        value: 100,
        timestamp: Date.now(),
        project: 'test-project',
        pageUrl: 'https://test.com'
      });
      
      // 验证错误被记录
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[web-moniter] 必须先调用init初始化SDK')
      );
    });
  });
  
  describe('立即上报', () => {
    beforeEach(() => {
      moniter.init({
        project: 'test-project'
      });
    });
    
    it('应该能立即上报所有缓存的数据', () => {
      moniter.flush();
      
      // 验证 tracker.flush 被调用
      expect(mockTracker.flush).toHaveBeenCalled();
    });
    
    it('未初始化时不应上报数据', () => {
      // 重置实例
      moniter.destroy();
      
      // 监听 console.error
      const consoleSpy = vi.spyOn(console, 'error');
      
      moniter.flush();
      
      // 验证错误被记录
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[web-moniter] 必须先调用init初始化SDK')
      );
    });
  });
  
  describe('销毁', () => {
    it('应该能正确销毁实例', () => {
      moniter.init({
        project: 'test-project'
      });
      
      moniter.destroy();
      
      // 验证 tracker.destroy 被调用
      expect(mockTracker.destroy).toHaveBeenCalled();
      
      // 验证实例被标记为未初始化
      expect((moniter as any).initialized).toBe(false);
    });
    
    it('未初始化时销毁不应抛出错误', () => {
      expect(() => {
        moniter.destroy();
      }).not.toThrow();
    });
  });
});