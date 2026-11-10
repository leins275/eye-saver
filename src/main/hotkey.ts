/**
 * Turning a keyboard event into a Tauri global-shortcut string such as
 * "Ctrl+Alt+E", and validating what the user typed.
 */

export interface KeyLike {
  key: string;
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

const MODIFIER_TOKENS = new Set(
  [
    "ctrl",
    "control",
    "alt",
    "option",
    "shift",
    "super",
    "meta",
    "cmd",
    "command",
    "win",
    "cmdorctrl",
    "commandorcontrol",
  ].map((t) => t.toLowerCase()),
);

const MODIFIER_CODES = /^(Control|Alt|Shift|Meta|OS)(Left|Right)?$|^AltGraph$/;

/** Named (non-character) keys the shortcut parser accepts verbatim. */
const NAMED_CODES = new Set([
  "Space",
  "Enter",
  "Escape",
  "Backspace",
  "Tab",
  "Delete",
  "Insert",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Minus",
  "Equal",
  "BracketLeft",
  "BracketRight",
  "Backslash",
  "Semicolon",
  "Quote",
  "Comma",
  "Period",
  "Slash",
  "Backquote",
  "CapsLock",
  "NumLock",
  "ScrollLock",
  "PrintScreen",
  "Pause",
]);

/** The non-modifier part of a combo, or `null` when the key is a modifier / unknown. */
export function keyToken(e: Pick<KeyLike, "key" | "code">): string | null {
  const { code, key } = e;
  if (MODIFIER_CODES.test(code)) return null;
  if (key === "Control" || key === "Alt" || key === "Shift" || key === "Meta") return null;

  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1];
  const digit = /^Digit(\d)$/.exec(code);
  if (digit) return digit[1];
  if (/^F([1-9]|1\d|2[0-4])$/.test(code)) return code;
  if (/^Numpad/.test(code)) return code;
  if (NAMED_CODES.has(code)) return code;

  // Synthetic events / unusual layouts: fall back to a printable key.
  if (key.length === 1 && key.trim() !== "") return key.toUpperCase();
  return null;
}

/** "Ctrl+Alt+E" for a keydown, `null` while only modifiers are held. */
export function comboFromKeyboardEvent(e: KeyLike): string | null {
  const token = keyToken(e);
  if (token === null) return null;
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  if (e.metaKey) parts.push("Super");
  parts.push(token);
  return parts.join("+");
}

export function isModifierToken(token: string): boolean {
  return MODIFIER_TOKENS.has(token.trim().toLowerCase());
}

/** A combo is usable when every token is non-empty and at least one is not a modifier. */
export function isValidCombo(combo: string): boolean {
  const tokens = combo.split("+").map((t) => t.trim());
  if (tokens.length === 0 || tokens.some((t) => t === "")) return false;
  return tokens.some((t) => !isModifierToken(t));
}
