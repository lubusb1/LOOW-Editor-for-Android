# AGENTS.md

给在此仓库工作的 AI 助手与贡献者的常驻约束。**这些是硬性规则，不是建议。**

## 0. 这个仓库是什么

只放 **LOOW 安卓端编辑器**（`com.loomwall.editor`）和它的界面本体 `tools/web-editor`。

壁纸引擎（渲染、壁纸库、预设解析）是**独立项目**，不在本仓库。两者之间只有一份契约：
`schema/` 里的预设 JSON 格式。编辑器产出的 JSON 必须能被引擎解析，引擎的格式变更
也要同步到这里。

## 1. 界面只有一份

所有面板、时间轴、节点工作台都在 `tools/web-editor`。构建期由 `:editor` 的
`syncEditorAssets` 复制进 `build/generated/editorAssets`，再挂成 assets。

**禁止**把 `editor.js` 等文件复制进源码树——两份副本迟早不一致，而且改完桌面忘了同步
手机，这类问题极难发现。

## 2. 不要用 `file://` 加载

必须走 `shouldInterceptRequest` 的合成源（`https://loow.local/**` → assets）。
file 协议下 localStorage / IndexedDB 会失效，草稿和图片会静默丢失。

## 3. 移动端样式只在 `html.loow-mobile` 下生效

`tools/web-editor/mobile/` 里的规则全部以 `html.loow-mobile` 为前缀。
桌面浏览器永远不会加这个类，所以改移动布局不需要回归桌面像素。

反过来说：**共用文件（index.html / studio.js）的改动必须回归桌面**，
标准是 1280×860 截图与改动前逐字节一致。

## 4. 零第三方依赖

不引入 androidx（连 FileProvider 都是自己写的 `ShareProvider`），不引入前端框架。
新增依赖必须先说服作者，而不是"顺手加上"。

## 5. 不直接写对方的沙箱

编辑器与壁纸 App 是两个安装包、两个沙箱。跨应用只走 `ACTION_SEND` +
`application/x-loow-preset` + 一次性 URI 授权，或者用户主动导出文件。

编辑器自己的工程库在 `filesDir/projects/`，那是它自己的目录，随便读写。

## 6. 格式契约

改预设结构时，同一次提交必须同时更新：

1. `schema/*.schema.json`
2. `tools/web-editor` 里对应的导出与校验逻辑
3. 版本号（`EngineVersion` 在壁纸引擎仓库，改之前先确认对方已升级）

只改一处视为未完成。`tools/validate_preset.py` 可以离线校验一份预设。

## 7. 代码约定

- Kotlin；包名 `com.loomwall.editor`。
- 注释写**为什么**，不写"这里给 x 赋值为 1"。中文注释可以，源文件统一 UTF-8。
- `.cmd` 脚本必须 **ASCII-only + CRLF**：cmd.exe 按 OEM 代码页解析批处理。
- 失败要可定位：解析错误带 JSON 路径，不静默失败。

## 8. 构建与验收

```cmd
build.cmd :editor:assembleDebug      :: debug 包
build.cmd :editor:assembleRelease    :: 正式包（需要 keystore.properties）
```

发布签名用仓库外的 keystore：根目录有 `keystore.properties` 就自动生效，
没有则退回 debug 签名。**私钥和密码绝不入库。**

验收标准：

1. 桌面浏览器打开 `tools/web-editor/index.html`，原有交互不变（截图逐字节一致）；
2. 手机 App 里同一个功能可用（必要时在 `mobile/mobile.js` 里补触屏入口）；
3. 两端产出的 `scene.json` / `interactions.json` 完全一致。

构建成功不等于功能正确：涉及交互的改动，必须说明"在什么设备上看到了什么"。

## 9. 版本号

**每次更新都要动版本号**，不要攒着。两个字段都在 `editor/build.gradle.kts`：

| 字段 | 规则 |
|---|---|
| `versionCode` | 整数，**必须单调递增**。Android 只认它判断能否覆盖安装；忘了加，用户装不上新包 |
| `versionName` | 给人看的。小更新 `+0.1`（0.2.0 → 0.3.0），大更新 `+1.0`（0.9.0 → 1.0.0） |

什么时候算大更新：改了预设格式、动了整体信息架构、或者攒了一批功能准备对外宣传。
其余（加个控件、修个 bug、调布局）都算小更新。

发版时打同名 tag（`v0.2.0`），Release 标题写 `版本号 + 一句话`。

## 10. 明确的非目标

> 本节只记录**作者本人**的决定。AI 助手不得把自己的偏好写成这里的条目：
> 有意见写进提交说明或 issue，不要写进规则文件。

- 不做商业化：无订阅、广告、内购；赞助不换特权。
- 不做 iOS。
- 不把壁纸引擎合并进本仓库（两者的节奏和体积诉求不同）。

## 11. 当前进度

- M0 骨架：模块、WebView 宿主、合成源、JS 桥、SAF 导出、分享 —— 已落地
- M1 手机信息架构：四页签（图层/属性/动画/逻辑）+ 底部抽屉 —— 已落地
- M1.5 真机触屏补丁：图层拖动把手、节点工作台抽屉化、双指缩放、安全区 —— 已落地
- M1.6 可用性：撤销/重做、本机项目库、草稿恢复、节点整理、横屏布局 —— 已落地
- M2 动画与逻辑页签细化、M3 连线手感 —— 未开始
