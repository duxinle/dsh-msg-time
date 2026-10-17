# 装到 profile 的步骤（片段，不要整体覆盖 profile 的配置）

目标 profile：`C:\Users\13080\.dsh\profiles\desktop`

## 1. 放包

```powershell
$lp = 'C:\Users\13080\.dsh\profiles\desktop\local-plugins\dsh-msg-time'
New-Item -ItemType Directory -Path $lp -Force | Out-Null
Copy-Item 'C:\Users\13080\Documents\deepseek-harness\default-workspace\dsh-msg-time\package.json' $lp -Force
Copy-Item 'C:\Users\13080\Documents\deepseek-harness\default-workspace\dsh-msg-time\index.js'   $lp -Force
Copy-Item 'C:\Users\13080\Documents\deepseek-harness\default-workspace\dsh-msg-time\client.js'  $lp -Force

# 链接进 node_modules（无管理员权限时用复制）
$link = 'C:\Users\13080\.dsh\profiles\desktop\node_modules\dsh-msg-time'
if (Test-Path $link) { Remove-Item $link -Recurse -Force }
try   { New-Item -ItemType SymbolicLink -Path $link -Target $lp -ErrorAction Stop | Out-Null }
catch { Copy-Item $lp $link -Recurse -Force }
```

## 2. profile/package.json 里加两处

```jsonc
{
  "dependencies": {
    "dsh-msg-time": "file:./local-plugins/dsh-msg-time"     // ← 加这行
  },
  "dsh": {
    "profile": {
      "bundles": [
        "…原有条目…",
        "dsh-msg-time"                                       // ← 加这行
      ]
    }
  }
}
```

## 3. profile/cordis.patch.yml 末尾加

```yaml
- insert:
    - id: msg-time
      name: "dsh-msg-time"
```

## 4. 完全退出应用再打开

确认任务管理器里 `DeepSeek Harness.exe` 已消失。客户端模块图和插件层只在启动时构建。

## 5. 验证

发一条消息，正文第一行应为 `[user_sent_at: YYYY/MM/DD HH:mm:ss]`。
控制台（F12）应看到 `[msg-time] ready: outgoing prompts carry [user_sent_at] headers`。

## 回滚

```powershell
$p = 'C:\Users\13080\.dsh\profiles\desktop'
# 用你自己的备份时间戳替换 <stamp>
Copy-Item "$p\cordis.patch.yml.bak-msgtime-<stamp>" "$p\cordis.patch.yml" -Force
Copy-Item "$p\package.json.bak-msgtime-<stamp>"      "$p\package.json"      -Force
Remove-Item "$p\local-plugins\dsh-msg-time" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item "$p\node_modules\dsh-msg-time" -Recurse -Force -ErrorAction SilentlyContinue
```
