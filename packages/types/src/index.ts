/**
 * Web监控SDK接口
 */
export interface IWebMoniter {
  /**
   * 初始化监控SDK
   */
  init(config: MoniterConfig): IWebMoniter;
  
  /**
   * 注册插件
   */
  use(pluginCtors: Array<[any, any?]>): IWebMoniter;
  
  /**
   * 添加错误信息
   */
  addError(err: Error, opts?: { category?: string; level?: string }): void;
  
  /**
   * 设置配置
   */
  setConfig(config: Partial<MoniterConfig>): IWebMoniter;
  
  /**
   * 手动上报指标数据
   */
  send(metric: MetricData | MetricData[], reportNow?: boolean): void;
  
  /**
   * 立即上报所有缓存数据
   */
  flush(): void;
  
  /**
   * 销毁SDK实例
   */
  destroy(): void;
}

/**
 * 追踪器接口
 */
export interface ITracker {
  /**
   * 注册插件
   * @param pluginCtors 插件构造函数数组，每个元素为 [PluginClass, options?]
   */
  use(pluginCtors: Array<[any, any?]>): ITracker;
  
  /**
   * 设置上报器
   */
  setReporter(reporter: Reporter): ITracker;
  
  /**
   * 设置配置
   */
  setConfig(config: Partial<MoniterConfig>): ITracker;
  
  /**
   * 获取当前配置
   */
  getConfig(): MoniterConfig;
  
  /**
   * 添加错误
   */
  addError(err: Error, opts?: { category?: string; level?: string }): void;
  
  /**
   * 发送指标数据
   */
  send(metric: MetricData | MetricData[], reportNow?: boolean): void;
  
  /**
   * 立即上报所有缓存的指标数据
   */
  flush(): void;
  
  /**
   * 销毁追踪器
   */
  destroy(): void;
}

/**
 * 核心配置选项接口
 */
export interface MoniterConfig {
  // 项目标识
  project: string;
  // 应用版本
  appVersion?: string;
  // 上报URL
  reportUrl?: string;
  // 采样率 0-1
  sampleRate?: number;
  // 是否启用调试模式
  debug?: boolean;
  // 自定义设备信息
  deviceInfo?: Record<string, any>;
  // 最大缓存条数
  maxCache?: number;
  // 是否立即上报
  reportImmediately?: boolean;
  // HTTP请求头
  headers?: Record<string, string>;
}

/**
 * 监控数据类型
 */
export enum MetricType {
  // JS错误
  JS_ERROR = 'jsError',
  // 接口请求
  API = 'api',
  // 资源加载
  RESOURCE = 'resource',
  // 性能指标
  PERFORMANCE = 'performance',
  // 页面访问
  PV = 'pv',
  // 自定义指标
  CUSTOM = 'custom'
}

/**
 * 基础监控数据接口
 */
export interface BaseMetric {
  // 指标类型
  type: MetricType;
  // 项目标识
  project: string;
  // 应用版本
  appVersion?: string;
  // 时间戳
  timestamp: number;
  // 会话ID
  sessionId?: string;
  // 页面URL
  pageUrl: string;
  // 用户标识
  uid?: string;
  // 设备信息
  device?: {
    os?: string;
    osVersion?: string;
    browser?: string;
    browserVersion?: string;
    device?: string;
    deviceModel?: string;
    screenWidth?: number;
    screenHeight?: number;
  };
  // 自定义标签
  tags?: Record<string, any>;
}

/**
 * JS错误监控数据
 */
export interface JSErrorMetric extends BaseMetric {
  type: MetricType.JS_ERROR;
  // 错误信息
  message: string;
  // 错误名称
  name: string;
  // 错误堆栈
  stack?: string;
  // 错误类型 (js/promise/resource/...)
  errorType: string;
  // 发生错误的文件
  filename?: string;
  // 发生错误的行号
  lineno?: number;
  // 发生错误的列号
  colno?: number;
}

/**
 * 接口请求监控数据
 */
export interface APIMetric extends BaseMetric {
  type: MetricType.API;
  // 请求URL
  url: string;
  // 请求方法
  method: string;
  // 状态码
  status: number;
  // 请求体
  requestData?: any;
  // 响应体
  responseData?: any;
  // 请求耗时(ms)
  duration: number;
  // 是否成功
  success: boolean;
  // 错误信息
  errorMessage?: string;
}

/**
 * 资源加载监控数据
 */
export interface ResourceMetric extends BaseMetric {
  type: MetricType.RESOURCE;
  // 资源名称
  name: string;
  // 资源URL
  url: string;
  // 资源类型
  initiatorType: string;
  // 加载耗时(ms)
  duration: number;
  // 传输大小
  transferSize?: number;
  // 编码大小
  encodedBodySize?: number;
  // 解码大小
  decodedBodySize?: number;
  // 是否成功
  success: boolean;
}

/**
 * 性能指标监控数据
 */
export interface PerformanceMetric extends BaseMetric {
  type: MetricType.PERFORMANCE;
  // 指标列表
  metrics: {
    // 首次绘制
    FP?: number;
    // 首次内容绘制
    FCP?: number;
    // 最大内容绘制
    LCP?: number;
    // 首次输入延迟
    FID?: number;
    // 累积布局偏移
    CLS?: number;
    // DOM就绪时间
    domReady?: number;
    // 页面加载时间
    loadTime?: number;
    // DNS解析时间
    dnsTime?: number;
    // TCP连接时间
    tcpTime?: number;
    // 请求响应时间
    ttfb?: number;
    // 白屏时间
    blankTime?: number;
    // 自定义指标
    [key: string]: number | undefined;
  }
}

/**
 * 页面访问监控数据
 */
export interface PVMetric extends BaseMetric {
  type: MetricType.PV;
  // 页面标题
  title: string;
  // 页面路径
  path: string;
  // 来源
  referrer?: string;
  // 停留时间(ms)
  stayTime?: number;
}

/**
 * 自定义指标监控数据
 */
export interface CustomMetric extends BaseMetric {
  type: MetricType.CUSTOM;
  // 自定义指标名称
  name: string;
  // 自定义指标值
  value: any;
  // 自定义指标分类
  category?: string;
}

/**
 * 联合类型，表示所有可能的监控数据类型
 */
export type MetricData = 
  | JSErrorMetric
  | APIMetric
  | ResourceMetric
  | PerformanceMetric
  | PVMetric
  | CustomMetric;

/**
 * 插件接口
 */
export interface Plugin {
  // 插件名称
  name: string;
  // 初始化插件
  setUp: (coreInstance: any, options?: any) => void;
  // 销毁插件
  destroy: () => void;
}

/**
 * 上报器接口
 */
export interface Reporter {
  // 发送数据
  send: (data: MetricData | MetricData[], immediately?: boolean) => Promise<void>;
  // 设置配置
  setConfig: (config: Partial<MoniterConfig>) => void;
  // 销毁上报器
  destroy: () => void;
}