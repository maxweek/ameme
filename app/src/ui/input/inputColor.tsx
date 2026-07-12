import { FC, useEffect, useRef, useState, useCallback } from 'react'
import { HexAlphaColorPicker, HexColorInput, HexColorPicker } from "react-colorful";
import './styles.scss'
import Icon from '../icon/icon';
import { getCl } from '../../helper';

interface IInputColor {
  onFocus: () => void,
  onBlur: () => void,
  clear?: () => void,
  onChange: (value: any) => void,
  onKeyDown?: (e: React.KeyboardEvent) => void,
  value: unknown | undefined,
  textarea?: boolean,
  disabled?: boolean
  alpha?: boolean
  inline?: boolean
  focused?: boolean
}

const InputColor: FC<IInputColor> = (props: IInputColor) => {
  const componentRef = useRef<HTMLDivElement>(null)
  const componentOptionRef = useRef<HTMLDivElement>(null)
  let v: string | undefined = '';
  if (props.value) {
    if (typeof props.value === 'string') {
      v = props.value
    }
    if (typeof props.value === 'number') {
      v = props.value.toString()
    }
  } else {
    v = undefined
  }
  const [color, setColor] = useState<string | undefined>(v)
  const onChangeRef = useRef(props.onChange);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  
  // Обновляем ref при изменении props.onChange
  useEffect(() => {
    onChangeRef.current = props.onChange;
  }, [props.onChange]);

  const _colorWithoutPrefix = v?.replace?.('#', '')
  const _color = _colorWithoutPrefix || ''

  const handleClickOutside = useCallback((event: any) => {
    if (
      componentRef.current &&
      !componentRef.current.contains(event.target) &&
      componentOptionRef.current &&
      !componentOptionRef.current.contains(event.target)
    ) {
      if (props.focused) {
        props.onBlur();
      }
    }
  }, [props.focused, props.onBlur]);

  useEffect(() => {
    window.addEventListener('click', handleClickOutside);
    return () => {
      window.removeEventListener('click', handleClickOutside);
    };
  }, [handleClickOutside])

  useEffect(() => {
    let v: string | undefined = '';
    if (props.value) {
      if (typeof props.value === 'string') {
        v = props.value
      }
      if (typeof props.value === 'number') {
        v = props.value.toString()
      }
    } else {
      v = undefined
    }
    setColor(v)
  }, [props.value])

  useEffect(() => {
    if (props.value === color) return;
    
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    
    debounceRef.current = setTimeout(() => {
      onChangeRef.current(color);
    }, 100);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [color, props.value]);

  // useDebouncyEffect(() => props.onChange(color), 100, [color]);
  // console.log(props.value)

  return (
    <>
      <div className='input__box' ref={componentRef}>
        <HexColorInput disabled={props.disabled} color={_color} onFocus={props.onFocus} onChange={setColor} prefixed={!!_color} alpha />
        {/* <div className='input__' style={{ background: color }}></div> */}
        <div className='input__color' style={{ background: v }}></div>
        {/* {props.value} */}
        {(props.clear && !props.disabled) &&
          <div className='input__box_clear' onClick={props.clear}>
            <Icon name='x' />
          </div>
        }
        <div className='input__indicator'>
          <Icon name="chevron-down" />
        </div>
      </div>
      <div className={`input__options ${getCl(props.inline, 'inline')}`} ref={componentOptionRef}>
        {props.alpha ?
          <HexAlphaColorPicker
            color={color}
            onChange={setColor}
            onKeyDown={props.onKeyDown}
          />
          :
          <HexColorPicker
            color={color}
            onChange={setColor}
            onKeyDown={props.onKeyDown}
          />
        }
      </div>
    </>
  )
}


export default InputColor