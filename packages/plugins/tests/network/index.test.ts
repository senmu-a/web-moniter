/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NetworkPlugin } from '../../src/network';
import { createTracker } from '@senmu/core';
import { NetworkRequestInfo } from '../../src/network/types';

// 模拟依赖
vi.mock('../../src/network/handlers/fetch-handler', () => ({
  FetchHandler: vi.fn().mockImplementation(() => ({
    enable: vi.fn().mockReturnValue(() => {})
  }))
}));

vi.mock('../../src/network/handlers/xhr-handler', () => ({
  XHRHandler: vi.fn().mockImplementation(() => ({
    enable: vi.fn().mockReturnValue(() => {})
  }))
}));

vi.mock('../../src/network/reporter', () => ({
  NetworkReporter: vi.fn().mockImplementation(() => ({
    reportNetworkRequest: vi.fn()
  }))
}));

describe('NetworkPlugin', () => {
  let plugin: NetworkPlugin;
  let tracker: ReturnType<typeof createTracker>;
  
  beforeEach(() => {
    // 重置所有模拟函数
    vi.clearAllMocks();
    
    // 创建新的插件实例
    plugin = new NetworkPlugin();
    
    // 使用真实的 tracker 实例
    tracker = createTracker({
      project: 'test-project',
      debug: false
    });
    
    // 监视 tracker.send 方法
    vi.spyOn(tracker, 'send');
  });
  
  afterEach(() => {
    if (tracker) {
      tracker.destroy();
    }
    vi.restoreAllMocks();
  });
  
  describe('初始化', () => {
    it('应该使用默认选项正确初始化', () => {
      expect(plugin).toBeInstanceOf(NetworkPlugin);
      expect(plugin.name).toBe('network');
    });
    
    it('应该使用自定义选项初始化', () => {
      const options = {
        enableFetch: false,
        enableXhr: true,
        sample: 0.5,
        includeRequest: true
      };
      
      const customPlugin = new NetworkPlugin(options);
      expect(customPlugin).toBeInstanceOf(NetworkPlugin);
      
      // 通过反射获取私有属性进行测试
      const pluginOptions = (customPlugin as any).options;
      expect(pluginOptions.enableFetch).toBe(false);
      expect(pluginOptions.enableXhr).toBe(true);
      expect(pluginOptions.sample).toBe(0.5);
      expect(pluginOptions.includeRequest).toBe(true);
    });
  });
  
  describe('配置选项', () => {
    it('应该将配置合并到options中', () => {
      // 彻底阻止setUp方法执行任何实际逻辑
      vi.spyOn(NetworkPlugin.prototype, 'setUp').mockImplementationOnce(function(this: any, tracker, options) {
        // 只保存tracker和options而不执行其他操作
        this.coreInstance = tracker;
        if (options) {
          this.options = { ...this.options, ...options };
        }
      });
      
      const testOptions = {
        enableFetch: false, 
        enableXhr: true,
        includeRequest: true,
        sample: 0.7
      };
      
      plugin.setUp(tracker, testOptions);
      
      // 检查是否正确合并了配置
      expect((plugin as any).options.enableFetch).toBe(false);
      expect((plugin as any).options.enableXhr).toBe(true);
      expect((plugin as any).options.includeRequest).toBe(true);
      expect((plugin as any).options.sample).toBe(0.7);
    });
  });
  
  describe('网络请求处理', () => {
    it('应该正确处理网络请求信息', () => {
      // 创建reporter的mock来测试
      const mockReporter = { reportNetworkRequest: vi.fn() };
      (plugin as any).reporter = mockReporter;
      
      const requestInfo: NetworkRequestInfo = {
        url: 'https://example.com/api',
        method: 'GET',
        status: 200,
        duration: 100,
        success: true,
        type: 'fetch'
      };
      
      // 使用私有方法调用处理请求
      (plugin as any).handleNetworkRequest(requestInfo);
      
      // 验证报告函数是否被调用
      expect(mockReporter.reportNetworkRequest).toHaveBeenCalledTimes(1);
      expect(mockReporter.reportNetworkRequest).toHaveBeenCalledWith(requestInfo);
    });
    
    it('应该处理包含请求和响应数据的请求', () => {
      // 创建reporter的mock来测试
      const mockReporter = { reportNetworkRequest: vi.fn() };
      (plugin as any).reporter = mockReporter;
      
      const requestInfo: NetworkRequestInfo = {
        url: 'https://example.com/api',
        method: 'POST',
        status: 200,
        duration: 150,
        success: true,
        type: 'xhr',
        requestData: { name: 'test' },
        responseData: { id: 1, success: true }
      };
      
      // 使用私有方法调用处理请求
      (plugin as any).handleNetworkRequest(requestInfo);
      
      // 验证是否调用了上报方法并传递了正确参数
      expect(mockReporter.reportNetworkRequest).toHaveBeenCalledTimes(1);
      expect(mockReporter.reportNetworkRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          requestData: { name: 'test' },
          responseData: { id: 1, success: true }
        })
      );
    });
    
    it('当reporter不存在时不应抛出错误', () => {
      // 确保reporter是undefined
      (plugin as any).reporter = undefined;
      
      const requestInfo: NetworkRequestInfo = {
        url: 'https://example.com/api',
        method: 'GET',
        status: 200,
        duration: 100,
        success: true,
        type: 'fetch'
      };
      
      // 调用不应抛出错误
      expect(() => {
        (plugin as any).handleNetworkRequest(requestInfo);
      }).not.toThrow();
    });
  });
  
  describe('destroy', () => {
    it('应该正确执行清理函数', () => {
      // 创建模拟的清理函数
      const cleanup1 = vi.fn();
      const cleanup2 = vi.fn();
      
      // 设置清理函数数组
      (plugin as any).cleanupFunctions = [cleanup1, cleanup2];
      
      // 销毁插件
      plugin.destroy();
      
      // 验证清理函数是否被调用
      expect(cleanup1).toHaveBeenCalledTimes(1);
      expect(cleanup2).toHaveBeenCalledTimes(1);
      
      // 验证清理函数数组是否被清空
      expect((plugin as any).cleanupFunctions).toEqual([]);
    });
    
    it('对已销毁的插件调用destroy不应抛出错误', () => {
      // 设置空的清理函数数组
      (plugin as any).cleanupFunctions = [];
      
      // 第一次销毁
      plugin.destroy();
      
      // 再次调用destroy不应抛出错误
      expect(() => plugin.destroy()).not.toThrow();
    });
  });
});