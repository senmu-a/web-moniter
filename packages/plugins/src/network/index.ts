import { BasePlugin } from '../index';
import { DEFAULT_OPTIONS, NetworkPluginOptions, NetworkRequestInfo } from './types';
import { FetchHandler } from './handlers/fetch-handler';
import { XHRHandler } from './handlers/xhr-handler';
import { NetworkReporter } from './reporter';

/**
 * 网络请求监控插件
 * 
 * 该插件用于监控页面中的网络请求，包括 Fetch 和 XMLHttpRequest
 * 支持请求过滤、日志追踪、业务状态码解析、请求超时监控等功能
 */
export class NetworkPlugin extends BasePlugin<NetworkPluginOptions> {
  name = 'network';
  
  private fetchHandler!: FetchHandler;
  private xhrHandler!: XHRHandler;
  private reporter!: NetworkReporter;
  private cleanupFunctions: Array<() => void>;

  constructor(options?: NetworkPluginOptions) {
    super();
    // 合并默认配置
    this.options = { ...DEFAULT_OPTIONS, ...options };
    // 初始化清理函数数组
    this.cleanupFunctions = [];
  }

  /**
   * 初始化插件
   */
  protected init(): void {
    const options = this.options;
    
    // 创建请求上报处理器
    this.reporter = new NetworkReporter(this.coreInstance, options);
    
    // 分别启用各种请求类型的监控
    if (options.enableFetch !== false) {
      this.enableFetchMonitoring();
    }
    
    if (options.enableXhr !== false) {
      this.enableXhrMonitoring();
    }
  }

  /**
   * 启用 Fetch 请求监控
   */
  private enableFetchMonitoring(): void {
    // 创建 FetchHandler 实例，传入请求完成的回调函数
    this.fetchHandler = new FetchHandler(
      this.options, 
      this.coreInstance, 
      this.handleNetworkRequest.bind(this)
    );
    const cleanup = this.fetchHandler.enable();
    this.cleanupFunctions.push(cleanup);
  }

  /**
   * 启用 XMLHttpRequest 请求监控
   */
  private enableXhrMonitoring(): void {
    // 创建 XHRHandler 实例，传入请求完成的回调函数
    this.xhrHandler = new XHRHandler(
      this.options, 
      this.coreInstance, 
      this.handleNetworkRequest.bind(this)
    );
    const cleanup = this.xhrHandler.enable();
    this.cleanupFunctions.push(cleanup);
  }

  /**
   * 处理网络请求
   */
  private handleNetworkRequest(info: NetworkRequestInfo): void {
    if (this.reporter) {
      this.reporter.reportNetworkRequest(info);
    }
  }

  /**
   * 销毁插件
   */
  destroy(): void {
    // 调用所有清理函数
    this.cleanupFunctions.forEach(cleanup => cleanup());
    this.cleanupFunctions = [];
  }
}
