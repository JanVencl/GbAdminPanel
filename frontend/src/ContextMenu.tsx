import { useEffect, useLayoutEffect, useRef, useState } from "react";

export type MenuEntry =
  | {
      label: string;
      icon?: string;
      danger?: boolean;
      disabled?: boolean;
      onClick: () => void;
    }
  | "-";

type Props = {
  x: number;
  y: number;
  entries: MenuEntry[];
  onClose: () => void;
};

export default function ContextMenu({ x, y, entries, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const items = entries.map((e, i) => ({ e, i })).filter(({ e }) => e !== "-" && !e.disabled);
  const [focus, setFocus] = useState(0);

  // Keep the menu inside the window.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      left: Math.max(4, Math.min(x, window.innerWidth - r.width - 4)),
      top: Math.max(4, Math.min(y, window.innerHeight - r.height - 4)),
    });
    el.focus();
  }, [x, y]);

  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const blur = () => onClose();
    window.addEventListener("mousedown", down, true);
    window.addEventListener("blur", blur);
    window.addEventListener("resize", blur);
    return () => {
      window.removeEventListener("mousedown", down, true);
      window.removeEventListener("blur", blur);
      window.removeEventListener("resize", blur);
    };
  }, [onClose]);

  const choose = (i: number) => {
    const entry = entries[i];
    if (entry === "-" || entry.disabled) return;
    onClose();
    entry.onClick();
  };

  return (
    <div
      ref={ref}
      className="menu"
      role="menu"
      tabIndex={-1}
      style={pos}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
        else if (e.key === "ArrowDown") setFocus((f) => (f + 1) % items.length);
        else if (e.key === "ArrowUp") setFocus((f) => (f - 1 + items.length) % items.length);
        else if (e.key === "Enter" && items[focus]) choose(items[focus].i);
        else return;
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {entries.map((entry, i) =>
        entry === "-" ? (
          <div key={i} className="menu-sep" role="separator" />
        ) : (
          <div
            key={i}
            role="menuitem"
            aria-disabled={entry.disabled}
            className={[
              "menu-item",
              entry.danger ? "danger" : "",
              entry.disabled ? "disabled" : "",
              items[focus]?.i === i ? "focus" : "",
            ].join(" ")}
            onMouseEnter={() => setFocus(Math.max(0, items.findIndex((it) => it.i === i)))}
            onClick={() => choose(i)}
          >
            <span className="menu-icon">{entry.icon}</span>
            {entry.label}
          </div>
        ),
      )}
    </div>
  );
}
