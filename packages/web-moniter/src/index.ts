import { MoniterConfig, MetricData, Reporter, IWebMoniter } from '@senmu/types';
import { Tracker, createTracker } from '@senmu/core';
import { createReporter } from '@senmu/reporter';


/**
 * 创建默认配置
 */
const createDefaultConfig = (config: MoniterConfig) => {
  const userConfig = { ...config };
  
  if (!userConfig.project) {
    throw new Error('[web-moniter] 必须提供项目标识(project)');
  }
  
  return userConfig;
};

/**
 * Web监控SDK类
 */
class WebMoniter implements IWebMoniter {
  private tracker!: Tracker;
  private reporter!: Reporter;
  private initialized = false;
  
  /**
   * 初始化监控SDK
   */
  init(config: MoniterConfig): WebMoniter {
    if (this.initialized) {
      console.warn('[web-moniter] SDK已经初始化，请勿重复调用init');
      return this;
    }
    
    const fullConfig = createDefaultConfig(config);
    
    // 创建上报器
    this.reporter = createReporter(fullConfig);
    
    // 创建追踪器
    this.tracker = createTracker(fullConfig);
    this.tracker.setReporter(this.reporter);
    
    this.initialized = true;
    
    return this;
  }
  
  /**
   * 注册插件
   */
  use(pluginCtors: Array<[any, any?]>): WebMoniter {
    if (!this.initialized) {
      throw new Error('[web-moniter] 必须先调用init初始化SDK');
    }
    
    this.tracker.use(pluginCtors);
    return this;
  }
  
  /**
   * 添加错误信息
   */
  addError(err: Error, opts?: { category?: string; level?: string }) {
    if (!this.initialized) {
      console.error('[web-moniter] 必须先调用init初始化SDK');
      return;
    }
    
    this.tracker.addError(err, opts);
  }
  
  /**
   * 设置配置
   */
  setConfig(config: Partial<MoniterConfig>): WebMoniter {
    if (!this.initialized) {
      console.error('[web-moniter] 必须先调用init初始化SDK');
      return this;
    }
    
    this.tracker.setConfig(config);
    return this;
  }
  
  /**
   * 手动上报指标数据
   */
  send(metric: MetricData | MetricData[], reportNow = false) {
    if (!this.initialized) {
      console.error('[web-moniter] 必须先调用init初始化SDK');
      return;
    }
    
    this.tracker.send(metric, reportNow);
  }
  
  /**
   * 立即上报所有缓存数据
   */
  flush() {
    if (!this.initialized) {
      console.error('[web-moniter] 必须先调用init初始化SDK');
      return;
    }
    
    this.tracker.flush();
  }
  
  /**
   * 销毁SDK实例
   */
  destroy() {
    if (!this.initialized) {
      return;
    }
    
    this.tracker.destroy();
    this.initialized = false;
  }
}

// 创建单例
const moniter = new WebMoniter();

// 导出默认实例和插件
export {
  moniter as default
};