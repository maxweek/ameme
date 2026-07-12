import { type FC } from 'react'
import './styles.scss'
import Icon from '../icon/icon';
import { getCl } from '../../helper';
import { Loader } from '../loader/loader';



interface IInputCheckbox {
  onChange?: (value: any) => void,
  value: boolean,
  disabled?: boolean
  loading?: boolean
  focused?: boolean,
  label?: string,
  checkbox?: boolean
  onFocus?: () => void,
  onBlur?: () => void,
}

const InputCheckbox: FC<IInputCheckbox> = (props: IInputCheckbox) => {
  const onChange = (type?: boolean) => {
    if (props.disabled) return
    if (type === undefined) {
      props.onChange?.(!props.value)
    } else {
      props.onChange?.(type)
    }
  }

  return (
    <>
      <div className={`input__box ${getCl(props.value, 'active')} ${getCl(props.checkbox, 'cbx')} ${getCl(props.loading, 'loading')}`} onClick={props.checkbox ? () => onChange() : undefined}>
        <input type="checkbox"
          checked={props.value}
          onChange={() => onChange()}
          disabled={props.disabled}
          onFocus={props.onFocus}
          onBlur={props.onBlur}
        />

        {props.loading && <Loader size={1.25} strokeWidth={10} />}

        {props.checkbox && !props.loading && <div className={`input__indicator`}>
          <Icon name="check" />
        </div>}
        {props.label &&
          <div className='input__label'>
            {props.label}
          </div>
        }
        {!props.checkbox &&
          <div className='input__variants'>
            <div className={`input__variant __true ${getCl(!!props.value, 'active')}`} onClick={() => onChange(true)}>
              Да
            </div>
            <div className={`input__variant __false ${getCl(!props.value, 'active')}`} onClick={() => onChange(false)}>
              Нет
            </div>
          </div>
        }
      </div>
    </>
  )
}

export default InputCheckbox