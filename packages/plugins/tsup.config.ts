import { defineConfig } from 'tsup';

/**
 * web-moniter 构建配置
 * 支持 CommonJS 和 ESM 格式输出
 * 包含类型声明和代码压缩
 */
export default defineConfig({
  entry: {
    'index': 'src/index.ts',
    'performance/index': 'src/performance/index.ts',
    'js-error/index': 'src/js-error/index.ts',
    'network/index': 'src/network/index.ts',
    'network/reporter': 'src/network/reporter.ts',
    'network/types': 'src/network/types.ts'
  },
  format: ['cjs', 'esm'],
  dts: false,
  clean: true,
  sourcemap: false,
  minify: true,
  external: ["@senmu/types", "@senmu/core"],
  noExternal: ["@senmu/plugins"]
});