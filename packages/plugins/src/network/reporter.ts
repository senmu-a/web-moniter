import { MetricType, APIMetric } from '@senmu/types';
import { NetworkPluginOptions, NetworkRequestInfo } from './types';
import { getConnectTypeByUrl } from './utils';

/**
 * 网络请求上报处理器
 */
export class NetworkReporter {
  private coreInstance: any;
  private options: NetworkPluginOptions;

  constructor(coreInstance: any, options: NetworkPluginOptions) {
    this.coreInstance = coreInstance;
    this.options = options;
  }

  /**
   * 处理并上报网络请求
   */
  reportNetworkRequest(params: NetworkRequestInfo): void {
    try {
      // 构建API指标数据
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
        pageUrl: window?.location?.href,
        tags: {
          connectType: getConnectTypeByUrl(params.url),
          requestType: params.type,
          businessCode: params.businessCode,
          httpTraceId: params.httpTraceId
        }
      };
      
      // 处理超时错误
      if (this.options.enableDurationCheck && 
          params.duration > (this.options.durationThreshold || 2000)) {
        // 添加超时标记
        apiMetric.tags = {
          ...apiMetric.tags,
          timeout: true,
          timeoutThreshold: this.options.durationThreshold
        };
        
        // 如果配置了自动上报错误，则添加到错误系统
        if (!params.errorMessage) {
          const timeoutMsg = `请求耗时超过阈值: ${params.url}, 耗时: ${params.duration}ms`;
          apiMetric.errorMessage = timeoutMsg;
          
          // 将请求超时上报到错误系统
          this.reportToErrorSystem({
            name: 'RequestTimeout',
            message: timeoutMsg,
            level: 'warning',
            category: 'ajax'
          });
        }
      }
      
      // 执行前置处理钩子
      let finalMetric = apiMetric;
      
      if (typeof this.options.beforeSend === 'function') {
        try {
          const result = this.options.beforeSend(apiMetric);
          // 如果钩子返回了有效对象，则使用该结果
          if (result && typeof result === 'object') {
            finalMetric = result;
          } else if (result === null || result === undefined) {
            // 如果返回null或undefined，则使用原始指标
          } else {
            console.warn('beforeSend回调函数返回类型错误，应该返回APIMetric对象或undefined');
          }
        } catch (e) {
          console.error('执行beforeSend回调失败:', e);
        }
      }
      
      // 发送指标数据
      this.coreInstance.send(finalMetric);
      
      // 如果是错误请求，添加到错误系统
      if (!params.success && params.errorMessage) {
        this.reportToErrorSystem({
          name: params.status ? `HttpError_${params.status}` : 'NetworkError',
          message: params.errorMessage,
          level: params.status >= 500 ? 'error' : 'warning',
          category: 'ajax'
        });
      }
    } catch (e) {
      console.error('处理网络请求上报失败:', e);
    }
  }

  /**
   * 向错误系统上报错误
   */
  private reportToErrorSystem(errorInfo: {
    name: string;
    message: string;
    level: string;
    category: string;
  }): void {
    try {
      if (this.coreInstance.addError) {
        const err = new Error(errorInfo.message);
        err.name = errorInfo.name;
        this.coreInstance.addError(err, { 
          category: errorInfo.category,
          level: errorInfo.level
        });
      }
    } catch (e) {
      console.error('上报错误失败:', e);
    }
  }
}