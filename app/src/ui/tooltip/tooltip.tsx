import { type FC, type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getCl } from "../../helper";
import "./styles.scss"

interface Props {
  children: React.ReactNode;
  headRef?: React.RefObject<HTMLDivElement | null>;
  align?: 'left' | 'right';
  horizontal?: boolean
  events?: boolean;
  disableOffset?: boolean
}

export const Tooltip: FC<Props> = (props) => {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState<boolean>(false);
  const animationFrameIdRef = useRef<number | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null); // Ссылка на тултип

  const updatePosition = () => {
    if (!props.headRef?.current) return;
    const rect = props.headRef.current.getBoundingClientRect();
    let x = rect.x;
    let y = rect.y + rect.height;

    if (props.horizontal) {
      x = rect.x + rect.width
      y = rect.y
    }

    if (props.align === 'right') {
      x = window.innerWidth - rect.x - rect.width
    }
    if (!props.disableOffset) {
      if (props.horizontal) {
        if (props.align === 'left') {
          x = x + 8
        } else {
          x = x - 8
        }
      } else {
        y = y + 8
      }
    }

    setPos({ x, y });
  };

  useEffect(() => {
    if (!props.headRef?.current) return;

    const headElement = props.headRef.current;

    updatePosition(); // Инициализация позиции при монтировании

    const handleEnter = () => {
      setActive(true);
      updatePosition();
      startTrackingPosition();
      // if (props.events) {
      // }
    };

    const handleLeave = () => {
      // Проверяем, находится ли курсор над тултипом или целевым элементом
      if (tooltipRef.current && !tooltipRef.current.matches(':hover') && !headElement.matches(':hover')) {
        setActive(false);
        stopTrackingPosition();
      }
    };

    const checkIn = () => {
      if (headElement.matches(':hover')) {
        setActive(true);
        updatePosition();
        startTrackingPosition();
        // stopTrackingPosition();
      }
    }

    headElement.addEventListener('pointerleave', handleLeave);
    headElement.addEventListener('pointerenter', handleEnter);
    // window.addEventListener('resize', updatePosition);
    // window.addEventListener('scroll', updatePosition);

    // Добавляем слушатель для тултипа
    const tooltipElement = tooltipRef.current;
    const handleTooltipLeave = handleLeave; // Используем тот же метод для ухода
    const handleTooltipEnter = () => setActive(true);

    // Проверяем наличие тултипа и добавляем обработчики
    if (tooltipElement) {
      tooltipElement.addEventListener('pointerleave', handleTooltipLeave);
      tooltipElement.addEventListener('pointerenter', handleTooltipEnter);
    }
    checkIn()
    return () => {
      headElement.removeEventListener('pointerleave', handleLeave);
      headElement.removeEventListener('pointerenter', handleEnter);
      // window.removeEventListener('resize', updatePosition);
      // window.removeEventListener('scroll', updatePosition);

      if (tooltipElement) {
        tooltipElement.removeEventListener('pointerleave', handleTooltipLeave);
        tooltipElement.removeEventListener('pointerenter', handleTooltipEnter);
      }
    };
  }, [props.headRef, props.events]);

  const startTrackingPosition = () => {
    const track = () => {
      updatePosition();
      animationFrameIdRef.current = requestAnimationFrame(track);
    };
    track(); // Запускаем отслеживание
  };

  const stopTrackingPosition = () => {
    if (animationFrameIdRef.current !== null) {
      cancelAnimationFrame(animationFrameIdRef.current); // Отменяем анимацию
      animationFrameIdRef.current = null; // Обнуляем идентификатор
    }
  };

  const classnames = [
    'tooltip',
    getCl(active, 'active'),
    getCl(!!props.align, props.align),
    getCl(props.events, 'events'),
    getCl(props.disableOffset, 'noOffset'),
  ].join(' ');

  const posX = props.align === 'right' ? { right: pos.x } : { left: pos.x };

  return createPortal(
    <div
      ref={tooltipRef} // Ссылка на тултип для отслеживания
      className={classnames}
      style={{ top: pos.y, ...posX }}
    >
      {props.children}
    </div>,
    document.getElementById('pageTooltips') as HTMLElement
  );
};