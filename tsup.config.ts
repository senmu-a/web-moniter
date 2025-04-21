import { defineConfig } from 'tsup';
import { readFileSync } from 'fs';
import { join } from 'path';

// 获取当前包的 package.json
const pkg = JSON.parse(
  readFileSync(join(process.cwd(), 'package.json'), 'utf-8')
);

// 导出 tsup 配置
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  target: 'es2020',
  splitting: false,
  sourcemap: true,
  clean: true,
  dts: true,
  minify: process.env.NODE_ENV === 'production',
  treeshake: true,
  external: Object.keys({
    ...pkg.dependencies,
    ...pkg.peerDependencies,
  }).filter(dep => !dep.startsWith('@senmu/')),
  esbuildOptions(options) {
    // 确保保留 CSS 等资源
    options.loader = {
      '.svg': 'dataurl',
      '.png': 'dataurl',
      '.jpg': 'dataurl',
      '.css': 'text',
    };
  },
  onSuccess: 'tsc --emitDeclarationOnly --declaration',
});