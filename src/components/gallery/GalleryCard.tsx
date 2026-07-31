'use client';

import { useCallback, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { MoreHorizontal, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import type { ArtworkGalleryItem } from '@/lib/artwork-repository';
import type { PublishedArtwork } from '@/lib/published-artworks';
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

interface PublishedArtworkCardProps {
  artwork: PublishedArtwork;
  href: string;
  onOpen?: () => void;
}

export function PublishedArtworkCard({
  artwork,
  href,
  onOpen,
}: PublishedArtworkCardProps) {
  return (
    <article>
      <Link href={href} onClick={onOpen} className="group block">
        <div className="relative aspect-[16/10] overflow-hidden rounded-lg bg-muted">
          {artwork.thumbnail ? (
            <Image
              src={artwork.thumbnail}
              alt=""
              fill
              unoptimized
              className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              sizes="(max-width: 639px) 100vw, (max-width: 899px) 50vw, (max-width: 1199px) 33vw, (max-width: 1599px) 25vw, (max-width: 2199px) 20vw, 17vw"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-slate-800 via-slate-700 to-slate-600" />
          )}
        </div>
        <h2 className="mt-3 truncate font-medium group-hover:underline">
          {artwork.name}
        </h2>
      </Link>
    </article>
  );
}

interface LocalArtworkCardProps {
  artwork: ArtworkGalleryItem;
  href: string;
  onDelete: (id: string) => unknown;
  onRename: (id: string, name: string) => unknown;
  onOpen?: () => void;
}

export function LocalArtworkCard({
  artwork,
  href,
  onDelete,
  onRename,
  onOpen,
}: LocalArtworkCardProps) {
  const t = useTranslations('gallery');
  const [menuOpen, setMenuOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(artwork.name);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const handleRenameSubmit = useCallback(() => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== artwork.name) {
      onRename(artwork.id, trimmed);
    } else {
      setEditName(artwork.name);
    }
    setIsEditing(false);
  }, [artwork.id, artwork.name, editName, onRename]);

  return (
    <article className="relative">
      <Link
        href={href}
        onClick={onOpen}
        onContextMenu={(event) => {
          event.preventDefault();
          setMenuOpen(true);
        }}
        className="group block"
      >
        <div className="relative aspect-[16/10] overflow-hidden rounded-lg bg-gradient-to-br from-slate-800 via-slate-700 to-slate-600">
          {artwork.thumbnail && (
            <Image
              src={artwork.thumbnail}
              alt=""
              fill
              unoptimized
              className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              sizes="(max-width: 639px) 100vw, (max-width: 899px) 50vw, (max-width: 1199px) 33vw, (max-width: 1599px) 25vw, (max-width: 2199px) 20vw, 17vw"
            />
          )}
        </div>
        <h2 className="mt-3 truncate pr-10 font-medium group-hover:underline">
          {artwork.name}
        </h2>
      </Link>

      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={t('mine.actions', { name: artwork.name })}
            className="absolute bottom-0 right-0 rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={href} onClick={onOpen}>
              <RotateCcw className="mr-2 h-4 w-4" />
              {t('contextMenu.restore')}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              setEditName(artwork.name);
              setIsEditing(true);
            }}
          >
            <Pencil className="mr-2 h-4 w-4" />
            {t('contextMenu.rename')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setShowDeleteDialog(true)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {t('contextMenu.delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {isEditing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={(event) => {
            if (event.target === event.currentTarget) setIsEditing(false);
          }}
        >
          <div className="mx-4 w-full max-w-sm rounded-lg bg-background p-4 shadow-lg">
            <h3 className="mb-3 text-lg font-semibold">{t('card.renameTitle')}</h3>
            <Input
              value={editName}
              onChange={(event) => setEditName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleRenameSubmit();
                if (event.key === 'Escape') setIsEditing(false);
              }}
              className="mb-4"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
                onClick={() => setIsEditing(false)}
              >
                {t('card.renameCancel')}
              </button>
              <button
                type="button"
                className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground"
                onClick={handleRenameSubmit}
              >
                {t('card.renameSave')}
              </button>
            </div>
          </div>
        </div>
      )}

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
              onClick={() => onDelete(artwork.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('card.deleteConfirm.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
}
