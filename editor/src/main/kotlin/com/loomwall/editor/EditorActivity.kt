package com.loomwall.editor

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast

/**
 * 编辑器 App 的唯一 Activity：一个 WebView 宿主。
 *
 * 设计取舍：
 * - **界面只有一份**。所有面板、时间轴、节点工作台都是 `tools/web-editor` 里的那套
 *   HTML/JS，构建期同步进 assets。手机端要改布局就在 CSS/JS 里改，桌面端能同步受益；
 *   一旦在这里用原生重写，就变成"两套编辑器、四份语义"，长期必然漂移。
 * - **不给页面联网**。资源全部由 [EditorAssetHost] 从 assets 喂进去，一次网络请求都没有。
 * - 旋转不重建（见 manifest 的 configChanges），靠 CSS 断点重排，避免 WebView 重载丢编辑状态。
 */
class EditorActivity : Activity() {

    private lateinit var web: WebView
    private lateinit var assets: EditorAssetHost
    private lateinit var bridge: EditorBridge
    private val main = Handler(Looper.getMainLooper())

    /** 网页里 4 个 `input[type=file]` 共用的回调，同一时刻只能有一个。 */
    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null

    /** SAF 保存：等系统文件选择器回来再写内容。 */
    private var pendingExport: PendingExport? = null

    private data class PendingExport(val name: String, val json: String)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        assets = EditorAssetHost(this)
        bridge = EditorBridge(this, main)

        // 编辑一张壁纸常常要盯着看效果，熄屏打断很烦
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        web = WebView(this).apply {
            setBackgroundColor(0xFF070A0D.toInt())
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                // 页面不读本地文件、不读 content://，减少攻击面
                allowFileAccess = false
                allowContentAccess = false
                mediaPlaybackRequiresUserGesture = false
                // 触摸时不弹放大镜/文字选择，画布拖动才跟手
                setSupportZoom(false)
                builtInZoomControls = false
                displayZoomControls = false
            }
            webViewClient = EditorClient()
            webChromeClient = EditorChrome()
            addJavascriptInterface(bridge, "LOOW")
            setDownloadListener { _, _, _, _, _ ->
                // blob: 下载在 WebView 里根本不会走到这里（DownloadListener 只认 http/https）。
                // 真正的保存路径是 JS 桥的 exportFile()，这里只兜底提示。
                toast("请用顶栏的「保存」按钮导出")
            }
        }

        // 真机调试用：电脑上 chrome://inspect 可以直接看 console（tools/web-editor/cdp.mjs 同源思路）
        if (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0) {
            WebView.setWebContentsDebuggingEnabled(true)
        }

        setContentView(web)
        web.loadUrl(EditorAssetHost.START_URL)
    }

    // ---------------------------------------------------------------- WebView 回调

    private inner class EditorClient : WebViewClient() {

        override fun shouldInterceptRequest(
            view: WebView?,
            request: WebResourceRequest?
        ): WebResourceResponse? {
            val url = request?.url ?: return null
            if (url.host != EditorAssetHost.HOST) return null
            return assets.open(url.path ?: "/")
        }

        /**
         * 只允许留在编辑器自己的虚拟域名里。
         *
         * 为什么这么严：页面里有用户粘贴进来的 SVG / 文本内容，一旦能导航到外部站点，
         * 就等于把一个不受控的网页塞进了带 JS 桥的 WebView。
         */
        override fun shouldOverrideUrlLoading(
            view: WebView?,
            request: WebResourceRequest?
        ): Boolean {
            val url = request?.url ?: return true
            return url.host != EditorAssetHost.HOST
        }

        override fun onReceivedError(
            view: WebView?,
            request: WebResourceRequest?,
            error: android.webkit.WebResourceError?
        ) {
            // 资源缺失时给出可定位的信息，而不是留一块黑屏
            Log.w(TAG, "资源加载失败：${request?.url} ${error?.description}")
        }
    }

    private inner class EditorChrome : WebChromeClient() {

        override fun onShowFileChooser(
            view: WebView?,
            callback: ValueCallback<Array<Uri>>?,
            params: FileChooserParams?
        ): Boolean {
            fileChooserCallback?.onReceiveValue(null)
            fileChooserCallback = callback

            // accept 可能是 ".json,application/json" 或 "image/png,image/jpeg,..." 这种混合串，
            // 直接塞进 ACTION_OPEN_DOCUMENT 会被系统判成无效类型，所以在这里归一化。
            val accepts = params?.acceptTypes?.toList().orEmpty()
            val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type = normalizeMime(accepts)
            }
            return try {
                startActivityForResult(intent, REQUEST_PICK_FILE)
                true
            } catch (error: ActivityNotFoundException) {
                fileChooserCallback = null
                toast("没有可用的文件选择器")
                false
            }
        }

        override fun onConsoleMessage(message: android.webkit.ConsoleMessage?): Boolean {
            Log.d(TAG, "[web] ${message?.message()} (${message?.sourceId()}:${message?.lineNumber()})")
            return true
        }
    }

    private fun normalizeMime(accepts: List<String>): String {
        val joined = accepts.joinToString(",")
        return when {
            joined.contains("image/") -> "image/*"
            joined.contains("json") -> "application/json"
            joined.contains("svg") -> "image/svg+xml"
            else -> "*/*"
        }
    }

    // ---------------------------------------------------------------- 文件与分享

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        val uri = data?.data
        when (requestCode) {
            REQUEST_PICK_FILE -> {
                val callback = fileChooserCallback
                fileChooserCallback = null
                callback?.onReceiveValue(
                    if (resultCode == RESULT_OK && uri != null) arrayOf(uri) else null
                )
            }

            REQUEST_CREATE_DOC -> {
                val pending = pendingExport
                pendingExport = null
                if (resultCode != RESULT_OK || uri == null || pending == null) return
                Thread {
                    val ok = runCatching {
                        contentResolver.openOutputStream(uri)?.use { out ->
                            out.write(pending.json.toByteArray(Charsets.UTF_8))
                            out.flush()
                        } != null
                    }.getOrDefault(false)
                    main.post { toast(if (ok) "已保存 ${pending.name}" else "保存失败") }
                }.start()
            }
        }
    }

    /** 由 JS 桥调用：弹系统文件保存器。 */
    fun requestExport(json: String, name: String) {
        val safe = safeFileName(name)
        pendingExport = PendingExport(safe, json)
        val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "application/json"
            putExtra(Intent.EXTRA_TITLE, safe)
        }
        try {
            startActivityForResult(intent, REQUEST_CREATE_DOC)
        } catch (error: ActivityNotFoundException) {
            pendingExport = null
            toast("没有可用的文件保存器")
        }
    }

    /**
     * 由 JS 桥调用：把预设直接交给壁纸 App（ACTION_SEND）。
     *
     * 为什么走分享而不是写对方目录：两个 App 是不同的沙箱，没有共享存储权限。
     * 分享 + 一次性 URI 授权是唯一不需要额外权限、也不需要对方常驻服务的通路。
     */
    fun requestShare(json: String, name: String) {
        val safe = safeFileName(name)
        val file = ShareProvider.stage(this, safe, json) ?: run {
            toast("分享失败：无法写入临时文件")
            return
        }
        val uri = ShareProvider.uriFor(safe)
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = ShareProvider.MIME
            putExtra(Intent.EXTRA_STREAM, uri)
            putExtra(Intent.EXTRA_TITLE, safe)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        val chooser = Intent.createChooser(intent, "发送到壁纸 App").apply {
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        try {
            startActivity(chooser)
            toast("已发送，回到 LOOW 壁纸确认")
        } catch (error: ActivityNotFoundException) {
            toast("没有可接收的 App")
        }
        // 文件留在 cache/share 里由系统回收，不主动删——接收方可能稍后才读
        Log.i(TAG, "分享预设：${file.name} (${json.length} 字符)")
    }

    fun openWallpaperApp(): Boolean {
        val intent = packageManager.getLaunchIntentForPackage(WALLPAPER_PACKAGE) ?: return false
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        return runCatching { startActivity(intent); true }.getOrDefault(false)
    }

    private fun safeFileName(raw: String): String {
        val trimmed = raw.trim().ifEmpty { "我的壁纸" }
        val cleaned = trimmed.replace(Regex("[\\\\/:*?\"<>|\\n\\r\\t]"), "_").take(60)
        return if (cleaned.endsWith(".json")) cleaned else "$cleaned.lwpkit.json"
    }

    fun toast(message: String) {
        if (isFinishing) return
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
    }

    // ---------------------------------------------------------------- 生命周期

    /**
     * 返回键先问页面：节点工作台、底部抽屉、各种弹窗都开着的时候，
     * 用户期望的是"退一层"，而不是直接退出编辑器。
     */
    @Deprecated("系统 API，项目没有 AndroidX 的 OnBackPressedDispatcher")
    override fun onBackPressed() {
        web.evaluateJavascript(
            "(function(){try{return !!(window.LOOW_ANDROID_BACK && window.LOOW_ANDROID_BACK());}catch(e){return false;}})()"
        ) { result ->
            if (result != "true") {
                if (web.canGoBack()) web.goBack() else finish()
            }
        }
    }

    override fun onResume() {
        super.onResume()
        web.onResume()
        web.resumeTimers()
    }

    override fun onPause() {
        web.onPause()
        web.pauseTimers()
        super.onPause()
    }

    override fun onDestroy() {
        fileChooserCallback?.onReceiveValue(null)
        fileChooserCallback = null
        (web.parent as? ViewGroup)?.removeView(web)
        web.destroy()
        super.onDestroy()
    }

    companion object {
        private const val TAG = "LOOW.Editor"
        private const val REQUEST_PICK_FILE = 2001
        private const val REQUEST_CREATE_DOC = 2002
        private const val WALLPAPER_PACKAGE = "com.loomwall.wallpaper"
    }
}
