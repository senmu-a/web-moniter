import { BasePlugin } from '../index';
import { MetricType, APIMetric } from '@senmu/types';
import { getGlobalObject } from '../utils/global';

interface NetworkPluginOptions {
  // 是否过滤监控上报请求
  ignoreMoniterRequest?: boolean;
  // 需要过滤的请求URL正则表达式
  filterUrls?: RegExp[];
  // 是否包含请求参数
  includeRequest?: boolean;
  // 是否包含响应内容
  includeResponse?: boolean;
  // 最大捕获请求体/响应体长度
  maxContentLength?: number;
  // 是否捕获fetch请求
  enableFetch?: boolean;
  // 是否捕获XMLHttpRequest请求
  enableXhr?: boolean;
}

/**
 * 网络请求监控插件
 */
export class NetworkPlugin extends BasePlugin<NetworkPluginOptions> {
  name = 'network';
  private originalFetch!: typeof fetch;
  private originalXhrOpen!: typeof XMLHttpRequest.prototype.open;
  private originalXhrSend!: typeof XMLHttpRequest.prototype.send;

  protected init(): void {
    const options = this.options;
    const global = getGlobalObject();
    
    // 默认启用所有监控
    const enableFetch = options.enableFetch !== false;
    const enableXhr = options.enableXhr !== false;
    
    // 分别监控各种请求类型
    if (enableFetch && typeof global.fetch === 'function') {
      this.hookFetch();
    }
    
    if (enableXhr) {
      this.hookXhr();
    }
  }

  destroy(): void {
    const global = getGlobalObject();
    
    // 恢复原始函数
    if (this.originalFetch) {
      global.fetch = this.originalFetch;
    }
    
    if (this.originalXhrOpen && this.originalXhrSend) {
      XMLHttpRequest.prototype.open = this.originalXhrOpen;
      XMLHttpRequest.prototype.send = this.originalXhrSend;
    }
  }

  /**
   * 监控Fetch请求
   */
  private hookFetch(): void {
    const global = getGlobalObject();
    this.originalFetch = global.fetch;
    
    global.fetch = async (input: RequestInfo, init?: RequestInit): Promise<Response> => {
      const startTime = Date.now();
      const url = typeof input === 'string' ? input : input.url;
      
      // 检查是否需要过滤该请求
      if (this.shouldFilterRequest(url)) {
        return this.originalFetch.call(global, input, init);
      }

      const method = init?.method || (typeof input !== 'string' && input.method) || 'GET';
      
      // 收集请求数据
      let requestData;
      if (this.options.includeRequest && init?.body) {
        requestData = this.extractContent(init.body);
      }

      let response: Response | undefined;
      let error: Error | undefined;
      let responseData;
      
      try {
        // 发送请求
        response = await this.originalFetch.call(global, input, init);
        
        // 捕获响应数据，这里需要克隆响应以避免破坏原始响应流
        if (this.options.includeResponse && response) {
          const clonedResponse = response.clone();
          try {
            const contentType = response.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
              responseData = await clonedResponse.json();
            } else if (contentType.includes('text/')) {
              responseData = await clonedResponse.text();
            }
          } catch (e) {
            // 忽略响应解析错误
          }
        }
        
        return response;
      } catch (e) {
        error = e as Error;
        throw e;
      } finally {
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        this.reportNetworkRequest({
          url: url as string,
          method,
          status: response?.status || 0,
          requestData,
          responseData,
          duration,
          success: !!response && (response.status >= 200 && response.status < 400),
          errorMessage: error?.message
        });
      }
    };
  }

  /**
   * 监控XMLHttpRequest请求
   */
  private hookXhr(): void {
    this.originalXhrOpen = XMLHttpRequest.prototype.open;
    this.originalXhrSend = XMLHttpRequest.prototype.send;
    
    const self = this;
    
    XMLHttpRequest.prototype.open = function(
      this: XMLHttpRequest,
      method: string,
      url: string,
      async?: boolean,
      username?: string | null,
      password?: string | null
    ): void {
      // 保存请求信息到XHR对象
      const xhrInfo = this as any;
      xhrInfo.__moniter_url = url;
      xhrInfo.__moniter_method = method;
      
      self.originalXhrOpen.call(this, method, url, async !== false, username, password);
    };
    
    XMLHttpRequest.prototype.send = function(this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit): void {
      const xhr = this;
      const xhrInfo = xhr as any;
      const url = xhrInfo.__moniter_url;
      const method = xhrInfo.__moniter_method;
      
      // 检查是否需要过滤该请求
      if (self.shouldFilterRequest(url)) {
        return self.originalXhrSend.call(this, body);
      }
      
      const startTime = Date.now();
      let requestData: any;
      
      // 收集请求数据
      if (self.options.includeRequest && body) {
        requestData = self.extractContent(body);
      }
      
      // 记录请求和响应
      const onLoad = function() {
        const endTime = Date.now();
        const duration = endTime - startTime;
        let responseData;
        
        // 收集响应数据
        if (self.options.includeResponse && xhr.responseType === '' || xhr.responseType === 'text') {
          try {
            responseData = xhr.responseText;
            
            // 尝试解析JSON
            if (xhr.getResponseHeader('content-type')?.includes('application/json')) {
              responseData = JSON.parse(responseData);
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
        
        self.reportNetworkRequest({
          url,
          method,
          status: xhr.status,
          requestData,
          responseData,
          duration,
          success: xhr.status >= 200 && xhr.status < 400,
          errorMessage: xhr.status >= 400 ? `HTTP Status: ${xhr.status}` : undefined
        });
      };
      
      const onError = function() {
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        self.reportNetworkRequest({
          url,
          method,
          status: 0,
          requestData,
          duration,
          success: false,
          errorMessage: 'Network Error'
        });
      };
      
      xhr.addEventListener('load', onLoad);
      xhr.addEventListener('error', onError);
      xhr.addEventListener('timeout', onError);
      xhr.addEventListener('abort', onError);
      
      return self.originalXhrSend.call(this, body);
    };
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
    
    // 过滤用户配置的URL
    if (options.filterUrls && options.filterUrls.length) {
      for (const regex of options.filterUrls) {
        if (regex.test(url)) {
          return true;
        }
      }
    }
    
    return false;
  }
  
  /**
   * 提取请求/响应内容
   */
  private extractContent(content: any): any {
    const maxLength = this.options.maxContentLength || 10000;
    
    if (!content) {
      return undefined;
    }
    
    // 处理FormData
    if (content instanceof FormData) {
      try {
        const formData: Record<string, any> = {};
        content.forEach((value, key) => {
          formData[key] = value;
        });
        return formData;
      } catch (e) {
        return '[FormData]';
      }
    }
    
    // 处理Blob或File
    if (content instanceof Blob || content instanceof File) {
      return `[${content.constructor.name}] size: ${content.size}`;
    }
    
    // 处理字符串
    if (typeof content === 'string') {
      const truncated = content.length > maxLength ? content.substr(0, maxLength) + '...' : content;
      
      // 尝试解析JSON
      try {
        return JSON.parse(truncated);
      } catch (e) {
        return truncated;
      }
    }
    
    // 处理对象
    if (typeof content === 'object' && content !== null) {
      try {
        return JSON.parse(JSON.stringify(content));
      } catch (e) {
        return '[Object]';
      }
    }
    
    return content;
  }
  
  /**
   * 上报网络请求
   */
  private reportNetworkRequest(params: {
    url: string;
    method: string;
    status: number;
    requestData?: any;
    responseData?: any;
    duration: number;
    success: boolean;
    errorMessage?: string;
  }): void {
    const apiMetric: APIMetric = {
      type: MetricType.API,
      url: params.url,
      method: params.method,
      status: params.status,
      requestData: params.requestData,
      responseData: params.responseData,
      duration: params.duration,
      success: params.success,
      errorMessage: params.errorMessage,
      timestamp: Date.now(),
      project: this.coreInstance.getConfig().project,
      pageUrl: window?.location?.href
    };
    
    this.coreInstance.send(apiMetric);
  }
}
