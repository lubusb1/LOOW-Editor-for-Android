pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "LOOW-Editor"

// 本仓库只包含编辑器 App。壁纸引擎是独立项目，它消费这里产出的预设，
// 两边通过 schema/ 里的 JSON 格式对齐，代码不共享。
include(":editor")
