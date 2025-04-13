/**
 * 生成追踪ID
 */
export function generateTraceId(): string {
  return Date.now().toString(16) + Math.random().toString(16).slice(2);
}

/**
 * 获取完整URL
 */
export function getFullUrl(url: string): string {
  if (!url) return '';
  
  try {
    // 相对路径转换为绝对路径
    if (url.startsWith('/')) {
      return window.location.origin + url;
    }
    
    // 已经是绝对路径
    if (/^https?:\/\//i.test(url)) {
      return url;
    }
    
    // 其他情况，基于当前页面路径
    const base = window.location.href.split('/').slice(0, -1).join('/');
    return `${base}/${url}`;
  } catch (e) {
    return url;
  }
}

/**
 * 检查是否为同源请求
 */
export function checkSameOrigin(url: string, origin: string): boolean {
  try {
    return new URL(url).origin === origin;
  } catch (e) {
    return false;
  }
}

/**
 * 安全解析JSON
 */
export function safeJsonParse(text: string): any {
  try {
    return JSON.parse(text);
  } catch (e) {
    return text;
  }
}

/**
 * 获取连接类型
 */
export function getConnectTypeByUrl(url: string): string {
  try {
    const protocol = new URL(url).protocol;
    if (protocol === 'https:') return 'https';
    if (protocol === 'http:') return 'http';
    return protocol.replace(':', '');
  } catch (e) {
    return '';
  }
}

/**
 * 提取请求/响应内容
 */
export function extractContent(content: any, maxLength: number = 10000): any {
  if (!content) {
    return undefined;
  }
  
  // 处理FormData
  if (content instanceof FormData) {
    try {
      const formData: Record<string, any> = {};
      content.forEach((value, key) => {
        formData[key] = value instanceof File ? 
          `[File] name: ${value.name}, size: ${value.size}` : value;
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
  
  // 处理ArrayBuffer
  if (content instanceof ArrayBuffer) {
    return `[ArrayBuffer] size: ${content.byteLength}`;
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
      const stringified = JSON.stringify(content);
      const truncated = stringified.length > maxLength ? 
        stringified.substr(0, maxLength) + '...' : stringified;
      return JSON.parse(truncated);
    } catch (e) {
      return '[Object]';
    }
  }
  
  return String(content);
}

/**
 * 检查是否为反爬虫请求
 */
export function isMTSIForbidRequest(type: 'xhr' | 'fetch', info: any, shouldIgnore: boolean = true): boolean {
  if (!shouldIgnore) {
    return false;
  }

  if (type === 'xhr') {
    return Boolean(
      info.status === 403 && 
      typeof info.getAllResponseHeaders === 'function' &&
      info.getAllResponseHeaders().includes('x-forbid-reason')
    );
  } else if (type === 'fetch') {
    return Boolean(info.xForbidReason && info.status === 403);
  }

  return false;
}