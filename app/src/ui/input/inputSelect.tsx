import { type ChangeEvent, type FC, useEffect, useRef, useState, useCallback } from 'react'
import './styles.scss'
import { getCl } from '../../helper'
import Icon from '../icon/icon';
import { ScrollBox } from '../scroller/scroller';
import type { IPropertyItem } from './input';



interface IInputSelect {
  options?: IPropertyItem[],
  onChange: (value: any, title?: string) => void,
  onInput?: (value: any) => void,
  value: any,
  focused: boolean,
  onFocus: () => void
  onBlur: () => void,
  disabled?: boolean
  placeholder?: string
  loading?: boolean
  empty?: boolean
  alt?: boolean
  inline?: boolean
  search?: boolean
  disableIconColor?: boolean
}

const InputSelect: FC<IInputSelect> = (props: IInputSelect) => {
  const [text, setText] = useState<string>('');
  const componentRef = useRef<HTMLDivElement>(null)
  const [initedOptions, setInitedOptions] = useState<boolean>(false)

  const handleClickOutside = useCallback((event: any) => {
    if (componentRef.current && !componentRef.current.contains(event.target)) {
      if (props.focused) {
        props.onBlur();
      }
      setTitle()
    }
  }, [props.focused, props.onBlur, props.value, props.options]);

  useEffect(() => {
    if (props.focused) {
      window.addEventListener('click', handleClickOutside);
    }
    return () => {
      window.removeEventListener('click', handleClickOutside);
    };
  }, [props.focused, handleClickOutside])

  useEffect(() => {
    setTitle();
  }, [props.value])

  useEffect(() => {
    if (props.options?.length && !initedOptions) {
      setInitedOptions(true)
      setTitle()
    }
  }, [props.options, initedOptions])

  const selectOption = (id: number | string | null) => {
    const item = props.options?.filter(el => el.id === id)[0]
    props.onChange(id, item?.title)
    setTitle(id);
  }
  const onTextChange = (e: ChangeEvent<HTMLInputElement>) => {
    setText(e.target.value)
    if (props.onInput) {
      props.onInput(e.target.value)
    }
  }
  const onFocus = () => {
    setText('')
    props.onFocus()
  }
  function setTitle(id?: number | string | null) {
    let _id = id || props.value;
    let opt = props.options?.filter(opt => opt.id == _id)[0]
    if (opt) {
      setText(opt.title)
    } else {
      setText('')
    }
  }
  // const onBlur = () => {
  //     // document.removeEventListener('keydown', keypress)
  //     console.log(props.value)
  //     props.onBlur()
  // }

  // const keypress = (e: KeyboardEvent) => {
  //     console.log(e.code)
  // }

  const getOptions = () => {
    let arr: IPropertyItem[] = []
    if (props.empty) {
      arr.push({
        id: null,
        title: 'Не выбрано'
      })
    }
    if (props.options?.length) {
      props.options?.map((el) => {
        if (text && !el.title.toLowerCase().includes(text.toLowerCase()) && props.focused) {
          return
        }
        arr.push(el)
      })
      if (arr.length) {
        return arr.map((el, i) => {
          return (<div className={`input__optionsItem ${getCl(el.id === props.value, 'active')}`} onClick={() => selectOption(el.id)} key={'inputOption__select_' + i}>

            {el.color &&
              <div className={`input__colorIndicator ${el.color}`} />
            }
            <span className='input__optionsItem_title'>{el.title}</span>
            {el.count !== undefined && <span className='input__optionsItem_count'>{el.count}</span>}
          </div>)
        })
      } else {
        return <div className={`input__optionsItem __noVariants`} >inputs.select.noVariants</div>
      }
    } else {
      return <div className={`input__optionsItem __noVariants`} >inputs.select.noVariants</div>
    }
  }
  // const onChange = (e: ChangeEvent<HTMLSelectElement>) => {
  //     props.onChange(parseInt(e.target.value))
  // }
  return (
    <>
      <div className='input__box' ref={componentRef}>
        {/* <select onChange={onChange} value={props.value} ref={ref}>
                    {props.options && props.options.map(option => <option value={option.id}>{option.title}</option>)}
                </select> */}
        <input
          type="text"
          value={text}
          onChange={onTextChange}
          onFocus={onFocus}
          placeholder={props.placeholder}
          // onBlur={onBlur}
          disabled={props.disabled}
        />
        <div className='input__indicator'>
          <Icon name="chevron-down" />
        </div>
      </div>
      {props.options &&
        <div className={`input__options ${getCl(props.inline, 'inline')}`}>
          <ScrollBox scroller={{ borderPadding: true }}>
            <div className={`input__optionsList ${getCl(props.disableIconColor, 'dIcolor')}`}>
              {props.loading ?
                <div className={`input__optionsItem __loading`} />
                :
                getOptions()
              }
            </div>
          </ScrollBox>
        </div>
      }
    </>
  )
}

export default InputSelect