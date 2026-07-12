import { type ChangeEvent, type FC, useEffect, useState, useCallback } from 'react'
import './styles.scss'
import Icon from '../icon/icon';


interface IInputText {
  inputType?: string,
  onFocus: () => void,
  onBlur: (value: any) => void,
  onInput?: (value: any) => void,
  clear?: () => void,
  onChange: (value: any) => void,
  onKeyDown?: (e: React.KeyboardEvent) => void,
  value: string | undefined,
  textarea?: boolean,
  disabled?: boolean
  autoFocus?: boolean
  onPaste?: (e: React.ClipboardEvent) => void
  defaultValue?: any
}

const InputText: FC<IInputText> = (props: IInputText) => {
  const [inputType, setInputType] = useState(props.inputType || 'text')
  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    props.onChange(e.target.value)
  }
  const onBlur = (e: ChangeEvent<HTMLInputElement>) => {
    props.onBlur(e.target.value)
  }

  useEffect(() => {
    if (props.value === null || props.value === undefined) {
      props.onChange('')
    }
  }, [props.value, props.onChange])

  const val = props.defaultValue !== undefined ? undefined : (props.value || '')

  const show = () => {
    if (props.inputType === 'password') {
      if (inputType === 'text') {
        setInputType(props.inputType)
      }
      if (inputType === props.inputType) {
        setInputType("text")
      }
    }
  }

  return (
    <div className='input__box'>
      <input
        type={inputType}
        onFocus={props.onFocus}
        onBlur={onBlur}
        onChange={onChange}
        value={val}
        onInput={props.onInput}
        disabled={props.disabled}
        autoFocus={props.autoFocus}
        onKeyDown={props.onKeyDown}
        spellCheck={false}
        autoComplete={'off'}
        autoCorrect={'off'}
        onPaste={props.onPaste}
        autoCapitalize={'off'}
        maxLength={1000}
        defaultValue={props.defaultValue}
      />
      {props.inputType === "password" &&
        <div className='input__box_eye' onClick={show}>
          <Icon name={inputType === 'text' ? 'eye' : 'eye-off'} />
        </div>
      }
      {props.clear &&
        <div className='input__box_clear' onClick={props.clear}>
          <Icon name='x' />
        </div>
      }
    </div>
  )
}


export default InputText