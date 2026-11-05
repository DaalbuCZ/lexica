import { Children, useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  Button as ThemeButton,
  IconButton as ThemeIconButton,
  TextField,
  TextArea,
  Checkbox,
  Select as ThemeSelect,
  Theme,
} from '@radix-ui/themes';
import { X } from 'lucide-react';
import { useAnchoredPanel } from '../hooks/useAnchoredPanel.js';
import { useStudio } from '../state/studio.js';
export function IconButton({
  icon: Icon,
  label,
  title = label,
  children,
  className = '',
  ...props
}) {
  const Component = children ? ThemeButton : ThemeIconButton;
  return (
    <Component
      size="2"
      variant="soft"
      type="button"
      className={`${children ? 'app-icon-label' : 'app-icon-button'} ${className}`}
      aria-label={label}
      title={title}
      {...props}
    >
      {Icon && <Icon className="tool-icon" aria-hidden="true" />}
      {children}
    </Component>
  );
}
export function Button({ className = '', type = 'button', ...props }) {
  return (
    <ThemeButton
      size="2"
      type={type}
      variant={className.includes('primary') ? 'solid' : 'soft'}
      color={className.includes('danger') ? 'red' : undefined}
      className={`app-button ${className}`}
      {...props}
    />
  );
}
export function Modal({ title, children, onClose, className = '', anchorId, onCloseAutoFocus }) {
  const [panel, setPanel] = useState(null);
  const open = useStudio((s) => !!s.dialog);
  useAnchoredPanel(panel, anchorId);
  return (
    <Dialog.Root
      open={open}
      modal={!anchorId}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        {!anchorId && <Dialog.Overlay className="modal-backdrop" />}
        <Theme asChild>
          <Dialog.Content
            ref={setPanel}
            className={`react-dialog animated-window ${anchorId ? 'tool-panel' : ''} ${className}`}
            aria-describedby={undefined}
            onCloseAutoFocus={onCloseAutoFocus}
            onInteractOutside={(event) => {
              // The trigger toggles itself; other outside clicks/focus dismiss the tool.
              if (
                anchorId &&
                document.getElementById(anchorId)?.contains(event.detail.originalEvent.target)
              )
                event.preventDefault();
            }}
          >
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
        </Theme>
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
      {multiline ? <TextArea size="2" {...shared} /> : <TextField.Root size="2" {...shared} />}
    </label>
  );
}
export function Check({ label, checked, onChange, ...props }) {
  return (
    <label className="check">
      <Checkbox
        size="2"
        checked={!!checked}
        onCheckedChange={(value) => onChange(value === true)}
        {...props}
      />
      {label}
    </label>
  );
}
export function Select({ label, value, onChange, children, ...props }) {
  const empty = '__lexica_empty_option__';
  return (
    <label className="prop-field">
      {label}
      <ThemeSelect.Root
        size="2"
        value={value || empty}
        onValueChange={(value) => onChange(value === empty ? '' : value)}
      >
        <ThemeSelect.Trigger
          aria-label={typeof label === 'string' ? label : undefined}
          {...props}
        />
        <ThemeSelect.Content position="popper">
          {Children.toArray(children)
            .filter(Boolean)
            .map((option) => (
              <ThemeSelect.Item
                key={option.props.value || empty}
                value={option.props.value || empty}
                disabled={option.props.disabled}
              >
                {option.props.children}
              </ThemeSelect.Item>
            ))}
        </ThemeSelect.Content>
      </ThemeSelect.Root>
    </label>
  );
}
