import { type FC, useEffect, useRef, useCallback } from 'react'
import './styles.scss'
import { getCl } from '../../helper'
import Icon from '../icon/icon';
import type { IPropertyItem } from './input';

interface IInputSelectMulti {
  options?: IPropertyItem[],
  onChange: (value: any) => void,
  value: (number | string | null)[] | undefined,
  focused: boolean,
  onFocus: () => void
  onBlur: () => void,
  disabled?: boolean
  inline?: boolean
  alt?: boolean
}

const InputSelectMulti: FC<IInputSelectMulti> = (props: IInputSelectMulti) => {
  const componentRef = useRef<HTMLDivElement>(null)

  const handleClickOutside = useCallback((event: any) => {
    if (componentRef.current && !componentRef.current.contains(event.target)) {
      props.onBlur()
    }
  }, [props.onBlur]);

  useEffect(() => {
    window.addEventListener('click', handleClickOutside);
    return () => {
      window.removeEventListener('click', handleClickOutside);
    };
  }, [handleClickOutside])
  const selectOption = (id: number | string | null) => {
    if (props.value) {
      if (props.value?.includes(id)) {
        removeValue(id)
      } else {
        props.onChange([...props.value, id])
      }
    } else {
      props.onChange([id])
    }
  }
  const onFocus = () => {
    props.onFocus()
  }
  // const onBlur = () => {
  //     props.onBlur()
  // }
  // const addValue = (id: number) => {

  // }
  const getValue = (id: number | string | null) => {
    let opt = props.options?.filter(opt => opt.id === id)[0]
    return opt?.title
  }
  const removeValue = (id: number | string | null) => {
    let value = props.value?.filter(val => val !== id)
    // console.log(value, props.value)
    props.onChange(value)
  }
  // console.log(props.value)
  // debugger
  return (
    <div ref={componentRef}>
      <div className='input__box' onClick={onFocus} onFocus={onFocus} tabIndex={0}>
        {/* <select onChange={onChange} value={props.value} ref={ref}>
                    {props.options && props.options.map(option => <option value={option.id}>{option.title}</option>)}
                </select> */}
        <div className='_input'>
          {Array.isArray(props.value) && props.value?.map((val, i) => {
            return (
              <div
                className='input__box_value'
                onClick={() => { removeValue(val) }}
                key={'inputOption__value_' + i}
              >
                {getValue(val)}
                <Icon name="x" />
              </div>
            )
          })}
        </div>
        <div className='input__indicator'>
          <Icon name="chevron-down" />
        </div>
      </div>
      {props.options &&
        <div className={`input__options ${getCl(props.inline, 'inline')}`}>
          <div className='input__optionsList'>
            {props.options.map((el, i) => {
              return (
                <div
                  className={`input__optionsItem ${getCl(props.value?.includes(el.id), 'active')}`}
                  onClick={() => selectOption(el.id)}
                  key={'inputOption__select_' + i}
                >
                  {el.color &&
                    <div className={`input__colorIndicator ${el.color}`} />
                  }
                  {el.title}
                </div>
              )
            })}
          </div>
        </div>
      }
    </div>
  )
}

export default InputSelectMulti