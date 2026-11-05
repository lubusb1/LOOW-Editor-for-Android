package com.loomwall.editor

import android.os.Handler
import android.webkit.JavascriptInterface
import org.json.JSONObject
import java.io.File

/**
 * 页面与原生之间唯一的接口面（`window.LOOW`）。
 *
 * 约定：
 * - 所有方法都在 JavaBridge 线程被调用，**不能直接碰 UI**，一律 `main.post`。
 * - 方法名保持短且稳定，页面那边只在 `mobile/bridge.js` 里调用它们。
 * - 页面拿不到文件路径、拿不到 Intent，只能请求"导出/分享/存草稿"这三种动作。
 */
class EditorBridge(
    private val activity: EditorActivity,
    private val main: Handler
) {

    private val version: String by lazy {
        runCatching {
            activity.packageManager.getPackageInfo(activity.packageName, 0).versionName
        }.getOrNull() ?: "?"
    }

    @JavascriptInterface
    fun appInfo(): String = JSONObject()
        .put("platform", "android")
        .put("app", "LOOW 编辑器")
        .put("version", version)
        .put("api", android.os.Build.VERSION.SDK_INT)
        .toString()

    @JavascriptInterface
    fun toast(text: String) {
        main.post { activity.toast(text) }
    }

    /** 导出到用户选的位置（SAF）。返回 true 只表示"已弹出保存器"，结果由原生 toast 告知。 */
    @JavascriptInterface
    fun exportFile(json: String, name: String): Boolean {
        main.post { activity.requestExport(json, name) }
        return true
    }

    /** 直接发给壁纸 App（ACTION_SEND），省掉"存文件→去文件管理器→再导入"。 */
    @JavascriptInterface
    fun shareToWallpaper(json: String, name: String): Boolean {
        main.post { activity.requestShare(json, name) }
        return true
    }

    /**
     * 草稿兜底落盘。
     *
     * 为什么需要：WebView 的 localStorage/IndexedDB 会被"清理缓存"或系统空间回收抹掉，
     * 而用户眼里的草稿是"我做到一半的作品"。这里存到 App 私有目录，清缓存也不会丢。
     */
    @JavascriptInterface
    fun saveDraft(json: String): Boolean = runCatching {
        val dir = File(activity.filesDir, "drafts").apply { mkdirs() }
        File(dir, "current.json").writeText(json, Charsets.UTF_8)
        true
    }.getOrDefault(false)

    @JavascriptInterface
    fun loadDraft(): String = runCatching {
        val file = File(File(activity.filesDir, "drafts"), "current.json")
        if (file.isFile) file.readText(Charsets.UTF_8) else ""
    }.getOrDefault("")

    @JavascriptInterface
    fun openWallpaperApp(): Boolean {
        var ok = false
        main.post { ok = activity.openWallpaperApp() }
        return ok
    }

    // ---------------------------------------------------------------- 项目库
    //
    // 为什么要有自己的项目库：编辑器是独立 App，读不到壁纸 App 的沙箱。
    // 之前"保存"只把预设分享出去，再想改就得去壁纸 App 导出文件、再导回来，
    // 往返是断的。这里在编辑器自己的私有目录里留一份工程，随时能重新打开。

    @JavascriptInterface
    fun listProjects(): String = runCatching {
        val dir = projectsDir()
        val items = dir.listFiles { file -> file.isFile && file.name.endsWith(".json") }
            ?.mapNotNull { file ->
                val id = file.name.removeSuffix(".json")
                // 名字单独存一个小文件：直接解析 bundle 的话，图片资源动辄几 MB，
                // 列表里每一项都读全文件太浪费；截断 JSON 又解析不了（之前就是这么错的）。
                val name = runCatching { File(dir, id + ".name").readText(Charsets.UTF_8).trim() }
                    .getOrNull().orEmpty().ifBlank { id }
                JSONObject()
                    .put("id", id)
                    .put("name", name)
                    .put("updated", file.lastModified())
                    .put("bytes", file.length())
            }
            ?.sortedByDescending { it.optLong("updated") }
            .orEmpty()
        org.json.JSONArray(items).toString()
    }.getOrDefault("[]")

    @JavascriptInterface
    fun saveProject(json: String, name: String): String = runCatching {
        val dir = projectsDir()
        val id = "p" + System.currentTimeMillis()
        File(dir, id + ".json").writeText(json, Charsets.UTF_8)
        runCatching { File(dir, id + ".name").writeText(name.ifBlank { id }, Charsets.UTF_8) }
        id
    }.getOrDefault("")

    @JavascriptInterface
    fun loadProject(id: String): String = runCatching {
        val file = File(projectsDir(), safeId(id) + ".json")
        if (file.isFile) file.readText(Charsets.UTF_8) else ""
    }.getOrDefault("")

    @JavascriptInterface
    fun deleteProject(id: String): Boolean = runCatching {
        val safe = safeId(id)
        File(projectsDir(), safe + ".name").delete()
        File(projectsDir(), safe + ".json").delete()
    }.getOrDefault(false)

    private fun projectsDir(): File = File(activity.filesDir, "projects").apply { mkdirs() }

    /** 只允许纯文件名：id 来自页面，不能带路径分隔符。 */
    private fun safeId(raw: String): String =
        raw.filter { it.isLetterOrDigit() || it == '-' || it == '_' }.take(40).ifEmpty { "unknown" }
}
