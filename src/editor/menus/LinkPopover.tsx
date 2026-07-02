import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";

const UNSAFE_SCHEMES = /^(javascript:|data:|vbscript:)/i;

function sanitizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (UNSAFE_SCHEMES.test(trimmed)) return null;
  // Prepend https:// if no scheme provided (bare domain / path)
  if (!/^[a-zA-Z][a-zA-Z0-9+\-.]*:/.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

interface Props {
  editor: Editor;
  onClose: () => void;
}

export function LinkPopover({ editor, onClose }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const existing = editor.getAttributes("link").href as string | undefined;
  const [value, setValue] = useState(existing ?? "");

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  function apply() {
    const href = sanitizeUrl(value);
    if (href) {
      editor.chain().focus().setLink({ href }).run();
    }
    onClose();
  }

  function remove() {
    editor.chain().focus().unsetLink().run();
    onClose();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      apply();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  return (
    <div data-testid="link-popover" className="link-popover">
      <input
        ref={inputRef}
        data-testid="link-url-input"
        className="link-popover-input"
        type="url"
        placeholder="https://…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        aria-label="Link URL"
      />
      <button className="link-popover-btn" onClick={apply} aria-label="Set link">
        Apply
      </button>
      {existing && (
        <button className="link-popover-btn link-popover-btn--remove" onClick={remove} aria-label="Remove link">
          Remove
        </button>
      )}
    </div>
  );
}
