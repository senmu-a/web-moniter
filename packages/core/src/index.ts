import {
  MoniterConfig,
  MetricData,
  Plugin,
  Reporter,
  ITracker
} from '@senmu/types';

/**
 * 默认配置
 */
const DEFAULT_CONFIG: Partial<MoniterConfig> = {
  sampleRate: 1.0,
  debug: false,
  maxCache: 50,
  reportImmediately: false
};

/**
 * 核心追踪器类
 */
export class Tracker implements ITracker {
  private config: MoniterConfig;
  private plugins: Map<string, Plugin>;
  private reporter!: Reporter;
  private metricCache: MetricData[];
  private sessionId: string;

  constructor(config: MoniterConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.plugins = new Map();
    this.metricCache = [];
    this.sessionId = this.generateSessionId();
    
    if (this.config.debug) {
      console.log('[web-moniter] 初始化追踪器', this.config);
    }
  }

  /**
   * 初始化一个新的追踪器实例
   */
  static init(config: MoniterConfig): Tracker {
    return new Tracker(config);
  }

  /**
   * 注册插件
   * @param pluginCtors 插件构造函数数组，每个元素为 [PluginClass, options?]
   */
  use(pluginCtors: Array<[any, any?]>): Tracker {
    for (const [PluginCtor, options] of pluginCtors) {
      try {
        const plugin = new PluginCtor();
        plugin.setUp(this, options);
        this.plugins.set(plugin.name, plugin);
        
        if (this.config.debug) {
          console.log(`[web-moniter] 注册插件: ${plugin.name}`);
        }
      } catch (err) {
        console.error(`[web-moniter] 注册插件失败: ${err}`);
      }
    }
    return this;
  }

  /**
   * 设置上报器
   */
  setReporter(reporter: Reporter): Tracker {
    this.reporter = reporter;
    if (this.config.reportUrl) {
      reporter.setConfig({ reportUrl: this.config.reportUrl });
    }
    return this;
  }

  /**
   * 设置配置
   */
  setConfig(config: Partial<MoniterConfig>): Tracker {
    this.config = { ...this.config, ...config };
    if (this.reporter && config.reportUrl) {
      this.reporter.setConfig({ reportUrl: config.reportUrl });
    }
    return this;
  }

  /**
   * 获取当前配置
   */
  getConfig(): MoniterConfig {
    return { ...this.config };
  }

  /**
   * 添加错误
   */
  addError(err: Error, opts?: { category?: string; level?: string }) {
    // 在真实实现中，这里会处理错误并传递给插件或上报
    console.error('[web-moniter] 错误:', err, opts);
  }

  /**
   * 发送指标数据
   */
  send(metric: MetricData | MetricData[], reportNow = false) {
    if (!this.shouldSample()) {
      return;
    }

    const metrics = Array.isArray(metric) ? metric : [metric];
    
    // 添加基本信息
    const enrichedMetrics = metrics.map(m => ({
      ...m,
      sessionId: this.sessionId,
      timestamp: m.timestamp || Date.now(),
      pageUrl: m.pageUrl || window?.location?.href,
      project: this.config.project,
      appVersion: this.config.appVersion
    }));

    // 添加到缓存
    this.metricCache.push(...enrichedMetrics);
    
    // 缓存达到上限或强制上报
    if (reportNow || this.metricCache.length >= (this.config.maxCache || 50)) {
      this.flush();
    }
  }

  /**
   * 立即上报所有缓存的指标数据
   */
  flush() {
    if (this.metricCache.length === 0 || !this.reporter) {
      return;
    }

    const metricsToSend = [...this.metricCache];
    this.metricCache = [];
    
    try {
      const sendPromise = this.reporter.send(metricsToSend, true);
      
      // 确保 sendPromise 是一个 Promise
      if (sendPromise && typeof sendPromise.catch === 'function') {
        sendPromise.catch((err: Error) => {
          console.error('[web-moniter] 上报数据失败:', err);
          // 失败时重新加入缓存
          this.metricCache = [...metricsToSend, ...this.metricCache].slice(0, this.config.maxCache || 50);
        });
      }
    } catch (err) {
      console.error('[web-moniter] 上报数据失败:', err);
      // 如果调用出现异常，也重新加入缓存
      this.metricCache = [...metricsToSend, ...this.metricCache].slice(0, this.config.maxCache || 50);
    }
  }

  /**
   * 销毁追踪器
   */
  destroy() {
    // 销毁所有插件
    for (const [name, plugin] of this.plugins.entries()) {
      try {
        plugin.destroy();
      } catch (err) {
        console.error(`[web-moniter] 销毁插件失败: ${name}`, err);
      }
    }
    
    // 清空插件列表
    this.plugins.clear();
    
    // 上报剩余数据
    this.flush();
    
    // 销毁上报器
    if (this.reporter) {
      this.reporter.destroy();
    }
    
    if (this.config.debug) {
      console.log('[web-moniter] 追踪器已销毁');
    }
  }

  /**
   * 是否应该采样
   * @private
   */
  private shouldSample(): boolean {
    return Math.random() < (this.config.sampleRate || 1.0);
  }

  /**
   * 生成会话ID
   * @private
   */
  private generateSessionId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  }
}

/**
 * 创建一个新的追踪器实例
 */
export function createTracker(config: MoniterConfig): Tracker {
  return Tracker.init(config);
}