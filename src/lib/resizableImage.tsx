import Image from '@tiptap/extension-image';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { useRef, useCallback } from 'react';

// Width is stored in the `title` attribute as a bare numeric string (e.g. "480").
// This round-trips cleanly through tiptap-markdown's default serializer, which
// already outputs ![alt](src "title").  Any non-numeric title is left untouched.

function isWidthTitle(title: string | null): boolean {
  return !!title && /^\d+$/.test(title);
}

function ResizableImageView({ node, updateAttributes, selected }: NodeViewProps) {
  const { src, alt, title } = node.attrs as { src: string; alt?: string; title?: string };
  const displayWidth = isWidthTitle(title ?? null) ? parseInt(title!, 10) : null;

  const imgRef = useRef<HTMLImageElement>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    startXRef.current = e.clientX;
    startWidthRef.current =
      imgRef.current?.getBoundingClientRect().width ?? (displayWidth ?? 300);

    const onMove = (ev: MouseEvent) => {
      const w = Math.max(80, Math.round(startWidthRef.current + ev.clientX - startXRef.current));
      updateAttributes({ title: String(w) });
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [displayWidth, updateAttributes]);

  return (
    <NodeViewWrapper className="resizable-image-outer" draggable data-drag-handle>
      <div
        className={`resizable-image-container${selected ? ' selected' : ''}`}
        style={displayWidth ? { width: `${displayWidth}px` } : undefined}
      >
        <img ref={imgRef} src={src} alt={alt || ''} draggable={false} />
        <div className="resize-handle-br" onMouseDown={onMouseDown} title="Drag to resize" />
      </div>
    </NodeViewWrapper>
  );
}

export const ResizableImage = Image.extend({
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView);
  },
});
