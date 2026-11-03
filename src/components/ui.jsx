import { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
export function IconButton({ icon: Icon, label, title = label, children, ...props }) {
  return (
    <button type="button" aria-label={label} title={title} {...props}>
      {Icon && <Icon className="tool-icon" aria-hidden="true" />}
      {children}
    </button>
  );
}
export function Modal({ title, children, onClose, className = '' }) {
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="modal-backdrop" />
        <Dialog.Content className={`react-dialog ${className}`} aria-describedby={undefined}>
          <div className="dialog-heading">
            <Dialog.Title asChild>
              <h2>{title}</h2>
            </Dialog.Title>
            <Dialog.Close asChild>
              <IconButton icon={X} label={`Close ${title}`} />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Keep a local draft: graph updates must never overwrite an unfinished field. */
export function Field({
  label,
  value = '',
  onCommit,
  multiline = false,
  live = false,
  onFocus,
  className = 'prop-field',
  ...props
}) {
  const [draft, setDraft] = useState(String(value));
  const [focused, setFocused] = useState(false);
  const cancelled = useRef(false);
  useEffect(() => {
    if (!focused) setDraft(String(value));
  }, [value, focused]);
  const commit = () => {
    if (draft !== String(value)) onCommit(draft);
  };
  const shared = {
    ...props,
    value: draft,
    onFocus: () => {
      cancelled.current = false;
      setFocused(true);
      onFocus?.();
    },
    onChange: (e) => {
      setDraft(e.target.value);
      if (live) onCommit(e.target.value);
    },
    onBlur: () => {
      if (!cancelled.current && !live) commit();
      setFocused(false);
    },
    onKeyDown: (e) => {
      if (e.key === 'Enter' && !multiline) {
        e.preventDefault();
        e.currentTarget.blur();
      }
      if (e.key === 'Escape') {
        setDraft(String(value));
        cancelled.current = true;
        e.currentTarget.blur();
        e.stopPropagation();
      }
    },
  };
  return (
    <label className={className}>
      {label}
      {multiline ? <textarea {...shared} /> : <input {...shared} />}
    </label>
  );
}
export function Check({ label, checked, onChange, ...props }) {
  return (
    <label className="check">
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(e) => onChange(e.target.checked)}
        {...props}
      />
      {label}
    </label>
  );
}
export function Select({ label, value, onChange, children, ...props }) {
  return (
    <label className="prop-field">
      {label}
      <select
        aria-label={typeof label === 'string' ? label : undefined}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        {...props}
      >
        {children}
      </select>
    </label>
  );
}
