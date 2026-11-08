import type { ReactNode } from 'react';
import {
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';

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
    <Empty className="empty-state">
      <EmptyHeader>
        {icon && (
          <EmptyMedia
            variant="icon"
            className="empty-state-icon"
            aria-hidden="true"
          >
            {icon}
          </EmptyMedia>
        )}
        <EmptyTitle>
          <h2>{title}</h2>
        </EmptyTitle>
      </EmptyHeader>
      {children && <EmptyContent>{children}</EmptyContent>}
    </Empty>
  );
}
