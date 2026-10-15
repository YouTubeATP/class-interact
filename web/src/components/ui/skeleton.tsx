import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export const Skeleton = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => <div className={cn('animate-pulse-soft rounded-xl bg-ink/7', className)} {...props} />;
