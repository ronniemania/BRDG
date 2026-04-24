import { useState, useRef, useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface PopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

interface PopoverTriggerProps {
  asChild?: boolean;
  children: ReactNode;
}

interface PopoverContentProps {
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
  className?: string;
  children: ReactNode;
}

const PopoverContext = React.createContext<{
  open: boolean;
  setOpen: (v: boolean) => void;
  triggerRef: React.RefObject<HTMLElement | null>;
} | null>(null);

import React, { createContext, useContext } from 'react';

export function Popover({ open, onOpenChange, children }: PopoverProps) {
  const triggerRef = useRef<HTMLElement | null>(null);
  return (
    <PopoverContext.Provider value={{ open, setOpen: onOpenChange, triggerRef }}>
      <div style={{ position: 'relative', display: 'inline-block' }}>{children}</div>
    </PopoverContext.Provider>
  );
}

export function PopoverTrigger({ asChild, children }: PopoverTriggerProps) {
  const ctx = useContext(PopoverContext);
  if (!ctx) throw new Error('PopoverTrigger must be inside Popover');
  const { open, setOpen, triggerRef } = ctx;

  const child = asChild ? (children as React.ReactElement) : <button type="button">{children}</button>;

  return React.cloneElement(child as React.ReactElement<any>, {
    ref: triggerRef,
    onClick: (e: React.MouseEvent) => {
      setOpen(!open);
      (child as any).props?.onClick?.(e);
    },
  });
}

export function PopoverContent({ align = 'center', sideOffset = 4, className = '', children }: PopoverContentProps) {
  const ctx = useContext(PopoverContext);
  if (!ctx) throw new Error('PopoverContent must be inside Popover');
  const { open, setOpen, triggerRef } = ctx;
  const contentRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const scrollY = window.scrollY;
    const scrollX = window.scrollX;
    let left = scrollX + rect.left;
    if (align === 'end') left = scrollX + rect.right;
    if (align === 'center') left = scrollX + rect.left + rect.width / 2;
    setPos({ top: scrollY + rect.bottom + sideOffset, left });
  }, [open, align, sideOffset]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        contentRef.current && !contentRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open, setOpen]);

  if (!open) return null;

  const style: React.CSSProperties = {
    position: 'absolute',
    top: pos.top,
    zIndex: 9999,
  };

  if (align === 'end') {
    style.right = `calc(100vw - ${pos.left}px)`;
  } else if (align === 'center') {
    style.transform = 'translateX(-50%)';
    style.left = pos.left;
  } else {
    style.left = pos.left;
  }

  return createPortal(
    <div ref={contentRef} style={style} className={className}>{children}</div>,
    document.body
  );
}
