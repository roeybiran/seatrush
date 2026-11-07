import type { ReactNode } from 'react';

export function ContentUnavailable({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      {icon && (
        <span className="empty-state-icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <h2>{title}</h2>
      {children}
    </div>
  );
}
