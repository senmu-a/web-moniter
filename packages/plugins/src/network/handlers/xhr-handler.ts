import { NetworkPluginOptions, NetworkRequestInfo } from '../types';
import { 
  checkSameOrigin, 
  extractContent, 
  getFullUrl, 
  generateTraceId, 
  safeJsonParse,
  isMTSIForbidRequest
} from '../utils';
import { RequestCompleteCallback } from './fetch-handler';

/**
 * XHR请求监控处理器
 */
export class XHRHandler {
  private originalXhrOpen!: typeof XMLHttpRequest.prototype.open;
  private originalXhrSend!: typeof XMLHttpRequest.prototype.send;
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
    this.originalXhrOpen = XMLHttpRequest.prototype.open;
    this.originalXhrSend = XMLHttpRequest.prototype.send;
  }

  /**
   * 启用 XMLHttpRequest 监控
   * @returns 清理函数
   */
  enable(): () => void {
    if (this.enabled) return () => {};
    
    // 检查是否已被劫持
    if ((XMLHttpRequest as any)._momo) {
      return () => {};
    }
    
    this.hookXhr();
    this.enabled = true;
    
    // 返回清理函数
    return () => {
      if (this.enabled) {
        this.restore();
        this.enabled = false;
      }
    };
  }
  
  /**
   * 恢复原始方法
   */
  private restore(): void {
    if (this.originalXhrOpen && this.originalXhrSend) {
      XMLHttpRequest.prototype.open = this.originalXhrOpen;
      XMLHttpRequest.prototype.send = this.originalXhrSend;
      // 移除标记
      (XMLHttpRequest as any)._momo = false;
    }
  }

  /**
   * 劫持 XMLHttpRequest
   */
  private hookXhr(): void {
    const self = this;
    const origin = window.location.origin;
    
    // 标记 XHR 已被劫持
    (XMLHttpRequest as any)._momo = true;
    
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
      xhrInfo.__moniter_start_time = Date.now();
      
      self.originalXhrOpen.call(this, method, url, async !== false, username, password);
    };
    
    XMLHttpRequest.prototype.send = function(this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit): void {
      const xhr = this;
      const xhrInfo = xhr as any;
      const url = xhrInfo.__moniter_url;
      const fullUrl = getFullUrl(url);
      const method = xhrInfo.__moniter_method || 'GET';
      let httpTraceId: string | undefined;
      
      // 检查是否需要过滤该请求
      if (self.shouldFilterRequest(fullUrl)) {
        return self.originalXhrSend.call(this, body);
      }
      
      // 添加追踪ID
      if (self.options.enableLogTrace && checkSameOrigin(fullUrl, origin)) {
        try {
          httpTraceId = generateTraceId();
          xhr.setRequestHeader('M-TRACEID', httpTraceId);
          xhr.setRequestHeader('M-APPKEY', `fe_${self.coreInstance.getConfig().project}`);
          xhrInfo.__moniter_trace_id = httpTraceId;
        } catch (e) {
          console.error('添加追踪ID失败:', e);
        }
      }
      
      const startTime = Date.now();
      let requestData: any;
      
      // 收集请求数据
      if (self.options.includeRequest && body) {
        requestData = extractContent(body, self.options.maxContentLength);
      }
      
      // 记录请求和响应
      const onLoadEnd = function() {
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        // 检查是否为反爬虫请求
        if (isMTSIForbidRequest('xhr', xhr, self.options.ignoreMTSIForbidRequest)) {
          return;
        }
        
        let responseData;
        let businessCode;
        
        // 检查耗时是否超过阈值
        let timeoutMessage = '';
        if (self.options.enableDurationCheck && 
            duration > (self.options.durationThreshold || 2000)) {
          timeoutMessage = `请求耗时超过${self.options.durationThreshold}ms`;
        }
        
        // 解析响应数据
        if (xhr.readyState === 4) {
          try {
            const contentType = xhr.getResponseHeader('content-type') || '';
            if ((xhr.responseType === '' || xhr.responseType === 'text') && 
                contentType && (contentType.includes('application/json') || contentType.includes('text/'))) {
              
              // 收集响应数据
              if (self.options.includeResponse) {
                responseData = xhr.responseText;
                if (contentType.includes('application/json')) {
                  responseData = safeJsonParse(responseData);
                }
              }
              
              // 解析业务状态码
              if (self.options.autoBusinessCode && self.options.parseResponse && contentType.includes('application/json')) {
                const parsedData = typeof responseData !== 'undefined' ? 
                  responseData : safeJsonParse(xhr.responseText);
                
                try {
                  const result = self.options.parseResponse(parsedData);
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
        
        // 处理状态码和错误信息
        const statusCode = xhr.status;
        const isSuccess = (statusCode >= 200 && statusCode < 400);
        let errorMessage = '';
        
        if (!isSuccess) {
          errorMessage = `${statusCode} ${xhr.statusText || ''}`;
        }
        
        if (timeoutMessage) {
          errorMessage = timeoutMessage;
        }
        
        // 上报请求
        self.callRequestComplete({
          url: fullUrl,
          method,
          status: statusCode,
          businessCode,
          requestData,
          responseData,
          duration,
          success: isSuccess && !timeoutMessage,
          errorMessage: errorMessage || undefined,
          httpTraceId,
          type: 'xhr'
        });
      };
      
      const onError = function() {
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        self.callRequestComplete({
          url: fullUrl,
          method,
          status: 0,
          requestData,
          duration,
          success: false,
          errorMessage: xhr.statusText || '网络错误',
          httpTraceId,
          type: 'xhr'
        });
      };
      
      xhr.addEventListener('loadend', onLoadEnd);
      xhr.addEventListener('error', onError);
      xhr.addEventListener('abort', function() {
        self.callRequestComplete({
          url: fullUrl,
          method,
          status: 0,
          requestData,
          duration: Date.now() - startTime,
          success: false,
          errorMessage: '请求被中止',
          httpTraceId,
          type: 'xhr'
        });
      });
      
      xhr.addEventListener('timeout', function() {
        self.callRequestComplete({
          url: fullUrl,
          method,
          status: 0,
          requestData,
          duration: Date.now() - startTime,
          success: false,
          errorMessage: '请求超时',
          httpTraceId,
          type: 'xhr'
        });
      });
      
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

  /**
   * 调用请求完成回调函数
   */
  private callRequestComplete(info: NetworkRequestInfo): void {
    if (this.onRequestComplete) {
      this.onRequestComplete(info);
    }
  }
}