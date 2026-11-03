import { Button } from './ui.jsx';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Theme } from '@radix-ui/themes';
import { useStudio } from '../state/studio.js';

export function ContextMenu({ menu }) {
  const close = () => useStudio.setState({ contextMenu: null });
  return (
    <DropdownMenu.Root
      open
      modal={false}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DropdownMenu.Trigger asChild>
        <Button
          type="button"
          tabIndex={-1}
          aria-label="Context menu"
          className="context-menu-anchor"
          style={{ left: menu.x, top: menu.y }}
        />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <Theme asChild>
          <DropdownMenu.Content
            className="breadcrumb-menu react-menu"
            side="bottom"
            align="start"
            sideOffset={0}
            collisionPadding={8}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              document.getElementById('canvas')?.focus({ preventScroll: true });
            }}
          >
            {menu.items.map((item) => (
              <DropdownMenu.Item
                key={item.label}
                className="react-menu-item"
                onSelect={() => {
                  close();
                  item.action();
                }}
              >
                {item.label}
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </Theme>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
