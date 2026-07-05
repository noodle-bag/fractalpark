'use client';

import { useState, useCallback, useRef, lazy, Suspense } from 'react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { Star, Maximize2, Film, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { GalleryItem } from '@/hooks/useGalleryItems';
import { BuiltinBadge } from './BuiltinBadge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { PresetThumbnail } from './PresetThumbnail';

// Lazy load AnimatedFractalCanvas to avoid bundling in main chunk
const AnimatedFractalCanvas = lazy(() => import('@/components/fractal/AnimatedFractalCanvas'));

interface GalleryCardProps {
  fractal: GalleryItem;
  href: string;
  isHovered: boolean;
  onHoverChange: (isHovered: boolean) => void;
  onToggleStar: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onFullscreen: (fractal: GalleryItem) => void;
  isBuiltin?: boolean;
  featured?: boolean;
}

export function GalleryCard({
  fractal,
  href,
  isHovered,
  onHoverChange,
  onToggleStar,
  onDelete,
  onRename,
  onFullscreen,
  isBuiltin = false,
  featured = false,
}: GalleryCardProps) {
  const t = useTranslations('gallery');
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(fractal.name);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [isTouching, setIsTouching] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLAnchorElement>(null);

  const hasAnimation = (fractal.animation?.keyframes.length ?? 0) >= 2;
  const shouldShowAnimation = isHovered && hasAnimation;

  const handleRenameSubmit = useCallback(() => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== fractal.name) {
      onRename(fractal.id, trimmed);
    } else {
      setEditName(fractal.name);
    }
    setIsEditing(false);
  }, [editName, fractal.name, fractal.id, onRename]);

  // Long press handling for mobile
  const handleTouchStart = useCallback(() => {
    setIsTouching(true);
    longPressTimer.current = setTimeout(() => {
      setContextMenuOpen(true);
    }, 500);
  }, []);

  const handleTouchEnd = useCallback(() => {
    setIsTouching(false);
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenuOpen(true);
  }, []);

  return (
    <>
      <a
        ref={containerRef}
        href={href}
        className="relative block aspect-square overflow-hidden group"
        onMouseEnter={() => onHoverChange(true)}
        onMouseLeave={() => onHoverChange(false)}
        onContextMenu={handleContextMenu}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchEnd}
      >
        {/* Static thumbnail */}
        <div
          className={cn(
            'absolute inset-0 transition-opacity duration-300',
            shouldShowAnimation ? 'opacity-0' : 'opacity-100'
          )}
        >
          {fractal.thumbnail ? (
            <Image
              src={fractal.thumbnail}
              alt={fractal.name}
              fill
              unoptimized
              className="object-cover"
              sizes="(max-width: 375px) 50vw, (max-width: 600px) 33vw, (max-width: 768px) 25vw, (max-width: 1024px) 16vw, 11vw"
            />
          ) : isBuiltin ? (
            <PresetThumbnail
              params={fractal.params}
              presetId={fractal.id}
              className="w-full h-full"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-slate-800 via-slate-700 to-slate-600" />
          )}
        </div>

        {/* Animated canvas (only when hovered and has animation) */}
        {shouldShowAnimation && (
          <div className="absolute inset-0">
            <Suspense fallback={null}>
              <AnimatedFractalCanvas
                params={fractal.params}
                keyframes={fractal.animation!.keyframes}
                dprScale={0.5}
                active={true}
                className="w-full h-full"
              />
            </Suspense>
          </div>
        )}

        {/* Animation indicator */}
        {hasAnimation && (
          <div className="absolute bottom-1.5 left-1.5 pointer-events-none">
            <Film className="h-3.5 w-3.5 text-white/70 drop-shadow-md" />
          </div>
        )}

        {/* Card name overlay */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5 pointer-events-none">
          <span className="text-xs text-white/90 truncate block">{fractal.name}</span>
        </div>

        {/* Builtin badge */}
        {isBuiltin && featured && <BuiltinBadge />}

        {/* Star button — visible on hover/touch or when starred */}
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleStar(fractal.id);
          }}
          className={cn(
            'absolute top-1.5 right-1.5 p-2 rounded-full',
            'bg-black/40 hover:bg-black/60',
            'transition-opacity duration-200',
            fractal.starred || isHovered || isTouching ? 'opacity-100' : 'opacity-0'
          )}
        >
          <Star
            className={cn(
              'h-3.5 w-3.5',
              fractal.starred ? 'fill-yellow-400 text-yellow-400' : 'text-white'
            )}
          />
        </button>

        {/* Fullscreen button — visible on hover/touch */}
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onFullscreen(fractal);
          }}
          className={cn(
            'absolute bottom-1.5 right-1.5 p-2 rounded-full',
            'bg-black/40 hover:bg-black/60',
            'transition-opacity duration-200',
            isHovered || isTouching ? 'opacity-100' : 'opacity-0'
          )}
        >
          <Maximize2 className="h-3.5 w-3.5 text-white" />
        </button>

        {/* Context menu trigger — visible on hover/touch */}
        <DropdownMenu open={contextMenuOpen} onOpenChange={setContextMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                'absolute top-1.5 left-1.5 p-2 rounded-full bg-black/40 hover:bg-black/60 transition-opacity',
                isHovered || isTouching ? 'opacity-100' : 'opacity-0'
              )}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <MoreHorizontal className="h-3.5 w-3.5 text-white" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggleStar(fractal.id);
              }}
            >
              <Star className={cn('mr-2 h-4 w-4', fractal.starred && 'fill-yellow-400 text-yellow-400')} />
              {fractal.starred ? t('contextMenu.unstar') : t('contextMenu.star')}
            </DropdownMenuItem>
            {!isBuiltin && (
              <>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setEditName(fractal.name);
                    setIsEditing(true);
                  }}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  {t('contextMenu.rename')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowDeleteDialog(true);
                  }}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t('contextMenu.delete')}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </a>

      {/* Rename Dialog */}
      {isEditing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsEditing(false);
            }
          }}
        >
          <div className="bg-background p-4 rounded-lg shadow-lg max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold mb-3">{t('card.renameTitle')}</h3>
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRenameSubmit();
                if (e.key === 'Escape') setIsEditing(false);
              }}
              className="mb-4"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
                onClick={() => setIsEditing(false)}
              >
                {t('card.renameCancel')}
              </button>
              <button
                className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded"
                onClick={handleRenameSubmit}
              >
                {t('card.renameSave')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('card.deleteConfirm.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('card.deleteConfirm.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('card.deleteConfirm.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => onDelete(fractal.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('card.deleteConfirm.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
