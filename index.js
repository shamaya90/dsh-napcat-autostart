// dsh-napcat-autostart — NapCat 看护插件（宿主半侧）
//
// 做的事：DSH 启动后查一次 http://127.0.0.1:<port>，不通就调 scripts/start-bot.ps1
// 把 NapCat 拉起来（脚本幂等、绝不 taskkill QQ.exe），之后按间隔巡检。
// 设置页「机器人」那一页走 /api/napcat-autostart/*。
//
// 全部机器相关的东西（NapCat 目录、QQ 号、端口）都在配置里，默认值只是给作者本人的。

import { readFileSync, writeFileSync, appendFileSync, existsSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { spawn } from 'node:child_process'
import { connect } from 'node:net'
import { get as httpGet } from 'node:http'

export const name = 'napcat-autostart'
export const inject = ['webServer']

const PKG_DIR = dirname(fileURLToPath(import.meta.url))
const SCRIPTS = join(PKG_DIR, 'scripts')
const HOME = process.env.USERPROFILE || homedir()
const DSH_DIR = join(HOME, '.dsh')
const CFG_PATH = join(DSH_DIR, 'napcat-autostart.json')
const LOG_PATH = join(DSH_DIR, 'napcat-autostart.log')
const LOGIN_FILE = join(DSH_DIR, 'napcat-login.json')
const POWERSHELL = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'

const DEFAULTS = {
  enabled: true,
  intervalSec: 300,
  port: 3000,
  root: 'D:\\NapCatNew',
  qq: '',
  loginMode: 'qr',
}

function log(line) {
  try { appendFileSync(LOG_PATH, new Date().toISOString() + ' ' + line + '\n') } catch {}
}
function loadConfig() {
  try { return { ...DEFAULTS, ...JSON.parse(readFileSync(CFG_PATH, 'utf8')) } } catch { return { ...DEFAULTS } }
}
function saveConfig(cfg) { writeFileSync(CFG_PATH, JSON.stringify(cfg, null, 2)) }

function portOpen(port, timeoutMs = 1200) {
  return new Promise((resolve) => {
    const socket = connect({ host: '127.0.0.1', port })
    let done = false
    const finish = (ok) => { if (done) return; done = true; try { socket.destroy() } catch {} resolve(ok) }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
  })
}

function getJson(url, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const req = httpGet(url, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => { body += chunk })
      res.on('end', () => { try { resolve(JSON.parse(body)) } catch { resolve(null) } })
    })
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve(null) })
    req.on('error', () => resolve(null))
  })
}

// 走 cmd /c start：子进程不在宿主进程树里，DSH 重启不会把它带走
function launch(args) {
  return new Promise((resolve) => {
    const child = spawn('C:\\Windows\\System32\\cmd.exe',
      ['/c', 'start', '""', '/b', POWERSHELL, ...args],
      { windowsHide: true, stdio: 'ignore' })
    let done = false
    const finish = (r) => { if (!done) { done = true; resolve(r) } }
    child.on('error', (err) => finish({ ok: false, error: String(err) }))
    child.on('exit', (code) => finish({ ok: code === 0, code }))
    setTimeout(() => finish({ ok: true, timeout: true }), 8000).unref?.()
  })
}

function runScript(file, args = []) {
  return new Promise((resolve) => {
    const child = spawn(POWERSHELL, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', file, ...args],
      { windowsHide: true, stdio: 'ignore' })
    let done = false
    const finish = (r) => { if (!done) { done = true; resolve(r) } }
    child.on('error', (err) => finish({ ok: false, error: String(err) }))
    child.on('exit', (code) => finish({ ok: code === 0, code }))
    setTimeout(() => finish({ ok: true, timeout: true }), 30000).unref?.()
  })
}

export function apply(ctx) {
  let cfg = loadConfig()
  const state = { lastCheck: 0, lastAction: '', lastStartAt: 0, lastStopAt: 0, checks: 0, starts: 0, lastError: '' }

  async function describe() {
    const port = Number(cfg.port) || 3000
    const open = await portOpen(port)
    let login = null
    if (open) {
      const r = await getJson('http://127.0.0.1:' + port + '/get_login_info')
      if (r && (r.status === 'ok' || r.retcode === 0) && r.data) login = { uin: r.data.user_id, nick: r.data.nickname }
    }
    return { open, login }
  }

  async function start() {
    state.lastAction = 'start'
    state.lastStartAt = Date.now()
    state.starts += 1
    log('start requested (root=' + cfg.root + ', qq=' + cfg.qq + ')')
    return launch([
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(SCRIPTS, 'start-bot.ps1'),
      '-Root', cfg.root, '-QQ', cfg.qq || '', '-Port', String(cfg.port || 3000),
    ])
  }

  async function stop() {
    state.lastAction = 'stop'
    state.lastStopAt = Date.now()
    log('stop requested')
    return runScript(join(SCRIPTS, 'stop-bot.ps1'), ['-Root', cfg.root])
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

  async function check(why) {
    state.lastCheck = Date.now()
    state.checks += 1
    if (await portOpen(Number(cfg.port) || 3000)) return { open: true, started: false, why }
    if (!cfg.enabled) { log('port down, auto-start disabled'); return { open: false, started: false, why } }
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      if (attempt === 2) {
        // 进程在、但一直卡在扫码：重启一次，让 -q 快速登录 / 密码回退有机会
        log('attempt 2: killing stuck process before restart')
        await runScript(join(SCRIPTS, 'stop-bot.ps1'), ['-Root', cfg.root])
        await sleep(2500)
      }
      log('port down, starting (' + why + ', attempt ' + attempt + ')')
      await start()
      await sleep(attempt === 1 ? 8000 : 14000)
      if (await portOpen(Number(cfg.port) || 3000)) return { open: true, started: true, why, attempt }
    }
    state.lastError = 'start failed: port still closed'
    log('start failed: port still closed')
    return { open: false, started: true, failed: true, why }
  }

  function setPassword(password) {
    return new Promise((resolve) => {
      const child = spawn(POWERSHELL, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(SCRIPTS, 'encrypt-password.ps1')],
        { windowsHide: true, stdio: 'ignore', env: { ...process.env, NAPCAT_PLAIN: password } })
      let done = false
      const finish = (r) => { if (!done) { done = true; resolve(r) } }
      child.on('error', (e) => finish({ ok: false, error: String(e) }))
      child.on('exit', (code) => finish({ ok: code === 0 && existsSync(LOGIN_FILE), code }))
      setTimeout(() => finish({ ok: existsSync(LOGIN_FILE), timeout: true }), 15000).unref?.()
    })
  }

  function clearPassword() {
    try { rmSync(LOGIN_FILE, { force: true }) } catch {}
    return !existsSync(LOGIN_FILE)
  }

  async function handle(req, res) {
    const url = new URL(req.url, 'http://127.0.0.1')
    const path = url.pathname.replace('/api/napcat-autostart', '') || '/'
    const send = (code, obj) => {
      res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      res.end(JSON.stringify(obj))
    }
    try {
      if (req.method === 'GET' && path === '/status') {
        const d = await describe()
        return send(200, { ok: true, ...d, config: cfg, state, passwordSet: existsSync(LOGIN_FILE) })
      }
      if (req.method === 'POST' && path === '/check') {
        const r = await check('manual')
        const d = await describe()
        return send(200, { ok: true, ...r, ...d, config: cfg, state })
      }
      if (req.method === 'POST' && path === '/start') {
        const r = await start()
        return send(200, { ok: true, ...r, state })
      }
      if (req.method === 'POST' && path === '/stop') {
        const r = await stop()
        return send(200, { ok: true, ...r, state })
      }
      if (req.method === 'POST' && path === '/config') {
        let raw = ''
        for await (const chunk of req) raw += chunk
        let body = {}
        try { body = JSON.parse(raw || '{}') } catch {}
        if (typeof body.enabled === 'boolean') cfg.enabled = body.enabled
        if (Number.isFinite(Number(body.intervalSec))) cfg.intervalSec = Math.max(30, Math.min(3600, Number(body.intervalSec)))
        if (Number.isFinite(Number(body.port))) cfg.port = Number(body.port)
        if (typeof body.root === 'string' && body.root.trim()) cfg.root = body.root.trim().replace(/[\\/]+$/, '')
        if (typeof body.qq === 'string') cfg.qq = body.qq.trim()
        if (typeof body.password === 'string' && body.password.length > 0) {
          const r = await setPassword(body.password)
          if (!r.ok) return send(500, { ok: false, error: 'password save failed' })
          cfg.loginMode = 'password'
        }
        if (body.loginMode === 'qr') { cfg.loginMode = 'qr'; clearPassword() }
        if (body.loginMode === 'password' && existsSync(LOGIN_FILE)) cfg.loginMode = 'password'
        if (body.clearPassword === true) { clearPassword(); cfg.loginMode = 'qr' }
        saveConfig(cfg)
        restartTimer()
        return send(200, { ok: true, config: cfg })
      }
      return send(404, { ok: false, error: 'unknown ' + req.method + ' ' + path })
    } catch (e) {
      return send(500, { ok: false, error: e?.message ?? String(e) })
    }
  }

  let timer = null
  function restartTimer() {
    if (timer) { clearInterval(timer); timer = null }
    const every = Math.max(30, Number(cfg.intervalSec) || 300) * 1000
    timer = setInterval(() => { void check('timer') }, every)
    if (typeof timer.unref === 'function') timer.unref()
  }

  ctx.effect(() => {
    const boot = setTimeout(() => { void check('boot') }, 5000)
    if (typeof boot.unref === 'function') boot.unref()
    restartTimer()
    log('loaded; enabled=' + cfg.enabled + ' interval=' + cfg.intervalSec + 's port=' + cfg.port + ' root=' + cfg.root)
    return () => { clearTimeout(boot); if (timer) clearInterval(timer) }
  }, 'napcat-autostart: check loop')

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/api/napcat-autostart',
    handler: (req, res) => { void handle(req, res) },
  }), 'napcat-autostart: /api/napcat-autostart')
}
