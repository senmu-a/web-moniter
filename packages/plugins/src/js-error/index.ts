import { BasePlugin } from '../index';
import { MetricType, JSErrorMetric } from '@senmu/types';

interface JSErrorPluginOptions {
  // 是否捕获未处理的Promise错误
  enablePromiseError?: boolean;
  // 是否捕获资源加载错误
  enableResourceError?: boolean;
  // 是否捕获console.error
  captureConsoleError?: boolean;
  // 错误采样率
  errorSampleRate?: number;
}

/**
 * JS错误捕获插件
 */
export class JSErrorPlugin extends BasePlugin<JSErrorPluginOptions> {
  name = 'js-error';
  private boundHandleError!: (event: ErrorEvent) => void;
  private boundHandleUnhandledRejection!: (event: PromiseRejectionEvent) => void;
  private originalConsoleError!: typeof console.error;

  protected init(): void {
    const options = this.options;
    
    // 绑定错误处理函数（保存引用以便后续销毁时移除）
    this.boundHandleError = this.handleError.bind(this);
    this.boundHandleUnhandledRejection = this.handleUnhandledRejection.bind(this);

    // 监听全局错误
    window.addEventListener('error', this.boundHandleError, true);
    
    // 监听未处理的Promise错误
    if (options.enablePromiseError !== false) {
      window.addEventListener('unhandledrejection', this.boundHandleUnhandledRejection, true);
    }
    
    // 拦截console.error
    if (options.captureConsoleError) {
      this.hookConsoleError();
    }
  }

  destroy(): void {
    // 移除事件监听
    window.removeEventListener('error', this.boundHandleError, true);
    window.removeEventListener('unhandledrejection', this.boundHandleUnhandledRejection, true);
    
    // 恢复console.error
    if (this.originalConsoleError) {
      console.error = this.originalConsoleError;
    }
  }

  /**
   * 处理JS错误
   */
  private handleError(event: ErrorEvent): void {
    // 判断是否为资源加载错误
    if (event.target && (event.target as HTMLElement).nodeName) {
      const target = event.target as HTMLElement;
      
      // 如果配置不捕获资源错误，则跳过
      if (this.options.enableResourceError === false) {
        return;
      }

      // 处理资源加载错误
      const nodeName = target.nodeName.toLowerCase();
      if (['img', 'script', 'link', 'audio', 'video'].includes(nodeName)) {
        this.reportResourceError({
          nodeName,
          url: (target as HTMLImageElement | HTMLScriptElement).src || 
               (target as HTMLLinkElement).href || '',
          message: event.message || '资源加载失败',
          errorType: 'resource'
        });
        return;
      }
    }

    // JS运行时错误
    this.reportJSError({
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: event.error,
      errorType: 'js'
    });
  }

  /**
   * 处理未捕获的Promise错误
   */
  private handleUnhandledRejection(event: PromiseRejectionEvent): void {
    let message = 'Promise错误';
    let stack = '';
    let errorName = 'UnhandledRejection';

    if (typeof event.reason === 'string') {
      message = event.reason;
    } else if (event.reason instanceof Error) {
      const error = event.reason;
      message = error.message || '未知Promise错误';
      stack = error.stack || '';
      errorName = error.name;
    }

    this.reportJSError({
      message,
      error: event.reason,
      stack,
      name: errorName,
      errorType: 'promise'
    });
  }

  /**
   * 拦截console.error
   */
  private hookConsoleError(): void {
    // 保存原始的console.error
    this.originalConsoleError = console.error;
    
    // 替换为自定义函数
    console.error = (...args: any[]): void => {
      // 调用原始console.error
      this.originalConsoleError.apply(console, args);
      
      // 上报错误
      let message = args.map(arg => {
        if (typeof arg === 'string') return arg;
        if (arg instanceof Error) return arg.message;
        try {
          return JSON.stringify(arg);
        } catch (e) {
          return String(arg);
        }
      }).join(' ');

      let error: Error | undefined;
      if (args[0] instanceof Error) {
        error = args[0];
      }

      this.reportJSError({
        message,
        error,
        errorType: 'console'
      });
    };
  }

  /**
   * 上报JS错误
   */
  private reportJSError(params: {
    message: string;
    error?: any;
    stack?: string;
    filename?: string;
    lineno?: number;
    colno?: number;
    name?: string;
    errorType: string;
  }): void {
    // 错误采样
    const sampleRate = this.options.errorSampleRate;
    if (sampleRate !== undefined && Math.random() > sampleRate) {
      return;
    }

    const errorMetric: JSErrorMetric = {
      type: MetricType.JS_ERROR,
      message: params.message,
      name: params.name || (params.error?.name || 'Error'),
      stack: params.stack || params.error?.stack,
      errorType: params.errorType,
      filename: params.filename,
      lineno: params.lineno,
      colno: params.colno,
      timestamp: Date.now(),
      project: this.coreInstance.getConfig().project,
      pageUrl: window?.location?.href
    };

    this.coreInstance.send(errorMetric, true);
  }

  /**
   * 上报资源加载错误
   */
  private reportResourceError(params: {
    nodeName: string;
    url: string;
    message: string;
    errorType: string;
  }): void {
    this.reportJSError({
      message: `${params.nodeName} 资源加载失败: ${params.url}`,
      filename: params.url,
      errorType: params.errorType
    });
  }
}
