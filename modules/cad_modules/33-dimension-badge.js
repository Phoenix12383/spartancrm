// ═══════════════════════════════════════════════════════════════════════════
// Dimension Badge — click-to-edit pill for zone sizes
// ═══════════════════════════════════════════════════════════════════════════

function DimBadge({ value, onCommit, style, pillStyle, inputStyle }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(Math.round(value)));
  const inputRef = useRef(null);

  useEffect(() => { setDraft(String(Math.round(value))); }, [value]);
  useEffect(() => { if (editing && inputRef.current) inputRef.current.select(); }, [editing]);

  const commit = () => {
    const v = parseInt(draft, 10);
    if (!isNaN(v) && v >= 150) onCommit(v);
    setEditing(false);
  };

  if (editing) {
    return <div style={style}>
      <input ref={inputRef} type="number" value={draft} min={150} step={10}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
        onBlur={commit}
        style={inputStyle} autoFocus />
    </div>;
  }
  return <div style={style} onClick={() => setEditing(true)}>
    <span style={pillStyle}>{Math.round(value)}mm</span>
  </div>;
}

