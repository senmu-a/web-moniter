import { defineConfig } from "tsup";

/**
 * web-moniter 构建配置
 * 支持 CommonJS 和 ESM 格式输出
 * 包含类型声明和代码压缩
 */
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  clean: true,
  sourcemap: false,
  minify: true,
});
