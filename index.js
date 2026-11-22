import { execFile, spawn } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const name = 'xypshot-screenshot';
export const inject = ['webServer', 'connection'];

const CAPTURE_TIMEOUT_MS = 300000;
const HEALTH_PATH = '/dsh-plugin-screenshot/health';
const CONFIG_PATH_URL = '/dsh-plugin-screenshot/config';
const CAPTURE_PATH = '/dsh-plugin-screenshot/capture';
const MAX_BODY_BYTES = 16 * 1024;

const DEFAULT_CONFIG = { hotkey: 'Alt+A', global: true };

const MOD_ALT = 0x1;
const MOD_CTRL = 0x2;
const MOD_SHIFT = 0x4;
const MOD_WIN = 0x8;
const MOD_NAMES = [
  [MOD_CTRL, 'Ctrl'],
  [MOD_ALT, 'Alt'],
  [MOD_SHIFT, 'Shift'],
  [MOD_WIN, 'Win'],
];

function vkToLabel(vk) {
  if (vk >= 0x70) return `F${vk - 0x70 + 1}`;
  if (vk >= 0x41 && vk <= 0x5a) return String.fromCharCode(vk);
  if (vk >= 0x30 && vk <= 0x39) return String(vk - 0x30);
  return `0x${vk.toString(16)}`;
}

/** Parse "Ctrl+Shift+A" / "F5" / "Alt+1" into { mods, vk, label } or null. */
export function parseHotkey(text) {
  if (typeof text !== 'string') return null;
  const parts = text.split('+').map((part) => part.trim().toLowerCase()).filter(Boolean);
  if (parts.length === 0) return null;
  let mods = 0;
  let vk = null;
  for (const part of parts) {
    if (part === 'ctrl' || part === 'control') { mods |= MOD_CTRL; continue; }
    if (part === 'alt') { mods |= MOD_ALT; continue; }
    if (part === 'shift') { mods |= MOD_SHIFT; continue; }
    if (part === 'meta' || part === 'win' || part === 'super' || part === 'cmd') { mods |= MOD_WIN; continue; }
    if (vk !== null) return null;
    if (/^[a-z]$/.test(part)) vk = 0x41 + (part.charCodeAt(0) - 97);
    else if (/^[0-9]$/.test(part)) vk = 0x30 + Number(part);
    else if (/^f([1-9]|1\d|2[0-4])$/.test(part)) vk = 0x70 + (Number(part.slice(1)) - 1);
    else return null;
  }
  if (vk === null) return null;
  // Bare letter/digit hotkeys would hijack normal typing — require a modifier.
  if (mods === 0 && vk < 0x70) return null;
  const label = [...MOD_NAMES.filter(([bit]) => (mods & bit) !== 0).map(([, name]) => name), vkToLabel(vk)].join('+');
  return { mods, vk, label };
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(payload));
}

function sendMethodNotAllowed(res, allow) {
  res.statusCode = 405;
  res.setHeader('allow', allow);
  res.end();
}

async function readBoundedBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.byteLength;
    if (size > MAX_BODY_BYTES) {
      req.resume();
      return null;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size).toString('utf8');
}

function configFilePath() {
  const profileDir = process.env.DSH_PROFILE_DIR;
  if (profileDir) return `${profileDir.replace(/[\\/]+$/, '')}\\dsh-screenshot.config.json`;
  return fileURLToPath(new URL('./dsh-screenshot.config.json', import.meta.url));
}

async function loadConfig() {
  try {
    const text = await readFile(configFilePath(), 'utf8');
    const raw = JSON.parse(text);
    const parsed = parseHotkey(typeof raw.hotkey === 'string' ? raw.hotkey : DEFAULT_CONFIG.hotkey);
    return {
      hotkey: parsed ? parsed.label : DEFAULT_CONFIG.hotkey,
      global: typeof raw.global === 'boolean' ? raw.global : DEFAULT_CONFIG.global,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

// ---------------------------------------------------------------------------
// Native capture. DSH runs plugins in a plain Node child process (no Electron
// APIs at all), so the region capture runs in a spawned PowerShell process
// (WinForms + GDI+ — present on every Windows box, no bundled binaries).
// The overlay spans the union of ALL monitor bounds with per-monitor-DPI
// awareness, so a selection may start on one screen and end on another.
// On commit the cropped bitmap is placed on the clipboard (DIB + PNG formats)
// — WeChat-style: paste it anywhere afterwards.
// ---------------------------------------------------------------------------

const SNIP_CORE = String.raw`function Invoke-DshSnip {
    $script:selStart = $null
    $script:sel = New-Object System.Drawing.Rectangle
    $script:done = $false
    $script:saved = $false
    $script:lastW = 0
    $script:lastH = 0

    # Union of every monitor's bounds: the selection may span screens.
    $minX = [int]::MaxValue; $minY = [int]::MaxValue
    $maxX = [int]::MinValue; $maxY = [int]::MinValue
    foreach ($screen in [System.Windows.Forms.Screen]::AllScreens) {
        if ($screen.Bounds.X -lt $minX) { $minX = $screen.Bounds.X }
        if ($screen.Bounds.Y -lt $minY) { $minY = $screen.Bounds.Y }
        if (($screen.Bounds.X + $screen.Bounds.Width) -gt $maxX) { $maxX = $screen.Bounds.X + $screen.Bounds.Width }
        if (($screen.Bounds.Y + $screen.Bounds.Height) -gt $maxY) { $maxY = $screen.Bounds.Y + $screen.Bounds.Height }
    }
    $vw = $maxX - $minX
    $vh = $maxY - $minY

    # Freeze the whole virtual desktop before any overlay exists.
    $script:shot = New-Object System.Drawing.Bitmap -ArgumentList $vw, $vh
    $g = [System.Drawing.Graphics]::FromImage($script:shot)
    $g.CopyFromScreen($minX, $minY, 0, 0, (New-Object System.Drawing.Size -ArgumentList $vw, $vh))
    $g.Dispose()

    $script:form = New-Object System.Windows.Forms.Form
    $script:form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
    # Anti-flicker: buffered painting (no erase flash) and a dark erase color,
    # so any residual first-frame gap reads as the dim layer, not a white flash.
    # DoubleBuffered is protected on Control — set it via reflection.
    $formType = $script:form.GetType()
    $dbProp = $formType.GetProperty('DoubleBuffered', [System.Reflection.BindingFlags]'Instance,NonPublic,Public')
    if ($null -ne $dbProp) { $dbProp.SetValue($script:form, $true) }
    $script:form.BackColor = [System.Drawing.Color]::FromArgb(255, 16, 16, 16)
    $script:form.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
    $script:form.Location = New-Object System.Drawing.Point -ArgumentList $minX, $minY
    $script:form.Size = New-Object System.Drawing.Size -ArgumentList $vw, $vh
    $script:form.TopMost = $true
    $script:form.ShowInTaskbar = $false
    $script:form.BackgroundImageLayout = [System.Windows.Forms.ImageLayout]::None
    $script:form.AutoScaleMode = [System.Windows.Forms.AutoScaleMode]::None
    $script:form.KeyPreview = $true
    $script:form.Cursor = [System.Windows.Forms.Cursors]::Cross
    $script:form.BackgroundImage = $script:shot

    $script:dim = New-Object System.Drawing.SolidBrush -ArgumentList ([System.Drawing.Color]::FromArgb(110, 0, 0, 0))
    $script:penSel = New-Object System.Drawing.Pen -ArgumentList ([System.Drawing.Color]::Black), 1
    $script:font = New-Object System.Drawing.Font -ArgumentList 'Segoe UI', 10
    $script:labelBg = New-Object System.Drawing.SolidBrush -ArgumentList ([System.Drawing.Color]::FromArgb(210, 20, 20, 20))

    # Commit the current $script:sel to the clipboard and close the overlay.
    # Returns $true when committed, $false when the rect is too small.
    function Save-DshSelection {
        if ($script:sel.Width -ge 3 -and $script:sel.Height -ge 3) {
            try {
                $crop = New-Object System.Drawing.Bitmap -ArgumentList $script:sel.Width, $script:sel.Height
                $cg = [System.Drawing.Graphics]::FromImage($crop)
                $cg.DrawImage($script:shot, (New-Object System.Drawing.Rectangle -ArgumentList 0, 0, $script:sel.Width, $script:sel.Height), $script:sel, [System.Drawing.GraphicsUnit]::Pixel)
                $cg.Dispose()
                # WeChat-style: the capture lands on the clipboard (bitmap + PNG formats).
                $data = New-Object System.Windows.Forms.DataObject
                $data.SetImage($crop)
                $ms = New-Object System.IO.MemoryStream
                $crop.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
                $data.SetData('PNG', $ms)
                [void][System.Windows.Forms.Clipboard]::SetDataObject($data, $true)
                $script:lastW = $script:sel.Width
                $script:lastH = $script:sel.Height
                $script:saved = $true
                $crop.Dispose()
            }
            catch {
                $script:saved = $false
            }
            $script:done = $true
            try { $script:form.Close() } catch { }
            return $true
        }
        return $false
    }

    $script:form.add_MouseDown({
            param($sender, $e)
            if ($e.Button -eq [System.Windows.Forms.MouseButtons]::Left) {
                if ($script:clickMode) {
                    # point-pick mode: this second click is the end corner
                    $x = [Math]::Min($script:selStart.X, $e.X)
                    $y = [Math]::Min($script:selStart.Y, $e.Y)
                    $w = [Math]::Abs($script:selStart.X - $e.X)
                    $h = [Math]::Abs($script:selStart.Y - $e.Y)
                    $script:sel = New-Object System.Drawing.Rectangle -ArgumentList $x, $y, $w, $h
                    if (-not (Save-DshSelection)) {
                        # too small — drop back to idle instead of closing
                        $script:clickMode = $false
                        $script:selStart = $null
                        $script:sel = New-Object System.Drawing.Rectangle
                        $pad = 54
                        $d = New-Object System.Drawing.Rectangle -ArgumentList ($script:lastSel.X - $pad), ($script:lastSel.Y - $pad), ($script:lastSel.Width + 2 * $pad), ($script:lastSel.Height + 2 * $pad)
                        $script:form.Invalidate($d)
                        $script:lastSel = $script:sel
                    }
                    return
                }
                # arm a drag; a press-release without movement becomes a point pick
                $script:dragArmed = $true
                $script:downPt = $e.Location
                $script:selStart = $e.Location
                $script:sel = New-Object System.Drawing.Rectangle
                # repaint only where the previous selection (borders + size label) was
                $pad = 54
                $d = New-Object System.Drawing.Rectangle -ArgumentList ($script:lastSel.X - $pad), ($script:lastSel.Y - $pad), ($script:lastSel.Width + 2 * $pad), ($script:lastSel.Height + 2 * $pad)
                $script:form.Invalidate($d)
                $script:lastSel = $script:sel
            }
            elseif ($e.Button -eq [System.Windows.Forms.MouseButtons]::Right) {
                $script:done = $true
                $script:form.Close()
            }
        })
    $script:form.add_MouseMove({
            param($sender, $e)
            if ($script:selStart -ne $null -and ($script:dragArmed -or $script:clickMode)) {
                $x = [Math]::Min($script:selStart.X, $e.X)
                $y = [Math]::Min($script:selStart.Y, $e.Y)
                $w = [Math]::Abs($script:selStart.X - $e.X)
                $h = [Math]::Abs($script:selStart.Y - $e.Y)
                $script:sel = New-Object System.Drawing.Rectangle -ArgumentList $x, $y, $w, $h
                # repaint just old ∪ new selection band (padded) instead of the
                # whole virtual desktop — the rubber band stays flicker-free
                $old = $script:lastSel
                if ($old.IsEmpty) { $old = $script:sel }
                $pad = 54
                $ux = [Math]::Min($old.X, $script:sel.X) - $pad
                $uy = [Math]::Min($old.Y, $script:sel.Y) - $pad
                $ur = [Math]::Max(($old.X + $old.Width), ($script:sel.X + $script:sel.Width)) + $pad
                $ub = [Math]::Max(($old.Y + $old.Height), ($script:sel.Y + $script:sel.Height)) + $pad
                $dirty = New-Object System.Drawing.Rectangle -ArgumentList $ux, $uy, ($ur - $ux), ($ub - $uy)
                $script:form.Invalidate($dirty)
                $script:lastSel = $script:sel
            }
        })
    $script:form.add_MouseUp({
            param($sender, $e)
            if ($e.Button -ne [System.Windows.Forms.MouseButtons]::Left -or -not $script:dragArmed) { return }
            $script:dragArmed = $false
            # A press-release that barely moved is a POINT PICK, not a drag:
            # keep the anchor and let the rubber band follow the cursor until
            # the second click (handled in MouseDown's clickMode branch).
            $dx = [Math]::Abs($e.X - $script:downPt.X)
            $dy = [Math]::Abs($e.Y - $script:downPt.Y)
            if ($dx -lt 4 -and $dy -lt 4) {
                $script:clickMode = $true
                return
            }
            if (-not (Save-DshSelection)) {
                # drag was too small: reset to idle
                $script:selStart = $null
                $script:sel = New-Object System.Drawing.Rectangle
                $pad = 54
                $d = New-Object System.Drawing.Rectangle -ArgumentList ($script:lastSel.X - $pad), ($script:lastSel.Y - $pad), ($script:lastSel.Width + 2 * $pad), ($script:lastSel.Height + 2 * $pad)
                $script:form.Invalidate($d)
                $script:lastSel = $script:sel
            }
        })
    $script:form.add_KeyDown({
            param($sender, $e)
            if ($e.KeyCode -eq [System.Windows.Forms.Keys]::Escape) {
                $script:done = $true
                $script:form.Close()
            }
        })
    $script:form.add_Paint({
            param($sender, $e)
            $pg = $e.Graphics
            $pg.FillRectangle($script:dim, (New-Object System.Drawing.Rectangle -ArgumentList 0, 0, $script:form.Width, $script:form.Height))
            if (-not $script:sel.IsEmpty -and $script:sel.Width -gt 0 -and $script:sel.Height -gt 0) {
                $pg.DrawImage($script:shot, $script:sel, $script:sel, [System.Drawing.GraphicsUnit]::Pixel)
                $pg.DrawRectangle($script:penSel, $script:sel)
                $label = ('{0} x {1}' -f $script:sel.Width, $script:sel.Height)
                $size = [System.Windows.Forms.TextRenderer]::MeasureText($label, $script:font)
                $lx = $script:sel.X
                $ly = $script:sel.Y - $size.Height - 8
                if ($ly -lt 2) { $ly = $script:sel.Y + $script:sel.Height + 8 }
                if (($lx + $size.Width + 10) -gt $script:form.Width) { $lx = $script:form.Width - $size.Width - 10 }
                $labelRect = New-Object System.Drawing.Rectangle -ArgumentList $lx, $ly, ($size.Width + 10), $size.Height
                $pg.FillRectangle($script:labelBg, $labelRect)
                [System.Windows.Forms.TextRenderer]::DrawText($pg, $label, $script:font, $labelRect, [System.Drawing.Color]::White)
            }
        })

    $script:timer = New-Object System.Windows.Forms.Timer
    if ($env:DSH_SCREENSHOT_AUTOCLOSE_MS) {
        $script:timer.Interval = [int]$env:DSH_SCREENSHOT_AUTOCLOSE_MS
    }
    else {
        $script:timer.Interval = 240000
    }
    $script:timer.add_Tick({
            $script:done = $true
            try { $script:form.Close() } catch { }
        })
    $script:timer.Start()

    $script:lastSel = New-Object System.Drawing.Rectangle
    $script:dragArmed = $false
    $script:clickMode = $false
    $script:downPt = New-Object System.Drawing.Point -ArgumentList 0, 0
    [System.Windows.Forms.Application]::Run($script:form)
    $script:timer.Stop()
    return $script:saved
}
`;

const SNIP_PRELUDE = String.raw`$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class DshDpi
{
    [DllImport("user32.dll")]
    public static extern bool SetProcessDpiAwarenessContext(IntPtr value);
    [DllImport("user32.dll")]
    public static extern bool SetProcessDPIAware();
}
'@

# Per-monitor DPI awareness v2 (physical pixels on every monitor), with fallbacks.
try { [void][DshDpi]::SetProcessDpiAwarenessContext([IntPtr]::new(-4)) } catch { }
try { [void][DshDpi]::SetProcessDPIAware() } catch { }
`;

export const ONE_SHOT_SCRIPT = `${SNIP_PRELUDE}\n${SNIP_CORE}\n$ok = Invoke-DshSnip\nif ($ok) { Write-Output ('{"saved":true,"width":' + $script:lastW + ',"height":' + $script:lastH + '}') } else { Write-Output '{"saved":false,"reason":"cancelled"}' }\n`;

// Hidden resident process: owns the global hotkey (works even when the DSH
// window is not focused, like WeChat). Its stdin is a pipe — when the host
// closes it (plugin unload / config change / host exit), the daemon exits.
export const DAEMON_SCRIPT = `${SNIP_PRELUDE}\n${SNIP_CORE}\nAdd-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public struct MSG
{
    public IntPtr hwnd;
    public uint message;
    public IntPtr wParam;
    public IntPtr lParam;
    public uint time;
    public int ptX;
    public int ptY;
}
public static class DshMsg
{
    [DllImport("user32.dll")]
    public static extern int GetMessage(ref MSG msg, IntPtr hWnd, uint min, uint max);
    [DllImport("user32.dll")]
    public static extern bool TranslateMessage(ref MSG msg);
    [DllImport("user32.dll")]
    public static extern IntPtr DispatchMessage(ref MSG msg);
    [DllImport("user32.dll")]
    public static extern bool RegisterHotKey(IntPtr hWnd, int id, uint mods, uint vk);
    [DllImport("user32.dll")]
    public static extern bool UnregisterHotKey(IntPtr hWnd, int id);
    [DllImport("user32.dll")]
    public static extern IntPtr SetTimer(IntPtr hWnd, UIntPtr id, uint ms, IntPtr proc);
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool PeekNamedPipe(IntPtr pipe, byte[] buf, uint size, ref int read, ref int avail, ref int left);
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern IntPtr GetStdHandle(int which);
}
'@

$mods = [uint32]$env:DSH_SCREENSHOT_HOTKEY_MODS
$vk = [uint32]$env:DSH_SCREENSHOT_HOTKEY_VK
function Write-DshDaemonDebug([string]$m) {
    if ($env:DSH_SCREENSHOT_DAEMON_DEBUG) {
        [Console]::Error.WriteLine('dsh-daemon: ' + $m)
        [Console]::Error.Flush()
    }
}
if (-not [DshMsg]::RegisterHotKey([IntPtr]::Zero, 1, $mods, $vk)) {
    Write-DshDaemonDebug 'register-failed'
    [Console]::Out.WriteLine('{"ok":false,"reason":"hotkey-conflict"}')
    [Console]::Out.Flush()
    exit 2
}
Write-DshDaemonDebug 'registered'
[Console]::Out.WriteLine('{"ok":true}')
[Console]::Out.Flush()

# Host lifecycle: a WM_TIMER tick peeks the stdin pipe; when the host closes
# it (unload/exit/config change), PeekNamedPipe fails and we quit cleanly.
# (All on the main thread — no scriptblock callbacks on foreign threads.)
# NOTE: SetTimer(NULL, ...) ignores the caller id and returns a generated one,
# so the WM_TIMER branch matches on message type only (we own the only timer).
$stdin = [DshMsg]::GetStdHandle(-10)
$script:snipBusy = $false
$msg = New-Object MSG
$null = [DshMsg]::SetTimer([IntPtr]::Zero, [UIntPtr][uint64]99, 400, [IntPtr]::Zero)
while ([DshMsg]::GetMessage([ref]$msg, [IntPtr]::Zero, 0, 0) -gt 0) {
    if ($msg.message -eq 0x0312) {
        if (-not $script:snipBusy) {
            $script:snipBusy = $true
            try { [void](Invoke-DshSnip) } catch { }
            $script:snipBusy = $false
        }
        continue
    }
    if ($msg.message -eq 0x0113) {
        $rb = 0; $avail = 0; $left = 0
        if (-not [DshMsg]::PeekNamedPipe($stdin, $null, 0, [ref]$rb, [ref]$avail, [ref]$left)) {
            Write-DshDaemonDebug 'pipe-broken'
            break
        }
        continue
    }
    [void][DshMsg]::TranslateMessage([ref]$msg)
    [void][DshMsg]::DispatchMessage([ref]$msg)
}
Write-DshDaemonDebug 'loop-exited'
exit 0
`;

// -EncodedCommand caps at 32767 characters (UTF16LE base64 of the ~13 KB
// daemon script overflows it) — so scripts are staged into a temp .ps1 and
// launched with -File instead. UTF8 BOM so Windows PowerShell 5.1 does not
// fall back to the ANSI codepage.
function stageScriptFile(script) {
  const dir = mkdtempSync(path.join(tmpdir(), 'dsh-screenshot-'));
  const file = path.join(dir, 'script.ps1');
  return writeFile(file, '\uFEFF' + script, 'utf8').then(() => ({ dir, file }));
}

function discardScriptDir(later = 15000) {
  return ({ dir }) => {
    const t = setTimeout(() => {
      rm(dir, { recursive: true, force: true }).catch(() => {});
    }, later);
    if (typeof t.unref === 'function') t.unref();
  };
}

function runCaptureProcess() {
  return stageScriptFile(ONE_SHOT_SCRIPT).then((staged) =>
    new Promise((resolve, reject) => {
      const cleanup = discardScriptDir();
      const child = execFile(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-STA',
          '-File',
          staged.file,
        ],
        { timeout: CAPTURE_TIMEOUT_MS, windowsHide: true, maxBuffer: 1024 * 1024 },
        (error, stdout) => {
          cleanup(staged);
          let parsed = null;
          for (const line of String(stdout).split(/\r?\n/).reverse()) {
            const trimmed = line.trim();
            if (trimmed.startsWith('{')) {
              try {
                parsed = JSON.parse(trimmed);
                break;
              } catch {
                // keep scanning lines
              }
            }
          }
          resolve({ parsed, error });
        },
      );
      child.on('error', (error) => {
        cleanup(staged);
        reject(error);
      });
    }),
  );
}

export function apply(ctx) {
  const connection = Reflect.get(ctx, 'connection');
  const rejectRequest = (req, res) => {
    const rejection = connection?.requestRejection?.(req);
    if (rejection) {
      res.statusCode = rejection;
      res.end();
      return true;
    }
    return false;
  };

  let running = null;
  let daemon = null;
  let daemonState = 'off'; // off | starting | running | dead
  let daemonGen = 0;

  function stopDaemon() {
    daemonGen += 1; // cancels any daemon still being staged
    const child = daemon;
    daemon = null;
    if (child === null) {
      daemonState = 'off';
      return;
    }
    if (child.stdin && !child.stdin.destroyed) child.stdin.end();
    const killer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // already gone
      }
    }, 2500);
    if (typeof killer.unref === 'function') killer.unref();
    daemonState = 'off';
  }

  function startDaemon(config) {
    stopDaemon();
    const parsed = parseHotkey(config.hotkey);
    if (!parsed) {
      daemonState = 'off';
      return;
    }
    daemonState = 'starting';
    const gen = daemonGen;
    stageScriptFile(DAEMON_SCRIPT)
      .then((staged) => {
        if (gen !== daemonGen) {
          discardScriptDir(0)(staged);
          return;
        }
        const child = spawn(
          'powershell.exe',
          [
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy',
            'Bypass',
            '-STA',
            '-File',
            staged.file,
          ],
          {
            stdio: ['pipe', 'pipe', 'ignore'],
            windowsHide: true,
            env: {
              ...process.env,
              DSH_SCREENSHOT_HOTKEY_MODS: String(parsed.mods),
              DSH_SCREENSHOT_HOTKEY_VK: String(parsed.vk),
            },
          },
        );
        // The daemon prints exactly one JSON line on startup: registered or not.
        // PS boot takes a couple of seconds, so 'starting' until the line arrives.
        let reported = false;
        let lineBuf = '';
        child.stdout.on('data', (chunk) => {
          if (reported) return;
          lineBuf += chunk.toString('utf8');
          const nl = lineBuf.indexOf('\n');
          if (nl === -1) return;
          reported = true;
          child.stdout.destroy();
          let verdict = null;
          try {
            verdict = JSON.parse(lineBuf.slice(0, nl));
          } catch {
            // malformed line → treat as dead below
          }
          if (daemon !== child) return; // stopped while booting
          daemonState = verdict && verdict.ok === true ? 'running' : 'dead';
        });
        child.on('exit', () => {
          discardScriptDir()(staged);
          if (daemon === child) {
            daemon = null;
            if (!reported) daemonState = child.exitCode === 2 ? 'dead' : 'off';
            else if (daemonState !== 'dead') daemonState = 'off';
          }
        });
        daemon = child;
      })
      .catch(() => {
        if (gen === daemonGen) daemonState = 'dead';
      });
  }

  ctx.effect(() => {
    void (async () => {
      const config = await loadConfig();
      if (config.global) startDaemon(config);
    })();
    return () => {
      stopDaemon();
    };
  }, 'screenshot-hotkey-daemon');

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: HEALTH_PATH,
    handler: async (req, res) => {
      if (rejectRequest(req, res)) return;
      if (req.method !== 'GET') {
        sendMethodNotAllowed(res, 'GET');
        return;
      }
      req.resume();
      sendJson(res, 200, { ok: true, plugin: name, platform: process.platform, busy: running !== null });
    },
  }), 'screenshot-health-route');

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: CONFIG_PATH_URL,
    handler: async (req, res) => {
      if (rejectRequest(req, res)) return;
      req.resume();
      if (req.method === 'GET') {
        const config = await loadConfig();
        const parsed = parseHotkey(config.hotkey);
        sendJson(res, 200, {
          hotkey: config.hotkey,
          mods: parsed ? parsed.mods : null,
          vk: parsed ? parsed.vk : null,
          global: config.global,
          daemon: daemonState,
        });
        return;
      }
      if (req.method !== 'POST') {
        sendMethodNotAllowed(res, 'GET, POST');
        return;
      }
      const body = await readBoundedBody(req);
      if (body === null) {
        sendJson(res, 413, { code: 'payload-too-large' });
        return;
      }
      let raw;
      try {
        raw = JSON.parse(body);
      } catch {
        sendJson(res, 400, { code: 'invalid-json' });
        return;
      }
      if (typeof raw !== 'object' || raw === null) {
        sendJson(res, 400, { code: 'invalid-body' });
        return;
      }
      const next = { ...(await loadConfig()) };
      if (raw.hotkey !== undefined) {
        const parsed = parseHotkey(raw.hotkey);
        if (!parsed) {
          sendJson(res, 400, { code: 'invalid-hotkey', message: 'Use e.g. Alt+A, Ctrl+Shift+X or F5. Letters/digits need at least one modifier.' });
          return;
        }
        next.hotkey = parsed.label;
      }
      if (raw.global !== undefined) {
        if (typeof raw.global !== 'boolean') {
          sendJson(res, 400, { code: 'invalid-global' });
          return;
        }
        next.global = raw.global;
      }
      try {
        await writeFile(configFilePath(), `${JSON.stringify(next, null, 2)}\n`, 'utf8');
      } catch (error) {
        sendJson(res, 500, { code: 'persist-failed', message: String(error && error.message ? error.message : error) });
        return;
      }
      if (next.global) startDaemon(next);
      else stopDaemon();
      const parsed = parseHotkey(next.hotkey);
      sendJson(res, 200, {
        hotkey: next.hotkey,
        mods: parsed ? parsed.mods : null,
        vk: parsed ? parsed.vk : null,
        global: next.global,
        daemon: daemonState,
      });
    },
  }), 'screenshot-config-route');

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: CAPTURE_PATH,
    handler: async (req, res) => {
      if (rejectRequest(req, res)) return;
      if (req.method !== 'POST') {
        sendMethodNotAllowed(res, 'POST');
        return;
      }
      req.resume();
      if (running !== null) {
        sendJson(res, 409, { code: 'busy', message: 'A screenshot selection is already in progress.' });
        return;
      }
      const job = runCaptureProcess().finally(() => {
        running = null;
      });
      running = job;
      let outcome;
      try {
        outcome = await job;
      } catch (error) {
        sendJson(res, 502, { code: 'capture-failed', message: String(error && error.message ? error.message : error) });
        return;
      }
      if (outcome.parsed && outcome.parsed.saved === true) {
        sendJson(res, 200, { saved: true, width: outcome.parsed.width, height: outcome.parsed.height });
        return;
      }
      // cancelled / too small / clipboard failure → silent for the client
      res.statusCode = 204;
      res.end();
    },
  }), 'screenshot-capture-route');
}
