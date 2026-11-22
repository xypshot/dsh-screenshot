window.__ModuleLoader__.load({
  id: '@local/dsh-screenshot',
  factory(require) {
    const React = require('react');
    const ReactDOM = require('react-dom');

    const NS = 'dsh-screenshot';
    const CONFIG_ROUTE = '/dsh-plugin-screenshot/config';
    const CAPTURE_ROUTE = '/dsh-plugin-screenshot/capture';

    const DICTS = {
      en: {
        tip: 'Screenshot — select a region, then paste it anywhere (Ctrl+V). Right-click for settings.',
        busy: 'Drag a region — or click two corners — to select…',
        busyConflict: 'A screenshot selection is already running',
        error: 'Screenshot failed',
        settings: 'Screenshot settings',
        hotkeyLabel: 'Hotkey',
        hotkeyHint: 'Click the box, then press the combo (e.g. Alt+A)',
        hotkeyPlaceholder: 'Click to record',
        globalLabel: 'Global hotkey (works while other apps are focused)',
        daemonWarn: 'Global hotkey could not be registered (already in use?)',
        save: 'Save',
        cancel: 'Cancel',
      },
      zh: {
        tip: '截图 — 框选区域后在任意位置粘贴 (Ctrl+V)。右键打开设置。',
        busy: '拖拽框选，或单击起点、再单击终点…',
        busyConflict: '已有截图选取进行中',
        error: '截图失败',
        settings: '截图设置',
        hotkeyLabel: '快捷键',
        hotkeyHint: '点击输入框后按下组合键（如 Alt+A）',
        hotkeyPlaceholder: '点击录制快捷键',
        globalLabel: '全局热键（其他窗口聚焦时也能按）',
        daemonWarn: '全局热键注册失败（可能被其他程序占用）',
        save: '保存',
        cancel: '取消',
      },
    };

    const STYLE = [
      '.dsh-screenshot-btn {',
      '  display: inline-flex; align-items: center; justify-content: center;',
      '  width: 28px; height: 28px; padding: 0; border: none; border-radius: 6px;',
      '  background: transparent; cursor: pointer;',
      '  color: var(--dsw-alias-label-secondary, #9aa0a6);',
      '  transition: background 120ms ease, color 120ms ease;',
      '}',
      '.dsh-screenshot-btn:hover {',
      '  background: var(--dsw-alias-bg-overlay, rgba(127, 127, 127, 0.14));',
      '  color: var(--dsw-alias-label-primary, inherit);',
      '}',
      '.dsh-screenshot-btn:active { transform: translateY(1px); }',
      '.dsh-screenshot-btn[data-state="busy"] { pointer-events: none; opacity: 0.75; }',
      '.dsh-screenshot-btn[data-state="error"] {',
      '  color: var(--dsw-alias-state-error-primary, #d64541);',
      '}',
      '.dsh-screenshot-btn[data-state="done"] {',
      '  color: var(--dsw-alias-state-success-primary, #2e9e5b);',
      '}',
      '.dsh-screenshot-spin { animation: dsh-screenshot-rotate 1s linear infinite; transform-origin: center; }',
      '@keyframes dsh-screenshot-rotate { to { transform: rotate(360deg); } }',
      '.dsh-screenshot-panel {',
      '  position: fixed; z-index: 100000; width: 260px; padding: 12px;',
      '  background: var(--dsw-alias-bg-layer-1, #ffffff);',
      '  border: 1px solid var(--dsw-alias-border-l1, rgba(127,127,127,.3));',
      '  border-radius: 10px;',
      '  box-shadow: 0 8px 28px rgba(0,0,0,.18);',
      '  font-size: 12px; line-height: 1.5;',
      '  color: var(--dsw-alias-label-primary, inherit);',
      '  user-select: none;',
      '}',
      '.dsh-screenshot-panel-title { font-weight: 600; margin-bottom: 10px; }',
      '.dsh-screenshot-hotkey-box {',
      '  width: 100%; box-sizing: border-box; margin-top: 4px; padding: 6px 8px;',
      '  border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.25)); border-radius: 6px;',
      '  background: var(--dsw-alias-bg-base, transparent); cursor: pointer; text-align: center;',
      '  color: var(--dsw-alias-label-primary, inherit); font-size: 13px; font-family: inherit;',
      '}',
      '.dsh-screenshot-hotkey-box:focus {',
      '  outline: none;',
      '  border-color: var(--dsw-alias-brand-primary, #2b7fff);',
      '}',
      '.dsh-screenshot-check-row { display: flex; align-items: flex-start; gap: 6px; margin-top: 10px; cursor: pointer; }',
      '.dsh-screenshot-check-row input { margin: 2px 0 0; }',
      '.dsh-screenshot-panel-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }',
      '.dsh-screenshot-panel-btn {',
      '  padding: 4px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; font-family: inherit;',
      '  border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.25));',
      '  background: transparent; color: var(--dsw-alias-label-primary, inherit);',
      '}',
      '.dsh-screenshot-panel-btn[data-primary="true"] {',
      '  background: var(--dsw-alias-brand-primary, #2b7fff); border-color: transparent; color: #fff;',
      '}',
      '.dsh-screenshot-warn { margin-top: 8px; color: var(--dsw-alias-state-warn-primary, #b8860b); }',
    ].join('\n');

    function ScissorsIcon() {
      return React.createElement(
        'svg',
        {
          width: 16,
          height: 16,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 2,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
        },
        React.createElement('circle', { cx: 6, cy: 6, r: 3 }),
        React.createElement('circle', { cx: 6, cy: 18, r: 3 }),
        React.createElement('line', { x1: 20, y1: 4, x2: 8.12, y2: 15.88 }),
        React.createElement('line', { x1: 14.47, y1: 14.48, x2: 20, y2: 20 }),
        React.createElement('line', { x1: 8.12, y1: 8.12, x2: 12, y2: 12 }),
      );
    }

    function SpinnerIcon() {
      return React.createElement(
        'svg',
        {
          className: 'dsh-screenshot-spin',
          width: 16,
          height: 16,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 2,
          strokeLinecap: 'round',
          'aria-hidden': true,
        },
        React.createElement('path', { d: 'M12 3a9 9 0 1 0 9 9' }),
      );
    }

    // ---- shared config state ------------------------------------------------

    let currentConfig = null; // { hotkey, mods, vk, global, daemon }
    const configListeners = new Set();

    function setConfig(next) {
      currentConfig = next;
      for (const listener of configListeners) listener(next);
    }

    function fetchConfig() {
      return fetch(CONFIG_ROUTE)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data) setConfig(data);
        })
        .catch(() => {});
    }

    /** Build a hotkey label from a keyboard event: "Ctrl+Alt+A" / "F5". */
    function comboFromEvent(e) {
      const parts = [];
      if (e.ctrlKey) parts.push('Ctrl');
      if (e.altKey) parts.push('Alt');
      if (e.shiftKey) parts.push('Shift');
      if (e.metaKey) parts.push('Win');
      let match = /^Key([A-Z])$/.exec(e.code);
      let key = match ? match[1] : null;
      if (!key) {
        match = /^Digit([0-9])$/.exec(e.code);
        key = match ? match[1] : null;
      }
      if (!key && /^F([1-9]|1\d|2[0-4])$/.test(e.code)) key = e.code;
      if (!key) return null; // pure modifier press or unknown key
      parts.push(key);
      return parts.join('+');
    }

    function codeForVk(vk) {
      if (vk >= 0x70) return `F${vk - 0x70 + 1}`;
      if (vk >= 0x41 && vk <= 0x5a) return `Key${String.fromCharCode(vk)}`;
      if (vk >= 0x30 && vk <= 0x39) return `Digit${vk - 0x30}`;
      return null;
    }

    function eventMatchesHotkey(e, config) {
      if (!config || config.mods === null || config.vk === null) return false;
      const mods = (e.ctrlKey ? 2 : 0) | (e.altKey ? 1 : 0) | (e.shiftKey ? 4 : 0) | (e.metaKey ? 8 : 0);
      if (mods !== config.mods) return false;
      const code = codeForVk(config.vk);
      return code !== null && e.code === code;
    }

    // ---- components ----------------------------------------------------------

    function SettingsPanel({ t, config, anchorRect, onClose }) {
      const [hotkey, setHotkey] = React.useState(config && config.hotkey ? config.hotkey : 'Alt+A');
      const [global, setGlobal] = React.useState(config ? config.global !== false : true);
      const [recording, setRecording] = React.useState(false);
      const [error, setError] = React.useState(null);
      const [saving, setSaving] = React.useState(false);

      React.useEffect(() => {
        if (!recording) return undefined;
        const onKey = (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (e.code === 'Escape') {
            setRecording(false);
            return;
          }
          const combo = comboFromEvent(e);
          if (combo) {
            setHotkey(combo);
            setRecording(false);
          }
        };
        document.addEventListener('keydown', onKey, true);
        return () => document.removeEventListener('keydown', onKey, true);
      }, [recording]);

      const save = async () => {
        setSaving(true);
        setError(null);
        try {
          const res = await fetch(CONFIG_ROUTE, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ hotkey, global }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => null);
            setError(data && data.message ? data.message : `HTTP ${res.status}`);
            return;
          }
          const data = await res.json();
          setConfig(data);
          onClose();
        } catch {
          setError('network error');
        } finally {
          setSaving(false);
        }
      };

      const style = {
        left: Math.max(8, Math.min(anchorRect.left, window.innerWidth - 280)),
        top: Math.min(anchorRect.bottom + 6, window.innerHeight - 240),
      };

      return React.createElement(
        'div',
        { className: 'dsh-screenshot-panel', style: style, role: 'dialog' },
        React.createElement('div', { className: 'dsh-screenshot-panel-title' }, t('settings')),
        React.createElement('div', null, t('hotkeyLabel')),
        React.createElement('input', {
          className: 'dsh-screenshot-hotkey-box',
          readOnly: true,
          value: recording ? '…' : hotkey,
          placeholder: t('hotkeyPlaceholder'),
          title: t('hotkeyHint'),
          onFocus: () => setRecording(true),
          onBlur: () => setRecording(false),
        }),
        React.createElement(
          'label',
          { className: 'dsh-screenshot-check-row' },
          React.createElement('input', {
            type: 'checkbox',
            checked: global,
            onChange: (e) => setGlobal(e.target.checked),
          }),
          React.createElement('span', null, t('globalLabel')),
        ),
        config && config.daemon === 'dead' && global
          ? React.createElement('div', { className: 'dsh-screenshot-warn' }, t('daemonWarn'))
          : null,
        error ? React.createElement('div', { className: 'dsh-screenshot-warn' }, error) : null,
        React.createElement(
          'div',
          { className: 'dsh-screenshot-panel-actions' },
          React.createElement('button', { type: 'button', className: 'dsh-screenshot-panel-btn', onClick: onClose }, t('cancel')),
          React.createElement(
            'button',
            { type: 'button', className: 'dsh-screenshot-panel-btn', 'data-primary': 'true', disabled: saving, onClick: save },
            t('save'),
          ),
        ),
      );
    }

    function ScreenshotButton({ t }) {
      const [state, setState] = React.useState('idle');
      const [panelOpen, setPanelOpen] = React.useState(false);
      const [anchorRect, setAnchorRect] = React.useState(null);
      const [config, setLocalConfig] = React.useState(currentConfig);
      const buttonRef = React.useRef(null);
      const timerRef = React.useRef(null);
      const busyRef = React.useRef(false);

      React.useEffect(() => {
        const listener = (next) => setLocalConfig(next);
        configListeners.add(listener);
        fetchConfig();
        return () => {
          configListeners.delete(listener);
        };
      }, []);

      // Re-read config when the window regains focus (config may have been
      // saved after a reload in another window or edited externally).
      React.useEffect(() => {
        let last = 0;
        const onFocus = () => {
          const now = Date.now();
          if (now - last > 15000) {
            last = now;
            fetchConfig();
          }
        };
        window.addEventListener('focus', onFocus);
        return () => window.removeEventListener('focus', onFocus);
      }, []);

      React.useEffect(() => () => {
        if (timerRef.current !== null) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      }, []);

      const flash = React.useCallback((next) => {
        setState(next);
        if (timerRef.current !== null) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          setState('idle');
        }, next === 'done' ? 900 : 2600);
      }, []);

      const startCapture = React.useCallback(async () => {
        if (busyRef.current) return;
        busyRef.current = true;
        setState('busy');
        try {
          const res = await fetch(CAPTURE_ROUTE, { method: 'POST' });
          if (res.status === 200) flash('done');
          else if (res.status === 204) setState('idle'); // user cancelled the selection
          else flash('error');
        } catch {
          flash('error');
        } finally {
          busyRef.current = false;
        }
      }, [flash]);

      // In-page hotkey fallback: active when the DSH window itself has focus.
      // When the global daemon owns the combo, RegisterHotKey swallows the
      // keystroke system-wide and this listener never fires — no double trigger.
      React.useEffect(() => {
        const onKey = (e) => {
          if (panelOpen) return;
          if (!eventMatchesHotkey(e, currentConfig)) return;
          e.preventDefault();
          e.stopPropagation();
          void startCapture();
        };
        document.addEventListener('keydown', onKey, true);
        return () => document.removeEventListener('keydown', onKey, true);
      }, [panelOpen, startCapture]);

      const tooltip = (() => {
        if (state === 'busy') return t('busy');
        if (state === 'error') return t('error');
        const hotkeySuffix = config && config.hotkey ? ` (${config.hotkey})` : '';
        return `${t('tip')}${hotkeySuffix}`;
      })();

      return React.createElement(
        React.Fragment,
        null,
        React.createElement('style', null, STYLE),
        React.createElement(
          'button',
          {
            ref: buttonRef,
            type: 'button',
            className: 'dsh-screenshot-btn',
            'data-state': state,
            title: tooltip,
            'aria-label': tooltip,
            onClick: () => void startCapture(),
            onContextMenu: (e) => {
              e.preventDefault();
              const rect = buttonRef.current ? buttonRef.current.getBoundingClientRect() : { left: 0, bottom: 0 };
              setAnchorRect(rect);
              setPanelOpen(true);
            },
          },
          state === 'busy' ? React.createElement(SpinnerIcon) : React.createElement(ScissorsIcon),
        ),
        panelOpen && anchorRect
          ? ReactDOM.createPortal(
            React.createElement(SettingsPanel, {
              t,
              config,
              anchorRect,
              onClose: () => setPanelOpen(false),
            }),
            document.body,
          )
          : null,
      );
    }

    function useLocaleTick(locale) {
      const [tick, setTick] = React.useState(0);
      React.useEffect(() => {
        if (locale && typeof locale.subscribe === 'function') {
          return locale.subscribe(() => setTick((value) => value + 1));
        }
        return undefined;
      }, [locale]);
      return tick;
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const { locale, slots } = ctx;
        ctx.effect(() => locale.register(NS, DICTS), 'dsh-screenshot-locale');
        const t = locale.bind(NS);

        const DockEntry = () => {
          useLocaleTick(locale);
          return React.createElement(ScreenshotButton, { t });
        };

        ctx.slots.inject('conversation.composer.dock', () =>
          slots.register(
            { name: 'conversation.composer.dock', id: 'dsh-screenshot', order: 10, label: 'Screenshot' },
            DockEntry,
          ),
        );
      },
    };
  },
});
