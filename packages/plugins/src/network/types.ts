import { APIMetric } from '@senmu/types';

/**
 * 网络监控插件配置选项
 */
export interface NetworkPluginOptions {
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
  // 采样率，范围0-1
  sample?: number;
  // 是否监控 ajax 请求耗时超过阈值
  enableDurationCheck?: boolean;
  // 请求耗时阈值，单位毫秒
  durationThreshold?: number;
  // 是否开启日志追踪功能
  enableLogTrace?: boolean;
  // 是否忽略 MTSI 反爬虫的请求
  ignoreMTSIForbidRequest?: boolean;
  // 是否自动解析业务状态码
  autoBusinessCode?: boolean;
  // 解析业务状态码的方法
  parseResponse?: (response: any) => { code: number | string };
  // 资源匹配的正则表达式
  resourceReg?: RegExp;
  // 发送前的回调函数
  beforeSend?: (metric: APIMetric) => APIMetric | void | undefined;
}

/**
 * 网络请求信息接口
 */
export interface NetworkRequestInfo {
  url: string;
  method: string;
  status: number;
  businessCode?: string | number;
  requestData?: any;
  responseData?: any;
  duration: number;
  success: boolean;
  errorMessage?: string;
  httpTraceId?: string;
  type: 'xhr' | 'fetch';
}

/**
 * 默认配置
 */
export const DEFAULT_OPTIONS: NetworkPluginOptions = {
  ignoreMoniterRequest: true,
  filterUrls: [],
  includeRequest: false,
  includeResponse: false,
  maxContentLength: 10000,
  enableFetch: true,
  enableXhr: true,
  sample: 1.0,
  enableDurationCheck: false,
  durationThreshold: 2000,
  enableLogTrace: false,
  ignoreMTSIForbidRequest: true,
  autoBusinessCode: false,
  resourceReg: /^https?:\/\//i,
  parseResponse: (res) => ({ code: res?.code || res?.status || 1 })
};