// dsh-napcat-autostart —— 浏览器半侧：设置 → 机器人
window.__ModuleLoader__.load({
  id: 'dsh-napcat-autostart',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    const React = require('react')
    const inject = ['slots']
    const h = React.createElement

    const B = '/api/napcat-autostart'
    const getJson = (p) => fetch(B + p, { cache: 'no-store' }).then((r) => r.json()).catch(() => null)
    const postJson = (p, body) => fetch(B + p, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body || {}),
    }).then((r) => r.json()).catch(() => null)

    const S = {
      wrap: { padding: '12px 14px 24px', fontSize: 13, lineHeight: 1.7, maxWidth: 720 },
      h: { fontSize: 16, fontWeight: 600, marginBottom: 4 },
      dim: { opacity: 0.65, fontSize: 12 },
      row: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '10px 0' },
      btn: {
        padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(127,127,127,.4)',
        background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: 13,
      },
      btnMain: {
        padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(127,127,127,.4)',
        background: 'rgba(127,127,127,.18)', color: 'inherit', cursor: 'pointer', fontSize: 13, fontWeight: 600,
      },
      card: { border: '1px solid rgba(127,127,127,.25)', borderRadius: 8, padding: '10px 12px', margin: '10px 0' },
      ok: { color: '#2e8b57', fontWeight: 600 },
      bad: { color: '#c0392b', fontWeight: 600 },
      input: {
        padding: '4px 6px', borderRadius: 6, border: '1px solid rgba(127,127,127,.4)',
        background: 'transparent', color: 'inherit', fontSize: 13,
      },
      k: { display: 'inline-block', minWidth: 96, opacity: 0.7 },
    }

    function Row(props) {
      return h('div', null, h('span', { style: S.k }, props.k), props.children)
    }

    function Section() {
      const [data, setData] = React.useState(null)
      const [busy, setBusy] = React.useState('')
      const [msg, setMsg] = React.useState('')
      const [intervalSec, setIntervalSec] = React.useState(300)
      const [enabled, setEnabled] = React.useState(true)
      const [loginMode, setLoginMode] = React.useState('qr')
      const [password, setPassword] = React.useState('')
      const [root, setRoot] = React.useState('')
      const [qq, setQq] = React.useState('')
      const [qrTick, setQrTick] = React.useState(0)

      const load = React.useCallback(async () => {
        const d = await getJson('/status')
        if (d && d.ok) {
          setData(d)
          setIntervalSec(d.config.intervalSec)
          setEnabled(d.config.enabled)
          setLoginMode(d.config.loginMode || 'qr')
          setRoot(d.config.root || '')
          setQq(d.config.qq || '')
        } else {
          setData({ ok: false, error: '读不到状态（宿主没挂上路由？）' })
        }
      }, [])

      React.useEffect(() => { void load() }, [load])

      // 没登录时每 3 秒刷一次状态和二维码（码过期 NapCat 会自己换一张）
      const loggedOut = !(data && data.open)
      React.useEffect(() => {
        if (!loggedOut) return undefined
        const t = setInterval(async () => {
          const d = await getJson('/status')
          if (d && d.ok) setData(d)
          setQrTick((n) => n + 1)
        }, 3000)
        return () => clearInterval(t)
      }, [loggedOut])

      const act = async (name, fn) => {
        setBusy(name); setMsg('')
        const r = await fn()
        setBusy('')
        setMsg(r && r.ok ? '完成' : '失败：' + (r && r.error ? r.error : '未知'))
        await load()
      }

      const save = async () => {
        setBusy('save')
        const r = await postJson('/config', { enabled, intervalSec: Number(intervalSec), root, qq })
        setBusy('')
        setMsg(r && r.ok ? '已保存' : '保存失败')
        await load()
      }

      const savePassword = async () => {
        if (!password.trim()) { setMsg('密码是空的'); return }
        setBusy('pwd'); setMsg('')
        const r = await postJson('/config', { loginMode: 'password', password })
        setBusy(''); setPassword('')
        setMsg(r && r.ok ? '密码已加密保存' : '保存失败：' + (r && r.error ? r.error : '未知'))
        await load()
      }

      const clearPassword = async () => {
        setBusy('pwd'); setMsg('')
        const r = await postJson('/config', { clearPassword: true })
        setBusy('')
        setMsg(r && r.ok ? '密码已清除，回到扫码登录' : '清除失败')
        await load()
      }

      const switchMode = async (mode) => {
        if (mode === 'password' && !(data && data.passwordSet)) {
          setMsg('先在上面填密码并保存，再切到密码登录')
          return
        }
        setBusy('mode'); setMsg('')
        const r = await postJson('/config', { loginMode: mode })
        setBusy('')
        setMsg(r && r.ok ? '已切换' : '切换失败')
        await load()
      }

      if (!data) return h('div', { style: S.wrap }, '正在读取…')
      const cfg = (data.config || {})
      const open = data.open === true
      const login = data.login

      return h('div', { style: S.wrap },
        h('div', { style: S.h }, '机器人（NapCat）'),
        h('div', { style: S.dim },
          'DSH 启动 5 秒后查一次 3000 端口，不通就调 start-bot.ps1 拉起；之后按间隔巡检。'
          + '脚本幂等，正在跑就什么都不做，也绝不会关掉你自己的 QQ。'),

        h('div', { style: S.card },
          h(Row, { k: '端口' },
            h('span', { style: open ? S.ok : S.bad }, open ? '在线 ' + cfg.port : '不通 ' + cfg.port)),
          h(Row, { k: '登录账号' },
            login ? h('span', null, login.nick + '（' + login.uin + '）') : h('span', { style: S.dim }, '未登录 / 无响应')),
          h(Row, { k: '自动拉起' },
            h('span', null, cfg.enabled ? '开' : '关'),
            h('span', { style: S.dim }, '　巡检间隔 ' + cfg.intervalSec + ' 秒')),
          h('div', { style: S.dim },
            data.state && data.state.lastCheck
              ? '上次检查：' + new Date(data.state.lastCheck).toLocaleTimeString() + '（共 ' + data.state.checks + ' 次）'
              : '还没检查过'),
        ),

        loggedOut ? h('div', { style: S.card },
          h('div', { style: { fontWeight: 600, marginBottom: 6 } }, '等待扫码登录'),
          h('img', {
            src: '/api/napcat-autostart/qr?v=' + qrTick,
            alt: 'NapCat 登录二维码',
            style: { width: 180, height: 180, imageRendering: 'pixelated', background: '#fff', borderRadius: 8, display: 'block' },
          }),
          h('div', { style: S.dim }, '用「大肥鱼」那个号扫，勾上「记住设备」。刚出码时如果扫不动，等 2 秒它自己换一张。'),
        ) : null,

        h('div', { style: S.card },
          h('div', { style: { fontWeight: 600, marginBottom: 6 } }, '登录方式'),
          h('div', { style: S.row },
            h('label', null,
              h('input', { type: 'radio', checked: loginMode === 'qr', disabled: !!busy, onChange: () => { void switchMode('qr') } }),
              ' 扫码登录'),
            h('label', null,
              h('input', { type: 'radio', checked: loginMode === 'password', disabled: !!busy, onChange: () => { void switchMode('password') } }),
              ' 密码登录'),
            h('span', { style: data.passwordSet ? S.ok : S.dim }, data.passwordSet ? '已存密码（DPAPI 加密）' : '未存密码'),
          ),
          h('div', { style: S.row },
            h('input', {
              style: { ...S.input, width: 220 }, type: 'password', placeholder: 'QQ 密码（只存在本机、加密）',
              value: password, onChange: (e) => setPassword(e.target.value),
            }),
            h('button', { style: S.btnMain, disabled: !!busy, onClick: () => { void savePassword() } },
              busy === 'pwd' ? '保存中…' : '保存密码'),
            h('button', { style: S.btn, disabled: !!busy || !data.passwordSet, onClick: () => { void clearPassword() } }, '清除'),
          ),
          h('div', { style: S.dim },
            '密码用 Windows DPAPI 加密存盘（只有当前 Windows 账户能解），启动那一下才解开、只进子进程环境变量。'
            + '快速登录失效时会自动改用密码；仍可能被要求验证码或扫一次码（风控），验证入口在 NapCat WebUI。'),
        ),

        h('div', { style: S.row },
          h('button', { style: S.btn, disabled: !!busy, onClick: () => act('check', () => postJson('/check')) },
            busy === 'check' ? '检查中…' : '立即检查'),
          h('button', { style: S.btnMain, disabled: !!busy, onClick: () => act('start', () => postJson('/start')) },
            busy === 'start' ? '启动中…' : '拉起机器人'),
          h('button', { style: S.btn, disabled: !!busy, onClick: () => act('stop', () => postJson('/stop')) },
            busy === 'stop' ? '停止中…' : '停止'),
          h('button', { style: S.btn, disabled: !!busy, onClick: () => { void load() } }, '刷新'),
        ),

        h('div', { style: S.card },
          h('div', { style: { fontWeight: 600, marginBottom: 6 } }, '自动拉起'),
          h('div', { style: S.row },
            h('label', null,
              h('input', { type: 'checkbox', checked: enabled, onChange: (e) => setEnabled(e.target.checked) }),
              ' 端口不通时自动拉起'),
            h('span', { style: S.dim }, '巡检间隔（秒）'),
            h('input', {
              style: { ...S.input, width: 72 }, type: 'number', min: 30, max: 3600, value: intervalSec,
              onChange: (e) => setIntervalSec(e.target.value),
            }),
            h('button', { style: S.btnMain, disabled: !!busy, onClick: () => { void save() } },
              busy === 'save' ? '保存中…' : '保存'),
          ),
          h('div', { style: S.row },
            h('span', { style: S.dim }, 'NapCat 目录'),
            h('input', {
              style: { ...S.input, width: 260 }, placeholder: 'D:\\NapCatNew', value: root,
              onChange: (e) => setRoot(e.target.value),
            }),
            h('span', { style: S.dim }, 'QQ 号'),
            h('input', {
              style: { ...S.input, width: 130 }, placeholder: '如 3985405335', value: qq,
              onChange: (e) => setQq(e.target.value),
            }),
          ),
          h('div', { style: S.dim }, '改完保存立即生效，不用重启。'),
        ),

        msg ? h('div', { style: { marginTop: 8, fontWeight: 600 } }, msg) : null,
        h('div', { style: { ...S.dim, marginTop: 14 } },
          '启动脚本：D:\\NapCatNew\\start-bot.ps1　·　日志：~/.dsh/napcat-autostart.log'),
      )
    }

    function apply(ctx) {
      const slots = ctx.get('slots')
      if (slots === undefined) return
      slots.inject('settings.section', () =>
        slots.register(
          { name: 'settings.section', id: 'napcat-bot', order: 55, label: () => '机器人' },
          Section,
        ),
      )
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
