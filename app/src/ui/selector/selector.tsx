import { type FC, useEffect, useRef, useState } from 'react'
import Icon, { type IIconName } from '../icon/icon';
import s from './styles.module.scss'
import { getCl } from '../../helper';

export interface ISelectorOption {
  icon?: IIconName,
  title: string,
  disabled?: boolean
  value: any;
}

interface Props {
  options: ISelectorOption[]
  value: any,
  onChange: (el: ISelectorOption) => void
}

export const Selector: FC<Props> = (props: Props) => {

  const boxRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ x: number, y: number, w: number, h: number }>({ x: 0, y: 0, w: 0, h: 0 })

  const handleSelect = (el: ISelectorOption) => {
    if (el.disabled) return;
    props.onChange?.(el)
  }

  useEffect(() => {
    //implement resize observer
    if (!boxRef.current) return;
    const ro = new ResizeObserver(() => {
      check();
    });
    ro.observe(boxRef.current);
    return () => {
      ro.disconnect();
    }
  }, [])

  useEffect(() => {
    if (!boxRef.current) return;
    check();
  }, [props.value, boxRef.current])

  const check = () => {
    setTimeout(() => {
      if (!boxRef.current) return;
      const selectedElement = boxRef.current.querySelector(`.${s.selector__item}.__active`) as HTMLDivElement;
      if (!selectedElement) return;
      const y = selectedElement.offsetTop;
      const x = selectedElement.offsetLeft;
      const h = selectedElement.clientHeight;
      const w = selectedElement.clientWidth;

      setPos({ x, y, w, h })
    }, 1)
  }

  return (
    <div className={s.selector}>
      <div className={s.selector__box} ref={boxRef}>
        {props.options.map((el, i) => (
          <div className={`${s.selector__item} ${getCl(el.value === props.value, 'active')} ${getCl(el.disabled, 'disabled')}`} key={i} onClick={() => handleSelect(el)}>
            {el.icon && <Icon name={el.icon} />}
            {el.title}
          </div>
        ))}
        <div className={s.selector__active} style={{
          left: pos.x,
          top: pos.y,
          width: pos.w,
          height: pos.h
        }} />
      </div>
    </div>
  );
}
