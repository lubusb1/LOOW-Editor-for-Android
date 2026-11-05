package com.loomwall.editor

import android.content.Context
import android.webkit.WebResourceResponse
import java.io.ByteArrayInputStream

/**
 * 把 https://loow.local/<path> 映射到 assets/editor/<path>。
 *
 * 注意：Kotlin 的块注释支持嵌套，注释里出现连续的斜杠加星号会把后面的注释结束符吞掉，
 * 所以路径通配一律写成 <path> —— 这个坑踩过一次，编译报的是「未闭合的注释」。
 *
 * 为什么不用 `file:///android_asset/index.html`：file 协议的 origin 是不透明的，
 * 编辑器依赖的 localStorage（草稿）与 IndexedDB（图片资源）在 Chromium 上会直接失效，
 * 表现为"存了等于没存、刷新后一片空白"。给页面一个真正的 https 源之后，
 * localStorage / IndexedDB / navigator.clipboard 全部正常，而且不用引入任何库。
 */
class EditorAssetHost(private val context: Context) {

    fun open(path: String): WebResourceResponse {
        val clean = path.trimStart('/').ifEmpty { "index.html" }
        // 目录穿越：虽然只有本 App 自己的页面能发请求，仍然按最小权限处理
        if (clean.contains("..")) return notFound()

        val stream = try {
            context.assets.open("editor/$clean")
        } catch (error: Exception) {
            return notFound()
        }

        val headers = HashMap<String, String>()
        // 开发期行为：改完 assets 重新构建就能看到，不要让 WebView 吃旧缓存
        headers["Cache-Control"] = "no-store"

        return WebResourceResponse(
            mimeOf(clean),
            charsetOf(clean),
            200,
            "OK",
            headers,
            stream
        )
    }

    private fun notFound(): WebResourceResponse = WebResourceResponse(
        "text/plain",
        "utf-8",
        404,
        "Not Found",
        HashMap(),
        ByteArrayInputStream("404".toByteArray())
    )

    /** 文本资源要带编码，否则中文会乱码；二进制资源必须传 null。 */
    private fun charsetOf(name: String): String? = when (extensionOf(name)) {
        "html", "js", "css", "json", "svg", "txt" -> "utf-8"
        else -> null
    }

    private fun mimeOf(name: String): String = when (extensionOf(name)) {
        "html" -> "text/html"
        "js" -> "application/javascript"
        "css" -> "text/css"
        "json" -> "application/json"
        "svg" -> "image/svg+xml"
        "png" -> "image/png"
        "jpg", "jpeg" -> "image/jpeg"
        "webp" -> "image/webp"
        "gif" -> "image/gif"
        "ico" -> "image/x-icon"
        "woff" -> "font/woff"
        "woff2" -> "font/woff2"
        else -> "application/octet-stream"
    }

    private fun extensionOf(name: String): String =
        name.substringAfterLast('.', "").lowercase()

    companion object {
        /** 页面加载用的虚拟域名；只有这个 host 会被拦截，其它一律走真实网络（目前没有）。 */
        const val HOST = "loow.local"
        const val START_URL = "https://loow.local/index.html"
    }
}
