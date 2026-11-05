package com.loomwall.editor

import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.net.Uri
import android.os.ParcelFileDescriptor
import java.io.File
import java.io.FileNotFoundException

/**
 * 只读的文件出口，给 ACTION_SEND 用。
 *
 * 为什么不用 androidx.core 的 FileProvider：项目零第三方依赖。
 * 这里需要的功能就一句话——"把 cache 里的一个文件以 content:// 交给被授权的接收方"，
 * 自己实现 40 行比引一个库更划算，也避免将来有人为了它把 AndroidX 拖进整个工程。
 *
 * 安全边界：
 * - `exported=false`，外部 App 无法自行读取；
 * - 只有拿到 `FLAG_GRANT_READ_URI_PERMISSION` 的接收方（系统分享面板里的那一个）能打开；
 * - 路径段只允许纯文件名，不允许带分隔符。
 */
class ShareProvider : ContentProvider() {

    override fun onCreate(): Boolean = true

    override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor {
        val context = context ?: throw FileNotFoundException("no context")
        val name = uri.lastPathSegment ?: throw FileNotFoundException("no name")
        if (name.contains('/') || name.contains('\\') || name.contains("..")) {
            throw FileNotFoundException("bad name")
        }
        val file = File(stagingDir(context), name)
        if (!file.isFile) throw FileNotFoundException(name)
        return ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
    }

    override fun getType(uri: Uri): String = MIME

    override fun query(
        uri: Uri,
        projection: Array<out String>?,
        selection: String?,
        selectionArgs: Array<out String>?,
        sortOrder: String?
    ): Cursor? = null

    override fun insert(uri: Uri, values: ContentValues?): Uri? = null

    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int = 0

    override fun update(
        uri: Uri,
        values: ContentValues?,
        selection: String?,
        selectionArgs: Array<out String>?
    ): Int = 0

    companion object {
        const val MIME = "application/x-loow-preset"
        private const val AUTHORITY = "com.loomwall.editor.share"

        fun uriFor(name: String): Uri = Uri.parse("content://$AUTHORITY/${Uri.encode(name)}")

        fun stagingDir(context: Context): File =
            File(context.cacheDir, "share").apply { mkdirs() }

        /** 把待分享的 JSON 落到 cache，返回写入的文件；失败返回 null。 */
        fun stage(context: Context, name: String, json: String): File? = runCatching {
            val file = File(stagingDir(context), name)
            file.writeText(json, Charsets.UTF_8)
            file
        }.getOrNull()
    }
}
