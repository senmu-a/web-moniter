import { Plugin } from '@senmu/types';
import { Tracker } from '@senmu/core';

/**
 * 基础插件抽象类
 */
export abstract class BasePlugin<T extends Record<string, any> = {}> implements Plugin {
  abstract name: string;
  protected coreInstance!: Tracker;
  protected options!: T;

  /**
   * 初始化插件
   */
  setUp(coreInstance: Tracker, options: T = {} as T): void {
    this.coreInstance = coreInstance;
    this.options = options;
    this.init();
  }

  /**
   * 子类需要实现的初始化方法
   */
  protected abstract init(): void;

  /**
   * 销毁插件
   */
  abstract destroy(): void;
}
