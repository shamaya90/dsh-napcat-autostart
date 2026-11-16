# dsh-napcat-autostart

给 [DeepSeek Harness](https://github.com/deepseek-ai) 用的 NapCat 看护插件：DSH 启动后检查 NapCat 的 OneBot 端口，不在就把它拉起来；设置里有一页「机器人」，能看状态、手动停/起、选中扫码或密码登录。

## 它解决什么

NapCat 跑起来之后，常见的问题是：

- 机器重启 / DSH 重启之后它没起来，QQ 消息静默地断掉；
- 掉线后卡在「等扫码」，没人知道；
- 每次重启都要拿手机扫一次码。

这个插件把这三件事收进 DSH：巡检、拉起、状态可视化，登录方式可选扫码或密码（密码用 Windows DPAPI 加密存本机）。

## 前置条件

- Windows
- 已有一份 **NapCat Shell**（本插件默认目录 `D:\NapCatNew`，可改）
- DSH 桌面版 ≥ `0.2.1-rc.2`
- 想用「通到 QQ」收发消息，还需要 `dsh-qq-link`

## 安装

从 npm 装（推荐，版本 `1.2.1`）：

```powershell
dsh plugin --profile desktop add dsh-napcat-autostart
```

从源码装（改代码即时生效，适合开发）：

```powershell
git clone https://github.com/shamaya90/dsh-napcat-autostart.git
dsh plugin --profile desktop add link:C:\path\to\dsh-napcat-autostart
```

装完重启一次 DSH（或等它热加载），设置侧栏会出现 **机器人**。

## 配置（设置 → 机器人）

| 项 | 说明 |
|---|---|
| NapCat 目录 | NapCat Shell 所在目录（里面要有 `napcat.bat`） |
| QQ 号 | 机器人账号，启动时作为 `-q` 参数传给 NapCat |
| 端口 | OneBot HTTP 端口，默认 3000 |
| 自动拉起 | 端口不通时自动启动；巡检间隔默认 300 秒 |
| 登录方式 | 扫码 / 密码 |

### 日志文件

- 插件日志：`~/.dsh/napcat-autostart.log`
- 配置：`~/.dsh/napcat-autostart.json`
- 密码（密文）：`~/.dsh/napcat-login.json`
- NapCat 自己的日志：`<NapCat 目录>\run.log`、`autostart.log`

## 登录方式

### 扫码

默认。NapCat 出二维码，**设置页「机器人」里会直接显示**（没登录时每 3 秒自动刷新），手机 QQ（用机器人那个号）扫一下。扫的时候勾「记住设备」，之后重启走快速登录，通常不用再扫。

### 密码

1. 设置页填 QQ 密码 → 保存； 
2. 选「密码登录」。

密码用 **Windows DPAPI（CurrentUser）** 加密后写进 `~/.dsh/napcat-login.json`，盘上没有明文；只有当前 Windows 账户能解开。启动时解密到子进程环境变量 `NAPCAT_QUICK_PASSWORD`，NapCat 在快速登录失败时会自动改走密码。

> ⚠️ 这是真实的 QQ 密码登录：新设备/异地/频繁登录仍可能触发验证码或要求再扫一次码（NapCat 会在 WebUI 里给入口）。**被要求验证码时，插件会自动挂起密码、退回扫码**，并在设置页直接摆出二维码。账号安全风险自负，建议只在可信机器上用。

## 实现说明

- 脚本都在包里的 `scripts/`：`start-bot.ps1`、`stop-bot.ps1`、`encrypt-password.ps1`、`clear-password.ps1`。
- 启动走 `cmd /c start "" /b powershell -File start-bot.ps1`，**子进程脱离 DSH 进程树**——DSH 重启不会把 NapCat 带走。
  （直接 `spawn(..., { detached: true, stdio: 'ignore' })` 在 Windows 上会「退出码 0 但脚本没执行」，踩过。）
- 停止只杀 `<NapCat 目录>\node.exe`，**绝不 taskkill QQ.exe**。
- 巡检发现「端口不通但进程还在」时，第二次重试会先停再起，让快速登录/密码回退有机会。

## 已知限制

- 只支持 Windows（DPAPI + PowerShell）。
- NapCat 目录里的 `napcat.bat` 名字写死；换启动器要改脚本。
- 巡检间隔最小 30 秒；DSH 不在跑的时候不会巡检（这是插件，不是服务）。

## License

MIT
