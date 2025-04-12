/**
 * 获取全局对象
 */
export const getGlobalObject = (): Window | typeof globalThis => {
  return typeof window !== 'undefined' ? window : globalThis;
};

/**
 * 安全地获取全局属性
 */
export const getGlobalProp = <T>(prop: string): T | undefined => {
  const global = getGlobalObject();
  return (global as any)[prop] as T | undefined;
};