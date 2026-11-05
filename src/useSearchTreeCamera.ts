import { useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import { CARD_HEIGHT, CARD_WIDTH } from './searchTreeLayout';

type Point = { x: number; y: number };
type Size = { width: number; height: number };
type Mode = 'follow' | 'manual' | 'overview';
type Drag = { pointerId: number; x: number; y: number; left: number; top: number };

const MIN_ZOOM = 0.75;
const MAX_ZOOM = 1.5;
const CAMERA_MARGIN = 18;

export function useSearchTreeCamera(layout: Size, activeCard: Point | undefined) {
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const expectedScroll = useRef({ left: 0, top: 0 });
  const requestedCenter = useRef<Point | null>(null);
  const [centerRequest, setCenterRequest] = useState(0);
  const [size, setSize] = useState<Size>({ width: 320, height: 320 });
  const [mode, setMode] = useState<Mode>('follow');
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState(false);

  const scale = mode === 'overview'
    ? Math.min(1, (size.width - 2) / layout.width, (size.height - 2) / layout.height)
    : zoom;
  const displayedWidth = Math.max(size.width, Math.ceil(layout.width * scale));
  const displayedHeight = Math.max(size.height, Math.ceil(layout.height * scale));
  const offsetX = (displayedWidth - layout.width * scale) / 2;

  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    function measure() {
      if (!element || element.clientWidth < 32 || element.clientHeight < 32) return;
      const width = element.clientWidth;
      const height = element.clientHeight;
      setSize((previous) => previous.width === width && previous.height === height ? previous : { width, height });
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const activeX = activeCard?.x;
  const activeY = activeCard?.y;

  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element || !element.clientWidth || !element.clientHeight) return;
    const { clientWidth, clientHeight } = element;
    const center = requestedCenter.current;
    requestedCenter.current = null;

    if (mode === 'overview') {
      element.scrollTo(0, 0);
    } else if (center) {
      element.scrollTo(center.x * scale + offsetX - clientWidth / 2, center.y * scale - clientHeight / 2);
    } else if (mode === 'follow' && activeX !== undefined && activeY !== undefined) {
      const left = activeX * scale + offsetX;
      const top = activeY * scale;
      const right = left + CARD_WIDTH * scale;
      const bottom = top + CARD_HEIGHT * scale;
      const outsideX = left < element.scrollLeft + CAMERA_MARGIN || right > element.scrollLeft + clientWidth - CAMERA_MARGIN;
      const outsideY = top < element.scrollTop + CAMERA_MARGIN || bottom > element.scrollTop + clientHeight - CAMERA_MARGIN;
      if (outsideX || outsideY) {
        element.scrollTo(
          outsideX ? (left + right - clientWidth) / 2 : element.scrollLeft,
          outsideY ? (top + bottom - clientHeight) / 2 : element.scrollTop,
        );
      }
    }
    expectedScroll.current = { left: element.scrollLeft, top: element.scrollTop };
  }, [activeX, activeY, centerRequest, displayedHeight, displayedWidth, mode, offsetX, scale, size.height, size.width]);

  function requestCenter(point: Point) {
    requestedCenter.current = point;
    setCenterRequest((previous) => previous + 1);
  }

  function changeZoom(direction: -1 | 1) {
    const element = viewport.current;
    if (!element) return;
    if (mode === 'overview') {
      if (direction < 0) return;
      if (activeCard) requestCenter({ x: activeCard.x + CARD_WIDTH / 2, y: activeCard.y + CARD_HEIGHT / 2 });
      setZoom(1);
    } else {
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom + direction * 0.25));
      if (next === zoom) return;
      requestCenter({
        x: (element.scrollLeft + element.clientWidth / 2 - offsetX) / scale,
        y: (element.scrollTop + element.clientHeight / 2) / scale,
      });
      setZoom(next);
    }
    setMode('manual');
  }

  function showOverview() {
    setMode('overview');
  }

  function followCurrent() {
    if (mode === 'follow') {
      setMode('manual');
      return;
    }
    if (mode === 'overview') setZoom(1);
    if (activeCard) requestCenter({ x: activeCard.x + CARD_WIDTH / 2, y: activeCard.y + CARD_HEIGHT / 2 });
    setMode('follow');
  }

  function inspect(card: Point, center = false) {
    if (mode === 'overview') setZoom(1);
    if (mode === 'overview' || center) requestCenter({ x: card.x + CARD_WIDTH / 2, y: card.y + CARD_HEIGHT / 2 });
    setMode('manual');
  }

  function onScroll() {
    const element = viewport.current;
    if (mode !== 'follow' || !element || !element.clientWidth || !element.clientHeight) return;
    if (Math.abs(element.scrollLeft - expectedScroll.current.left) > 1
        || Math.abs(element.scrollTop - expectedScroll.current.top) > 1) {
      setMode('manual');
    }
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (mode === 'overview' || event.pointerType !== 'mouse' || event.button !== 0) return;
    const element = event.currentTarget;
    if ((event.target as Element).closest('button')) return;
    // Leave native scrollbars to the browser.
    const bounds = element.getBoundingClientRect();
    if (event.clientX >= bounds.left + element.clientWidth || event.clientY >= bounds.top + element.clientHeight) return;
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: element.scrollLeft, top: element.scrollTop };
    element.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const previous = drag.current;
    if (!previous || event.pointerId !== previous.pointerId) return;
    const x = event.clientX - previous.x;
    const y = event.clientY - previous.y;
    if (!dragging && Math.hypot(x, y) < 5) return;
    setDragging(true);
    setMode('manual');
    event.currentTarget.scrollTo(previous.left - x, previous.top - y);
  }

  function endDrag() {
    drag.current = null;
    setDragging(false);
  }

  return {
    viewport, scale, displayedWidth, displayedHeight, offsetX, mode, dragging,
    canZoomIn: mode === 'overview' || zoom < MAX_ZOOM,
    canZoomOut: mode !== 'overview' && zoom > MIN_ZOOM,
    changeZoom, showOverview, followCurrent, inspect, onScroll, onPointerDown, onPointerMove, endDrag,
  };
}
