import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { SlashItem } from "../extensions/SlashMenu";

export interface SlashMenuHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

interface Props {
  items: SlashItem[];
  command: (item: SlashItem) => void;
}

const SlashMenuRenderer = forwardRef<SlashMenuHandle, Props>(({ items, command }, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  // Shadow state with a ref so Enter always reads the latest index synchronously,
  // even when ArrowDown and Enter fire in the same event batch.
  const selectedIndexRef = useRef(0);

  function updateIndex(i: number) {
    selectedIndexRef.current = i;
    setSelectedIndex(i);
  }

  useEffect(() => {
    updateIndex(0);
  }, [items]);

  useImperativeHandle(ref, () => ({
    onKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowUp") {
        updateIndex(selectedIndexRef.current <= 0 ? items.length - 1 : selectedIndexRef.current - 1);
        return true;
      }
      if (event.key === "ArrowDown") {
        updateIndex(selectedIndexRef.current >= items.length - 1 ? 0 : selectedIndexRef.current + 1);
        return true;
      }
      if (event.key === "Enter") {
        const item = items[selectedIndexRef.current];
        if (item) command(item);
        return true;
      }
      return false;
    },
  }));

  if (items.length === 0) {
    return (
      <div data-testid="slash-menu" role="listbox" className="slash-menu">
        <div className="slash-item slash-item--empty">No matches</div>
      </div>
    );
  }

  return (
    <div
      data-testid="slash-menu"
      role="listbox"
      aria-label="Format block"
      aria-activedescendant={`slash-item-${selectedIndex}`}
      className="slash-menu"
    >
      {items.map((item, i) => (
        <div
          key={item.label}
          id={`slash-item-${i}`}
          data-testid="slash-item"
          role="option"
          aria-selected={i === selectedIndex}
          className={`slash-item${i === selectedIndex ? " is-active" : ""}`}
          onMouseEnter={() => setSelectedIndex(i)}
          onMouseDown={(e) => {
            e.preventDefault();
            command(item);
          }}
        >
          <span className="slash-item-label">{item.label}</span>
          <span className="slash-item-hint">{item.hint}</span>
        </div>
      ))}
    </div>
  );
});

SlashMenuRenderer.displayName = "SlashMenuRenderer";
export default SlashMenuRenderer;
