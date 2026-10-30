/**
 * 类型检查专用 shim（不参与打包，只在 tsc 检查时使用）。
 *
 * 为什么需要它：Cocos 工程的实际运行环境（JSB / 微信小游戏 / 浏览器）都有全局 console、
 * 定时器等 API，但 cc 引擎的 .d.ts 里没有声明它们。如果为了拿到这些声明而打开 DOM lib，
 * 又会引入 DOM 的全局 `Node` 接口，与 cc 的 `Node` 类冲突 → 满屏假报错。
 * 所以这里手动补一份最小声明。
 */
declare var console: {
    log(...data: any[]): void;
    info(...data: any[]): void;
    warn(...data: any[]): void;
    error(...data: any[]): void;
    debug(...data: any[]): void;
};

declare function setTimeout(handler: (...args: any[]) => void, timeout?: number, ...args: any[]): any;
declare function clearTimeout(id: any): void;
declare function setInterval(handler: (...args: any[]) => void, timeout?: number, ...args: any[]): any;
declare function clearInterval(id: any): void;
