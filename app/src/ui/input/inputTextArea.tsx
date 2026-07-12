import { type ChangeEvent, type FC, useEffect, useRef } from 'react'
import './styles.scss'


interface IInputTextArea {
  inputType?: string,
  onFocus: () => void,
  onBlur: () => void,
  onChange: (value: any) => void,
  onKeyDown?: (e: React.KeyboardEvent) => void,
  value: any,
  rows?: number,
  disabled?: boolean,
  minRows?: number,
  maxRows?: number,
}

const InputTextArea: FC<IInputTextArea> = (props: IInputTextArea) => {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (ref.current) {
      resizeTextarea(ref.current, props.minRows, props.maxRows)
    }
  }, [props.value, props.minRows, props.maxRows])

  const onChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    props.onChange(e.target.value)
    if (ref.current) {
      resizeTextarea(ref.current, props.minRows, props.maxRows)
    }
  }

  return (
    <div className='input__box'>
      <textarea
        onFocus={props.onFocus}
        onBlur={props.onBlur}
        onChange={onChange}
        value={props.value}
        onKeyDown={props.onKeyDown}
        disabled={props.disabled}
        rows={props.rows}
        ref={ref}
      >
      </textarea>
    </div>
  )
}



export function resizeTextarea(t: HTMLTextAreaElement, minRows: number | undefined = 2, maxRows: number | undefined = 10) {
  if (t.scrollTop == 0) t.scrollTop = 1;
  while (t.scrollTop == 0) {
    if (t.rows > minRows)
      t.rows--; else
      break;
    t.scrollTop = 1;
    if (t.rows < maxRows)
      t.style.overflowY = "hidden";
    if (t.scrollTop > 0) {
      t.rows++;
      break;
    }
  }
  while (t.scrollTop > 0) {
    if (t.rows < maxRows) {
      t.rows++;
      if (t.scrollTop == 0) t.scrollTop = 1;
    } else {
      t.style.overflowY = "auto";
      break;
    }
  }
}

export default InputTextArea