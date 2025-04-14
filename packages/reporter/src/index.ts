import { 
  MetricData, 
  MoniterConfig, 
  Reporter as ReporterInterface 
} from '@senmu/types';

/**
 * 默认上报配置
 */
const DEFAULT_REPORTER_CONFIG: Partial<MoniterConfig> = {
  reportImmediately: false,
  // 最大缓存数量
  maxCache: 50
};

/**
 * HTTP 上报器
 */
export class Reporter implements ReporterInterface {
  private config: MoniterConfig;
  private isSending: boolean;
  private destroyed: boolean;

  constructor(config: MoniterConfig) {
    this.config = { ...DEFAULT_REPORTER_CONFIG, ...config };
    this.isSending = false;
    this.destroyed = false;
  }

  /**
   * 发送数据
  */
  async send(data: MetricData | MetricData[], immediately = false) {
    if (this.destroyed) {
      console.warn('[web-moniter] 上报器已销毁，无法发送数据');
      return;
    }

    if (!this.config.reportUrl) {
      console.error('[web-moniter] 未配置上报URL，无法上报数据');
      return;
    }

    const metrics = Array.isArray(data) ? data : [data];
    if (metrics.length === 0) {
      return;
    }

    // 根据是否立即上报决定使用哪种上报方式
    if (immediately || this.config.reportImmediately) {
      return this.sendImmediate(metrics);
    } else {
      return this.sendBeacon(metrics);
    }
  }

  /**
   * 立即上报（XMLHttpRequest）
   * @private
  */
  private async sendImmediate(metrics: MetricData[]) {
    if (this.isSending) {
      console.warn('[web-moniter] 正在上报数据，请稍后再试');
      return;
    }

    this.isSending = true;

    try {
      const response = await fetch(this.config.reportUrl!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.config.headers
        },
        body: JSON.stringify(metrics),
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`上报失败: ${response.status} ${response.statusText}`);
      }

      if (this.config.debug) {
        console.log('[web-moniter] 数据上报成功', metrics);
      }
    } catch (err) {
      console.error('[web-moniter] 上报数据失败', err);
      throw err;
    } finally {
      this.isSending = false;
    }
  }

  /**
   * 使用 Beacon API 上报（不阻塞页面卸载）
   * @private
   */
  private async sendBeacon(metrics: MetricData[]) {
    if (typeof navigator.sendBeacon !== 'function') {
      return this.sendImage(metrics);
    }

    const blob = new Blob([JSON.stringify(metrics)], {
      type: 'application/json'
    });

    const success = navigator.sendBeacon(this.config.reportUrl!, blob);
    
    if (!success) {
      console.warn('[web-moniter] Beacon API上报失败，尝试使用图片上报');
      return this.sendImage(metrics);
    }

    if (this.config.debug) {
      console.log('[web-moniter] Beacon API数据上报成功', metrics);
    }
  }

  /**
   * 使用图片方式上报（兼容性最好）
   * @private
   */
  private async sendImage(metrics: MetricData[]) {
    try {
      const data = encodeURIComponent(JSON.stringify(metrics));
      const img = new Image();
      img.src = `${this.config.reportUrl}/1x1.gif?data=${data}`;
      
      if (this.config.debug) {
        console.log('[web-moniter] 图片上报成功', metrics);
      }
    } catch (err) {
      console.error('[web-moniter] 图片上报失败', err);
      throw err;
    }
  }

  /**
   * 设置配置
   */
  setConfig(config: Partial<MoniterConfig>) {
    this.config = { ...this.config, ...config };
  }

  /**
   * 销毁上报器
   */
  destroy() {
    this.destroyed = true;
  }
}

/**
 * 创建一个新的上报器实例
 */
export function createReporter(config: MoniterConfig): Reporter {
  return new Reporter(config);
}
