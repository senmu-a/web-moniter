import { NetworkPluginOptions, NetworkRequestInfo } from '../types';
import { 
  checkSameOrigin, 
  extractContent, 
  getFullUrl, 
  generateTraceId, 
  safeJsonParse 
} from '../utils';
import { getGlobalObject } from '../../utils/global';

/**
 * 回调函数类型定义
 */
export type RequestCompleteCallback = (info: NetworkRequestInfo) => void;

/**
 * Fetch请求监控处理器
 */
export class FetchHandler {
  private originalFetch: typeof fetch;
  private options: NetworkPluginOptions;
  private coreInstance: any;
  private onRequestComplete: RequestCompleteCallback;
  private enabled: boolean = false;

  constructor(
    options: NetworkPluginOptions, 
    coreInstance: any, 
    callback: RequestCompleteCallback
  ) {
    this.options = options;
    this.coreInstance = coreInstance;
    this.onRequestComplete = callback;
    this.originalFetch = getGlobalObject().fetch;
  }

  /**
   * 启用 Fetch 监控
   * @returns 清理函数
   */
  enable(): () => void {
    if (this.enabled) return () => {};
    
    const global = getGlobalObject();
    // 如果已被劫持或不存在fetch，则返回空函数
    if ((global.fetch as any)._momo || typeof global.fetch !== 'function') {
      return () => {};
    }
    
    this.originalFetch = global.fetch;
    global.fetch = this.fetchProxy.bind(this);
    // 标记fetch已被劫持
    (global.fetch as any)._momo = true;
    this.enabled = true;

    // 返回清理函数
    return () => {
      if (this.enabled) {
        global.fetch = this.originalFetch;
        // 移除标记
        (global.fetch as any)._momo = false;
        this.enabled = false;
      }
    };
  }

  /**
   * Fetch代理函数
   */
  private async fetchProxy(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    // 如果已被标记为劫持，直接调用原始fetch
    if ((this.fetchProxy as any)._momo) {
      return this.originalFetch(input, init);
    }

    const startTime = Date.now();
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const fullUrl = getFullUrl(url);

    // 检查是否需要过滤该请求
    if (this.shouldFilterRequest(fullUrl)) {
      return this.originalFetch(input, init);
    }

    const method = init?.method || (typeof input !== 'string' && 'method' in input ? input.method : 'GET');
    let httpTraceId: string | undefined;
    
    // 添加日志追踪ID
    if (this.options.enableLogTrace && checkSameOrigin(fullUrl, window.location.origin)) {
      try {
        httpTraceId = generateTraceId();
        const headers = new Headers(init?.headers || {});
        headers.append('M-TRACEID', httpTraceId);
        headers.append('M-APPKEY', `fe_${this.coreInstance.getConfig().project}`);
        
        // 更新请求头
        init = init || {};
        init.headers = headers;
      } catch (e) {
        console.error('添加追踪ID失败:', e);
      }
    }

    // 收集请求数据
    let requestData;
    if (this.options.includeRequest && init?.body) {
      requestData = extractContent(init.body, this.options.maxContentLength);
    }

    let response: Response | undefined;
    let error: Error | undefined;
    let responseData;
    let businessCode;

    try {
      // 发送请求
      response = await this.originalFetch(input, init);
      
      // 检查是否为反爬虫请求
      let xForbidReason = '';
      if (response.headers && typeof response.headers.get === 'function') {
        xForbidReason = response.headers.get('x-forbid-reason') || '';
      }
      
      // 如果是被反爬虫拦截的请求且配置了忽略，则不上报
      if (this.options.ignoreMTSIForbidRequest && xForbidReason && response.status === 403) {
        return response;
      }
      
      // 捕获响应数据，这里需要克隆响应以避免破坏原始响应流
      if (response) {
        try {
          const contentType = response.headers.get('content-type') || '';
          if (contentType && (contentType.includes('application/json') || contentType.includes('text/'))) {
            const clonedResponse = response.clone();
            const responseText = await clonedResponse.text();
            
            // 解析响应数据
            if (this.options.includeResponse) {
              responseData = contentType.includes('application/json') ? 
                safeJsonParse(responseText) : responseText;
            }
            
            // 解析业务状态码
            if (this.options.autoBusinessCode && this.options.parseResponse && contentType.includes('application/json')) {
              const parsedData = typeof responseData !== 'undefined' ? responseData : safeJsonParse(responseText);
              try {
                const result = this.options.parseResponse(parsedData);
                businessCode = result.code;
              } catch (e) {
                console.error('解析业务状态码失败:', e);
              }
            }
          }
        } catch (e) {
          console.error('解析响应数据失败:', e);
        }
      }
      
      return response;
    } catch (e) {
      error = e as Error;
      throw e;
    } finally {
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // 检查耗时是否超过阈值
      let timeoutMessage = '';
      if (this.options.enableDurationCheck && 
          duration > (this.options.durationThreshold || 2000)) {
        timeoutMessage = `请求耗时超过${this.options.durationThreshold}ms`;
      }
      
      // 构建错误信息
      let statusCode = response?.status || 0;
      let errorMessage = '';
      let isSuccess = response && (statusCode >= 200 && statusCode < 400);
      
      if (!isSuccess) {
        if (error) {
          errorMessage = error.stack || error.message || '请求失败';
        } else if (response) {
          errorMessage = `${statusCode} ${response.statusText || ''}`;
        }
      }
      
      if (timeoutMessage) {
        errorMessage = timeoutMessage;
      }
      
      // 构建网络请求信息
      const requestInfo: NetworkRequestInfo = {
        url: fullUrl,
        method: method as string,
        status: statusCode,
        businessCode,
        requestData,
        responseData,
        duration,
        success: isSuccess ? !timeoutMessage : false,
        errorMessage: errorMessage || undefined,
        httpTraceId,
        type: 'fetch',
      };
      
      // 通过回调函数上报请求信息
      if (this.onRequestComplete) {
        this.onRequestComplete(requestInfo);
      }
    }
  }

  /**
   * 是否应该过滤该请求
   */
  private shouldFilterRequest(url: string): boolean {
    const options = this.options;
    
    // 过滤监控上报请求
    if (options.ignoreMoniterRequest !== false) {
      const reportUrl = this.coreInstance.getConfig().reportUrl;
      if (reportUrl && url.includes(reportUrl)) {
        return true;
      }
    }
    
    // 检查资源匹配正则
    if (options.resourceReg && !options.resourceReg.test(url)) {
      return true;
    }
    
    // 过滤用户配置的URL
    if (options.filterUrls && options.filterUrls.length) {
      for (const regex of options.filterUrls) {
        if (regex.test(url)) {
          return true;
        }
      }
    }
    
    // 采样过滤
    if (typeof options.sample === 'number' && options.sample < 1.0) {
      if (Math.random() > options.sample) {
        return true;
      }
    }
    
    return false;
  }
}