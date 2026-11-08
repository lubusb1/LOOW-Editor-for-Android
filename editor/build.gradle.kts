import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// 编辑器界面仍然是 tools/web-editor 那一份（桌面 exe / 网页 / 手机 App 共用）。
// 构建期同步进 build/ 再挂成 assets，仓库里永远只有一份 editor.js —— 复制进源码树
// 迟早会出现"两份不一致"，而且改完桌面忘了同步手机，这类问题极难发现。
val editorSource: File = rootProject.file("tools/web-editor")
val editorAssetsRoot: File = layout.buildDirectory.get().asFile.resolve("generated/editorAssets")

val syncEditorAssets by tasks.registering(Sync::class) {
    from(editorSource) {
        include("index.html", "editor.js", "catalog.js", "studio.js", "studio-compile.js")
        include("mobile/**")
        include("icons/**")
    }
    into(File(editorAssetsRoot, "editor"))
}

// 发布签名与壁纸 App 共用同一把 key（同一个开发者，同一套升级链）。
// 没有 keystore.properties 时退回 debug 签名，保证 clone 下来就能构建。
val keystorePropsFile = rootProject.file("keystore.properties")
val keystoreProps = Properties().apply {
    if (keystorePropsFile.exists()) keystorePropsFile.inputStream().use { load(it) }
}
val releaseKeystore = keystoreProps.getProperty("storeFile")?.let { rootProject.file(it) }
val hasReleaseKey = releaseKeystore != null && releaseKeystore.exists()

// 缺 keystore 时不静默降级：换机器忘拷私钥的话，打出来的包能装，
// 但装完覆盖不了已发布的正式版 —— 那种问题在发布之后才会被发现。
if (!hasReleaseKey && gradle.startParameter.taskNames.any { it.contains("Release", ignoreCase = true) }) {
    logger.warn("[LOOW] 没有找到 keystore.properties（或它指向的 .jks）：本次 release 包会用 debug 签名，不能覆盖已发布的正式版。")
}

android {
    namespace = "com.loomwall.editor"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.loomwall.editor"
        minSdk = 26
        targetSdk = 35
        // 每次更新都要动这两个数（规则见 AGENTS.md「版本号」）：
        // versionCode 是 Android 判断"能不能覆盖安装"的唯一依据，必须单调递增；
        // versionName 是给人看的，小更新 +0.1，大更新 +1.0。
        versionCode = 8
        versionName = "0.3.5"
    }

    signingConfigs {
        if (hasReleaseKey) {
            create("release") {
                storeFile = releaseKeystore
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = if (hasReleaseKey) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    // 生成目录在 build/ 下，不写进源码树，也不进 git。
    sourceSets["main"].assets.srcDir(editorAssetsRoot)
}

tasks.named("preBuild") { dependsOn(syncEditorAssets) }

dependencies {
    // 零第三方依赖：WebView 是系统组件，资源服务、文件选择、分享全部用框架 API。
}