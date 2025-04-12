/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JSErrorPlugin } from '../../src/js-error';
import { createTracker } from '@senmu/core';
import { MetricType } from '@senmu/types';

describe('JSErrorPlugin', () => {
  let plugin: JSErrorPlugin;
  let tracker: ReturnType<typeof createTracker>;
  
  // 保存全局对象以便在测试后恢复
  const originalConsoleError = console.error;
  const originalAddEventListener = window.addEventListener;
  const originalRemoveEventListener = window.removeEventListener;
  
  beforeEach(() => {
    // 重置所有模拟函数
    vi.clearAllMocks();
    
    // 创建新的插件实例
    plugin = new JSErrorPlugin();
    
    // 使用真实的 tracker 实例替代 mockCoreInstance
    tracker = createTracker({
      project: 'test-project',
      debug: false
    });
    
    // 监视 tracker.send 方法
    vi.spyOn(tracker, 'send');
    
    // 模拟全局属性
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { href: 'https://test.com/page' }
    });
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
    
    // 恢复原始的全局对象
    console.error = originalConsoleError;
    window.addEventListener = originalAddEventListener;
    window.removeEventListener = originalRemoveEventListener;
    
    // 清除所有模拟
    vi.restoreAllMocks();
  });
  
  describe('初始化', () => {
    it('应该正确初始化并添加事件监听器', () => {
      // 间谍监听 addEventListener 方法
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
      
      // 初始化插件
      plugin.setUp(tracker, {});
      
      // 验证是否添加了错误事件监听
      expect(addEventListenerSpy).toHaveBeenCalledWith('error', expect.any(Function), true);
      expect(addEventListenerSpy).toHaveBeenCalledWith('unhandledrejection', expect.any(Function), true);
    });
    
    it('应该根据配置有选择地添加事件监听器', () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
      
      // 禁用对 Promise 错误的监听
      plugin.setUp(tracker, {
        enablePromiseError: false
      });
      
      // 验证是否添加了错误事件监听但没有添加 Promise 错误监听
      const calls = addEventListenerSpy.mock.calls
        .filter(call => ['error', 'unhandledrejection'].includes(call[0] as string));
      
      expect(calls.length).toBe(1);
      expect(calls[0][0]).toBe('error');
    });
    
    it('应该根据配置拦截 console.error', () => {
      // 初始化插件，启用 console.error 捕获
      plugin.setUp(tracker, {
        captureConsoleError: true
      });
      
      // 验证 console.error 是否被替换
      expect(console.error).not.toBe(originalConsoleError);
    });
  });
  
  describe('错误捕获', () => {
    beforeEach(() => {
      // 在每个测试前初始化插件
      plugin.setUp(tracker, {
        captureConsoleError: true
      });
    });
    
    it('应该捕获 JS 运行时错误', () => {
      // 创建错误事件
      const errorEvent = new ErrorEvent('error', {
        message: '测试错误',
        filename: 'test.js',
        lineno: 10,
        colno: 5,
        error: new Error('测试错误')
      });
      
      // 触发错误事件
      window.dispatchEvent(errorEvent);
      
      // 验证错误是否被上报
      expect(tracker.send).toHaveBeenCalledTimes(1);
      expect(tracker.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MetricType.JS_ERROR,
          message: '测试错误',
          errorType: 'js',
          filename: 'test.js',
          lineno: 10,
          colno: 5,
        }),
        true
      );
    });
    
    it('应该捕获未处理的 Promise 错误', () => {
      // 由于 JSDOM 不支持 PromiseRejectionEvent，创建一个自定义事件
      const error = new Error('Promise 错误');
      // 使用已经处理的 Promise 避免产生未处理的拒绝警告
      const rejectedPromise = Promise.reject(error).catch(() => {/* 处理拒绝 */});
      
      const promiseRejectionEvent = new CustomEvent('unhandledrejection', {
        detail: {
          reason: error,
          promise: rejectedPromise
        }
      });
      
      // 添加 reason 属性以模拟 PromiseRejectionEvent
      Object.defineProperty(promiseRejectionEvent, 'reason', {
        value: error
      });
      
      // 触发 Promise 拒绝事件
      window.dispatchEvent(promiseRejectionEvent);
      
      // 验证错误是否被上报
      expect(tracker.send).toHaveBeenCalledTimes(1);
      expect(tracker.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MetricType.JS_ERROR,
          message: 'Promise 错误',
          errorType: 'promise',
          name: 'Error',
        }),
        true
      );
    });
    
    it('应该捕获 console.error 调用', () => {
      // 调用 console.error
      console.error('控制台错误');
      
      // 验证错误是否被上报
      expect(tracker.send).toHaveBeenCalledTimes(1);
      expect(tracker.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MetricType.JS_ERROR,
          message: '控制台错误',
          errorType: 'console',
        }),
        true
      );
    });
    
    it('应该捕获资源加载错误', () => {
      // 创建一个 img 元素
      const img = document.createElement('img');
      img.src = 'non-existent.jpg';
      
      // 创建图片错误事件
      const errorEvent = new ErrorEvent('error', {
        message: '资源加载失败',
      });
      Object.defineProperty(errorEvent, 'target', {
        value: img
      });
      
      // 触发错误事件
      window.dispatchEvent(errorEvent);
      
      // 验证资源错误是否被上报
      expect(tracker.send).toHaveBeenCalledTimes(1);
      // 使用模糊匹配，因为不同环境可能生成不同的错误信息格式
      expect(tracker.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MetricType.JS_ERROR,
          errorType: 'resource',
        }),
        true
      );
      
      // 验证发送的数据中包含图片URL（无论完整或部分URL）
      const sentData = (tracker.send as any).mock.calls[0][0];
      expect(sentData.filename).toContain('non-existent.jpg');
      // 修复：使用条件语句代替逻辑操作符
      if (!sentData.message.includes('资源加载失败')) {
        expect(sentData.message).toContain('non-existent.jpg');
      }
    });
    
    it('根据配置不捕获资源错误', () => {
      // 重新初始化插件，禁用资源错误捕获
      plugin.destroy();
      plugin = new JSErrorPlugin();
      plugin.setUp(tracker, {
        enableResourceError: false
      });
      
      // 创建一个 img 元素和错误事件
      const img = document.createElement('img');
      img.src = 'non-existent.jpg';
      
      const errorEvent = new ErrorEvent('error', {
        message: '资源加载失败',
      });
      Object.defineProperty(errorEvent, 'target', {
        value: img
      });
      
      // 触发错误事件
      window.dispatchEvent(errorEvent);
      
      // 验证没有错误被上报
      expect(tracker.send).not.toHaveBeenCalled();
    });
    
    it('应该根据配置进行错误采样', () => {
      // 重新初始化插件，设置采样率
      plugin.destroy();
      plugin = new JSErrorPlugin();
      
      // 模拟 Math.random 总是返回 0.8
      const mathRandomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.8);
      
      // 设置采样率为 0.5，即只有 50% 的错误会被上报
      plugin.setUp(tracker, {
        errorSampleRate: 0.5
      });
      
      // 创建错误事件
      const errorEvent = new ErrorEvent('error', {
        message: '测试错误',
        error: new Error('测试错误')
      });
      
      // 触发错误事件
      window.dispatchEvent(errorEvent);
      
      // 由于随机值 0.8 > 采样率 0.5，这个错误不应该被上报
      expect(tracker.send).not.toHaveBeenCalled();
      
      // 改变随机值为 0.3
      mathRandomSpy.mockReturnValue(0.3);
      
      // 再次触发错误
      window.dispatchEvent(errorEvent);
      
      // 这次应该被上报，因为 0.3 < 0.5
      expect(tracker.send).toHaveBeenCalledTimes(1);
      
      // 恢复 Math.random
      mathRandomSpy.mockRestore();
    });
  });
  
  describe('销毁', () => {
    it('应该正确移除事件监听器', () => {
      // 间谍监听 removeEventListener 方法
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
      
      // 初始化然后销毁插件
      plugin.setUp(tracker, {});
      plugin.destroy();
      
      // 验证是否移除了事件监听
      expect(removeEventListenerSpy).toHaveBeenCalledWith('error', expect.any(Function), true);
      expect(removeEventListenerSpy).toHaveBeenCalledWith('unhandledrejection', expect.any(Function), true);
    });
    
    it('应该恢复原始的 console.error', () => {
      // 初始化插件，启用 console.error 捕获
      plugin.setUp(tracker, {
        captureConsoleError: true
      });
      
      // 验证 console.error 已被替换
      expect(console.error).not.toBe(originalConsoleError);
      
      // 销毁插件
      plugin.destroy();
      
      // 验证 console.error 已被恢复
      expect(console.error).toBe(originalConsoleError);
    });
  });
});