import { BuildHook, IBuildResult, ITaskOptions } from '../@types';
import { PACKAGE_NAME } from './global';

function log(...arg: any[]) {
    return console.log(`[${PACKAGE_NAME}] `, ...arg);
}

let allAssets = [];

export const throwError: BuildHook.throwError = true;

export const load: BuildHook.load = async function() {
    console.log(`[${PACKAGE_NAME}] Load cocos plugin example in builder.`);
    allAssets = await Editor.Message.request('asset-db', 'query-assets');
};

export const onBeforeBuild: BuildHook.onBeforeBuild = async function(options: ITaskOptions, result: IBuildResult) {
    // TODO some thing
    log(`${PACKAGE_NAME}.webTestOption`, 'onBeforeBuild');
};

export const onBeforeCompressSettings: BuildHook.onBeforeCompressSettings = async function(options: ITaskOptions, result: IBuildResult) {
    // 防御：本示例插件在 extensions/ 目录里会被 Cocos 自动加载，
    // 即使没在项目设置里启用，options.packages[PACKAGE_NAME] 也可能是 undefined。
    // 另外在某些构建阶段 result 参数为 undefined，访问 result.settings 会抛 TypeError。
    // 因此整个钩子用 try/catch 保护，任何属性访问失败都安全跳过。
    // 注：dist/builder.js 的 hooks 路径已改为 ./hooks-disabled 让插件整体失效。
    try {
        const pkgOptions = options?.packages?.[PACKAGE_NAME];
        if (pkgOptions && pkgOptions.webTestOption) {
            console.debug('webTestOption', true);
        }
        if (result && (result as any).settings) {
            console.debug('get settings test', (result as any).settings);
        }
    } catch (err) {
        console.warn(`[${PACKAGE_NAME}] onBeforeCompressSettings skipped:`, err);
    }
};

export const onAfterCompressSettings: BuildHook.onAfterCompressSettings = async function(options: ITaskOptions, result: IBuildResult) {
    // Todo some thing
    console.log('webTestOption', 'onAfterCompressSettings');
};

export const onAfterBuild: BuildHook.onAfterBuild = async function(options: ITaskOptions, result: IBuildResult) {
    // change the uuid to test
    const uuidTestMap = {
        image: '57520716-48c8-4a19-8acf-41c9f8777fb0',
    };
    for (const name of Object.keys(uuidTestMap)) {
        const uuid = uuidTestMap[name];
        console.debug(`containsAsset of ${name}`, result.containsAsset(uuid));
        console.debug(`getAssetPathInfo of ${name}`, result.getAssetPathInfo(uuid));
        console.debug(`getRawAssetPaths of ${name}`, result.getRawAssetPaths(uuid));
        console.debug(`getJsonPathInfo of ${name}`, result.getJsonPathInfo(uuid));
    }
    // test onError hook
    // throw new Error('Test onError');
};

export const unload: BuildHook.unload = async function() {
    console.log(`[${PACKAGE_NAME}] Unload cocos plugin example in builder.`);
};

export const onError: BuildHook.onError = async function(options, result) {
    // Todo some thing
    console.warn(`${PACKAGE_NAME} run onError`);
};

export const onBeforeMake: BuildHook.onBeforeMake = async function(root, options) {
    console.log(`onBeforeMake: root: ${root}, options: ${options}`);
};

export const onAfterMake: BuildHook.onAfterMake = async function(root, options) {
    console.log(`onAfterMake: root: ${root}, options: ${options}`);
};
