import { describe, expect, it } from "vitest";
import { comboFromKeyboardEvent, isValidCombo, keyToken, type KeyLike } from "./hotkey";

function ev(partial: Partial<KeyLike>): KeyLike {
  return {
    key: "",
    code: "",
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    ...partial,
  };
}

describe("comboFromKeyboardEvent", () => {
  it("orders modifiers Ctrl, Alt, Shift, Super and uppercases letters", () => {
    expect(
      comboFromKeyboardEvent(ev({ key: "e", code: "KeyE", ctrlKey: true, altKey: true })),
    ).toBe("Ctrl+Alt+E");
    expect(
      comboFromKeyboardEvent(
        ev({ key: "M", code: "KeyM", shiftKey: true, metaKey: true, altKey: true, ctrlKey: true }),
      ),
    ).toBe("Ctrl+Alt+Shift+Super+M");
  });

  it("returns null while only modifiers are held", () => {
    expect(
      comboFromKeyboardEvent(ev({ key: "Control", code: "ControlLeft", ctrlKey: true })),
    ).toBeNull();
    expect(
      comboFromKeyboardEvent(ev({ key: "Shift", code: "ShiftRight", shiftKey: true })),
    ).toBeNull();
    expect(comboFromKeyboardEvent(ev({ key: "Alt", code: "AltLeft", altKey: true }))).toBeNull();
  });

  it("uses digits, F-keys and named keys", () => {
    expect(comboFromKeyboardEvent(ev({ key: "1", code: "Digit1", ctrlKey: true }))).toBe("Ctrl+1");
    expect(comboFromKeyboardEvent(ev({ key: "F9", code: "F9" }))).toBe("F9");
    expect(comboFromKeyboardEvent(ev({ key: " ", code: "Space", altKey: true }))).toBe("Alt+Space");
    expect(comboFromKeyboardEvent(ev({ key: "ArrowUp", code: "ArrowUp", ctrlKey: true }))).toBe(
      "Ctrl+ArrowUp",
    );
  });

  it("falls back to the printable key when the code is unknown", () => {
    expect(keyToken({ key: "ж", code: "" })).toBe("Ж");
    expect(keyToken({ key: "Dead", code: "" })).toBeNull();
  });
});

describe("isValidCombo", () => {
  it("requires at least one non-modifier key", () => {
    expect(isValidCombo("Ctrl+Alt+E")).toBe(true);
    expect(isValidCombo("F9")).toBe(true);
    expect(isValidCombo("Ctrl+Alt")).toBe(false);
    expect(isValidCombo("Shift+Super")).toBe(false);
    expect(isValidCombo("CmdOrCtrl+Shift")).toBe(false);
  });

  it("rejects empty tokens", () => {
    expect(isValidCombo("")).toBe(false);
    expect(isValidCombo("Ctrl++E")).toBe(false);
    expect(isValidCombo("Ctrl+")).toBe(false);
  });
});
