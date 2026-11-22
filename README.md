# dsh-screenshot — DSH 截图插件 / Screenshot Plugin for DeepSeek Harness

在 DeepSeek Harness 对话框下方添加一个剪刀按钮：点击（或按全局快捷键 Alt+A）即可框选截图，图片直接进入剪贴板，支持跨多个显示器选取。/ Adds a scissors button below the DSH chat composer: click it (or press Alt+A) to snip a region across multiple monitors — the capture goes straight to your clipboard.

![icon](icon.svg)

## ✨ 功能 / Features

- 拖拽框选 + 起终点点选两种模式 / Drag-box or click-two-corners selection
- 跨屏截图（覆盖所有显示器的虚拟桌面）/ Cross-monitor capture (virtual-desktop overlay)
- 可自定义全局快捷键，默认 Alt+A / Configurable global hotkey, Alt+A by default
- 截图直入剪贴板，`Ctrl+V` 即贴 / Straight to the clipboard
- 右键按钮打开设置 / Right-click the button for settings
- 纯本地运行，不上传数据 / Fully local, nothing leaves your machine

## 📦 安装 / Install

**市场安装（推荐）/ Market install (recommended):** 在 DSH 插件页「发现」标签添加索引 / add this index URL in the Discover tab:

```
https://raw.githubusercontent.com/xypshot/dsh-screenshot/main/market/index.json
```

然后搜索「截图 / Screenshot」安装。/ Then search "截图 / Screenshot" and install.

**手动安装 / Manual:** 在 DSH 会话中对助手说 / tell your DSH assistant:

```
用 plugin_manager 安装 git+https://github.com/xypshot/dsh-screenshot.git#<commit>
```

## 📋 要求 / Requirements

- Windows 10/11（PowerShell 5.1 + WinForms，系统自带）
- DeepSeek Harness 0.2.0+

详细说明见 [中文文档](docs/detail.zh.md) / Full details in the [English doc](docs/detail.en.md).

## 📖 市场索引维护 / Market Index Maintenance

`market/index.json` 由 `market/gen-index.mjs` 生成。发新版：改 `package.json` 的 `version` → 提交 → 运行 `node market/gen-index.mjs https://github.com/xypshot/dsh-screenshot` → 提交索引 → 推送。

## 🔒 隐私 / Privacy

截图在本地原生进程完成，仅写入剪贴板。/ Captures run natively and only touch your clipboard.

## License

MIT
