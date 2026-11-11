const MOD_ORDER = ['Ctrl', 'Alt', 'Shift', 'Win'];

export const shortcutState = { recording: false };

export function keyFromEvent(e: KeyboardEvent): string | null {
  const c = e.code;
  if (/^(Control|Alt|Shift|Meta|OS)(Left|Right)?$/.test(c)) return null;
  let m = /^Key([A-Z])$/.exec(c);
  if (m) return m[1];
  m = /^Digit(\d)$/.exec(c);
  if (m) return m[1];
  if (/^F\d{1,2}$/.test(c)) return c;
  const map: Record<string, string> = {
    Space: 'Space',
    Enter: 'Enter',
    Backquote: '`',
    Minus: '-',
    Equal: '=',
    BracketLeft: '[',
    BracketRight: ']',
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/',
    Backslash: '\\',
    Tab: 'Tab',
    Escape: 'Esc',
    Delete: 'Delete',
    Insert: 'Insert',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
  };
  if (map[c]) return map[c];
  return e.key && e.key.length === 1 ? e.key.toUpperCase() : null;
}

export function eventToShortcut(e: KeyboardEvent): { combo: string; complete: boolean } {
  const mods: string[] = [];
  if (e.ctrlKey) mods.push('Ctrl');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  if (e.metaKey) mods.push('Win');
  const key = keyFromEvent(e);
  return { combo: [...mods, ...(key ? [key] : [])].join('+'), complete: !!key };
}

export function matchesShortcut(e: KeyboardEvent, shortcut: string): boolean {
  const { combo, complete } = eventToShortcut(e);
  return complete && combo.toLowerCase() === shortcut.toLowerCase();
}

export const formatShortcut = (s: string) => s.split('+').join(' + ');

const RESERVED = new Set(
  [
    'Alt+F4', 'Alt+Tab', 'Alt+Space', 'Alt+Esc', 'Ctrl+Esc', 'Ctrl+Shift+Esc', 'Ctrl+Alt+Delete', 'Alt+Enter',
    'Ctrl+C', 'Ctrl+V', 'Ctrl+X', 'Ctrl+Z', 'Ctrl+Y', 'Ctrl+A', 'Ctrl+S', 'Ctrl+P', 'Ctrl+F', 'Ctrl+W', 'Ctrl+T',
    'Ctrl+N', 'Ctrl+R', 'Ctrl+Shift+T', 'Ctrl+Shift+N', 'Ctrl+Shift+W', 'Ctrl+Tab', 'Alt+Left', 'Alt+Right',
    'Alt+D', 'Alt+F', 'Alt+E', 'Alt+V', 'Alt+H',
  ].map((s) => s.toLowerCase()),
);

export function validateShortcut(s: string): { ok: boolean; reason?: string } {
  const parts = s.split('+');
  const key = parts[parts.length - 1];
  const mods = parts.slice(0, -1);
  if (!key || MOD_ORDER.includes(key)) return { ok: false, reason: 'Add a non-modifier key to complete the shortcut.' };
  if (mods.length === 0) return { ok: false, reason: 'Use at least one modifier (Ctrl, Alt, Shift or Win).' };
  if (mods.length === 1 && mods[0] === 'Shift') return { ok: false, reason: 'Shift-only shortcuts conflict with typing.' };
  if (mods.includes('Win')) return { ok: false, reason: 'Windows-key shortcuts are reserved by Windows.' };
  if (RESERVED.has(s.toLowerCase())) return { ok: false, reason: `${formatShortcut(s)} is already used by Windows or common applications.` };
  return { ok: true };
}
