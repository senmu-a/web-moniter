#!/usr/bin/env node

import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { Command } from 'commander';
import inquirer from 'inquirer';

// 获取当前文件的目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 获取所有子包
const packagesDir = path.join(__dirname, '../packages');
const packages = fs.readdirSync(packagesDir)
  .filter(dir => fs.statSync(path.join(packagesDir, dir)).isDirectory());

// 定义用户取消错误类型
class UserCancelError extends Error {
  constructor(message = '操作已被用户取消') {
    super(message);
    this.name = 'UserCancelError';
  }
}

// 处理SIGINT信号（如用户按Ctrl+C）
process.on('SIGINT', () => {
  console.log('\n\n操作已被用户取消 👋');
  process.exit(0);  // 干净地退出，状态码为0表示正常退出
});

// 通用的子进程执行函数
function runCommand(command, args, cwd = process.cwd()) {
  return new Promise((resolve, reject) => {
    console.log(`执行命令: ${command} ${args.join(' ')}`);
    
    const proc = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      shell: process.platform === 'win32'
    });

    proc.on('close', code => {
      if (code !== 0) {
        reject(new Error(`命令执行失败，退出码: ${code}`));
        return;
      }
      resolve();
    });

    // 处理子进程被终止的情况
    proc.on('error', (err) => {
      if (err.code === 'SIGINT') {
        // 用户取消的情况，不显示错误
        reject(new UserCancelError());
      } else {
        reject(err);
      }
    });
  });
}

// 构建单个包
async function buildPackage(packageName) {
  const packagePath = path.join(packagesDir, packageName);
  console.log(`\n🚀 正在构建包: ${packageName}...`);
  
  // 设置生产环境变量
  process.env.NODE_ENV = 'production';
  
  try {
    // 清理之前的构建产物
    await runCommand('pnpm', ['run', 'clean'], packagePath);
    
    // 构建包
    await runCommand('pnpm', ['run', 'build'], packagePath);
    
    console.log(`\n✅ 包 ${packageName} 构建成功`);
    return true;
  } catch (err) {
    if (err instanceof UserCancelError) {
      console.log(`\n${err.message}`);
    } else {
      console.error(`构建包 ${packageName} 时出错:`, err);
    }
    throw err;
  }
}

// 构建所有包
async function buildAllPackages() {
  console.log('\n🚀 正在按依赖顺序构建所有包...');
  
  try {
    // 设置生产环境变量
    process.env.NODE_ENV = 'production';
    
    // 清理所有构建产物
    await runCommand('pnpm', ['run', 'clean']);
    
    // 使用 pnpm 构建所有包 (会按照依赖顺序)
    await runCommand('pnpm', ['run', 'build']);
    
    console.log('\n✅ 所有包构建成功!');
  } catch (err) {
    if (err instanceof UserCancelError) {
      console.log(`\n${err.message}`);
    } else {
      console.error('\n❌ 构建失败:', err);
    }
  }
}

// 清理构建产物
async function cleanPackages() {
  console.log('\n🧹 正在清理所有构建产物...');
  
  try {
    await runCommand('pnpm', ['run', 'clean']);
    console.log('\n✅ 清理完成!');
  } catch (err) {
    if (err instanceof UserCancelError) {
      console.log(`\n${err.message}`);
    } else {
      console.error('\n❌ 清理失败:', err);
    }
  }
}

// 发布包
async function publishPackages() {
  console.log('\n📦 准备发布包...');
  console.log('发布前检查:');
  
  try {
    // 验证 git 工作区是否干净
    try {
      execSync('git diff-index --quiet HEAD --', { stdio: 'inherit' });
    } catch (err) {
      console.error('\n❌ Git 工作区不干净，请先提交或暂存更改');
      return;
    }
    
    // 检查是否登录到 npm
    try {
      execSync('npm whoami', { stdio: 'pipe' });
    } catch (err) {
      console.error('\n❌ 未登录到 npm，请先运行 "npm login"');
      return;
    }
    
    console.log('✅ 前置检查通过');
    
    // 构建所有包
    console.log('\n🔨 构建所有包...');
    await buildAllPackages();
    
    // 询问是否继续发布
    let confirmPublish;
    try {
      const answers = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmPublish',
          message: '确认要发布所有包吗?',
          default: false
        }
      ]);
      confirmPublish = answers.confirmPublish;
    } catch (err) {
      // inquirer抛出的错误可能是用户取消了输入
      throw new UserCancelError();
    }
    
    if (!confirmPublish) {
      console.log('已取消发布');
      return;
    }
    
    try {
      // 使用 lerna 发布
      await runCommand('pnpm', ['lerna', 'publish', 'from-package']);
      console.log('\n✅ 发布成功!');
    } catch (err) {
      if (err instanceof UserCancelError) {
        console.log(`\n${err.message}`);
      } else {
        console.error('\n❌ 发布失败:', err);
      }
    }
  } catch (err) {
    if (err instanceof UserCancelError) {
      console.log(`\n${err.message}`);
    } else {
      console.error('\n❌ 发布准备失败:', err);
    }
  }
}

// 更新版本
async function versionPackages() {
  console.log('\n🔖 准备更新版本...');
  
  try {
    // 验证 git 工作区是否干净
    try {
      execSync('git diff-index --quiet HEAD --', { stdio: 'inherit' });
    } catch (err) {
      console.error('\n❌ Git 工作区不干净，请先提交或暂存更改');
      return;
    }
    
    // 选择版本类型
    let versionType;
    try {
      const answers = await inquirer.prompt([
        {
          type: 'list',
          name: 'versionType',
          message: '请选择版本类型:',
          choices: [
            { name: 'patch (修复，如 1.0.0 -> 1.0.1)', value: 'patch' },
            { name: 'minor (特性，如 1.0.0 -> 1.1.0)', value: 'minor' },
            { name: 'major (重大，如 1.0.0 -> 2.0.0)', value: 'major' },
            { name: 'premajor (预发布，如 1.0.0 -> 2.0.0-alpha.0)', value: 'premajor' },
            { name: '自定义版本号', value: 'custom' }
          ]
        }
      ]);
      versionType = answers.versionType;
    } catch (err) {
      // inquirer抛出的错误可能是用户取消了输入
      throw new UserCancelError();
    }
    
    if (versionType === 'custom') {
      let customVersion;
      try {
        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'customVersion',
            message: '请输入自定义版本号:',
            validate: input => input.trim() !== '' || '版本号不能为空'
          }
        ]);
        customVersion = answers.customVersion;
      } catch (err) {
        // inquirer抛出的错误可能是用户取消了输入
        throw new UserCancelError();
      }
      
      try {
        await runCommand('pnpm', ['lerna', 'version', customVersion, '--yes']);
        console.log('\n✅ 版本更新成功!');
      } catch (err) {
        if (err instanceof UserCancelError) {
          console.log(`\n${err.message}`);
        } else {
          console.error('\n❌ 版本更新失败:', err);
        }
      }
    } else {
      try {
        console.log(`正在更新所有包版本 (${versionType})...`);
        await runCommand('pnpm', ['lerna', 'version', versionType, '--yes']);
        console.log('\n✅ 版本更新成功!');
      } catch (err) {
        if (err instanceof UserCancelError) {
          console.log(`\n${err.message}`);
        } else {
          console.error('\n❌ 版本更新失败:', err);
        }
      }
    }
  } catch (err) {
    if (err instanceof UserCancelError) {
      console.log(`\n${err.message}`);
    } else {
      console.error('\n❌ 版本更新准备失败:', err);
    }
  }
}

// 构建单个包的选择界面
async function selectAndBuildPackage() {
  let selectedPackage;
  try {
    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedPackage',
        message: '请选择要构建的包:',
        choices: packages.map(pkg => ({ name: pkg, value: pkg }))
      }
    ]);
    selectedPackage = answers.selectedPackage;
  } catch (err) {
    // inquirer抛出的错误可能是用户取消了输入
    throw new UserCancelError();
  }
  
  try {
    await buildPackage(selectedPackage);
  } catch (err) {
    if (err instanceof UserCancelError) {
      console.log(`\n${err.message}`);
    } else {
      console.error(`\n❌ 包 ${selectedPackage} 构建失败:`, err);
    }
  }
}

// 创建 commander 命令
const program = new Command();

program
  .name('web-moniter-cli')
  .description('Web Moniter SDK 构建发布工具')
  .version('1.0.0');

// 没有命令参数时显示主菜单
program
  .action(async () => {
    try {
      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: '请选择操作:',
          choices: [
            { name: '构建单个包', value: 'buildSingle' },
            { name: '构建所有包', value: 'buildAll' },
            { name: '发布包', value: 'publish' },
            { name: '清理构建产物', value: 'clean' },
            { name: '发布新版本', value: 'version' },
            { name: '退出', value: 'exit' }
          ]
        }
      ]);
      
      switch (action) {
        case 'buildSingle':
          await selectAndBuildPackage();
          break;
        case 'buildAll':
          await buildAllPackages();
          break;
        case 'publish':
          await publishPackages();
          break;
        case 'clean':
          await cleanPackages();
          break;
        case 'version':
          await versionPackages();
          break;
        case 'exit':
          console.log('\n再见! 👋');
          process.exit(0);
          break;
      }
    } catch (err) {
      if (err instanceof UserCancelError) {
        console.log(`\n${err.message}`);
        process.exit(0); // 用户主动取消，干净退出
      }
    }
  });

// 添加子命令
program
  .command('build')
  .description('构建单个包或所有包')
  .option('-a, --all', '构建所有包')
  .option('-p, --package <package>', '构建指定的包')
  .action(async (options) => {
    try {
      if (options.all) {
        await buildAllPackages();
      } else if (options.package) {
        if (packages.includes(options.package)) {
          await buildPackage(options.package);
        } else {
          console.error(`\n❌ 未找到包: ${options.package}`);
          console.log('可用的包:', packages.join(', '));
        }
      } else {
        await selectAndBuildPackage();
      }
    } catch (err) {
      if (err instanceof UserCancelError) {
        console.log(`\n${err.message}`);
        process.exit(0); // 用户主动取消，干净退出
      }
    }
  });

program
  .command('clean')
  .description('清理构建产物')
  .action(cleanPackages);

program
  .command('publish')
  .description('发布包')
  .action(publishPackages);

program
  .command('version')
  .description('更新版本号')
  .action(versionPackages);

// 解析命令行参数
program.parse();