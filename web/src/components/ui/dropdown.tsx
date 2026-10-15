import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export const Menu = DropdownMenu.Root;
export const MenuTrigger = DropdownMenu.Trigger;

export function MenuContent({ className, children, ...props }: ComponentPropsWithoutRef<typeof DropdownMenu.Content>) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        align="end"
        sideOffset={6}
        className={cn('z-50 min-w-48 origin-[var(--radix-dropdown-menu-content-transform-origin)] rounded-2xl border border-line bg-surface p-1.5 shadow-[0_18px_50px_-18px_rgb(22_27_51/.35)] data-[state=open]:animate-[menu-in_140ms_ease-out]', className)}
        {...props}
      >
        {children}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  );
}

export function MenuItem({ icon, danger, className, children, ...props }: ComponentPropsWithoutRef<typeof DropdownMenu.Item> & { icon?: ReactNode; danger?: boolean }) {
  return (
    <DropdownMenu.Item
      className={cn('flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium outline-none data-[highlighted]:bg-ink/6 data-[disabled]:opacity-40', danger ? 'text-bad data-[highlighted]:bg-bad-soft' : 'text-ink', className)}
      {...props}
    >
      {icon && <span className="grid size-4 place-items-center text-current opacity-70">{icon}</span>}
      {children}
    </DropdownMenu.Item>
  );
}

export const MenuSeparator = () => <DropdownMenu.Separator className="my-1 h-px bg-line" />;
