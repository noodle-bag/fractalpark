import { useState } from 'react';
import Link from 'next/link';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

function DraftForm() {
  const [draft, setDraft] = useState('0');
  return (
    <form>
      <Label htmlFor="coordinate">Coordinate</Label>
      <Input id="coordinate" value={draft} onChange={event => setDraft(event.target.value)} />
      <output aria-label="Draft">{draft}</output>
    </form>
  );
}

describe('Interface foundations', () => {
  it('preserves labeled input drafts without coercing incomplete numbers', () => {
    render(<DraftForm />);
    const input = screen.getByLabelText('Coordinate');
    fireEvent.change(input, { target: { value: '-0.' } });
    expect(input).toHaveValue('-0.');
    expect(screen.getByLabelText('Draft')).toHaveTextContent('-0.');
  });

  it('retains button delegation and disabled behavior', () => {
    const onClick = vi.fn();
    render(
      <>
        <Button asChild><Link href="/en/formulas">Formula details</Link></Button>
        <Button disabled onClick={onClick}>Save</Button>
      </>,
    );
    expect(screen.getByRole('link', { name: 'Formula details' })).toHaveAttribute('href', '/en/formulas');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('retains Radix keyboard selection and disabled-tab exclusion', async () => {
    render(
      <Tabs defaultValue="formula">
        <TabsList aria-label="Parameters">
          <TabsTrigger value="formula">Formula</TabsTrigger>
          <TabsTrigger value="unavailable" disabled>Unavailable</TabsTrigger>
          <TabsTrigger value="animation">Animation</TabsTrigger>
        </TabsList>
        <TabsContent value="formula">Formula controls</TabsContent>
        <TabsContent value="animation">Animation controls</TabsContent>
      </Tabs>,
    );
    const formula = screen.getByRole('tab', { name: 'Formula' });
    act(() => formula.focus());
    fireEvent.keyDown(formula, { key: 'ArrowRight' });
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Animation' })).toHaveFocus());
    expect(screen.getByRole('tab', { name: 'Animation' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Animation controls');
  });

  it('allows named density tokens to yield to retained instance exceptions', () => {
    expect(cn('text-control rounded-control', 'text-sm rounded-full')).toBe('text-sm rounded-full');
    expect(cn('text-control text-muted-foreground')).toBe('text-control text-muted-foreground');
    expect(cn('text-base md:text-control', 'text-sm md:text-sm')).toBe('text-sm md:text-sm');
    expect(cn('h-(--control-height)', 'h-8')).toBe('h-8');
  });
});
