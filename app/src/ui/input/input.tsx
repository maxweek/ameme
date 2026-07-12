import { type FC, type MouseEvent, useEffect, useRef, useState } from 'react'
import './styles.scss'
import { getCl, getClR, removeNonDigitsAndPeriods } from '../../helper'
import InputText from './inputText';
import InputTextArea from './inputTextArea';
import InputSelect from './inputSelect';
import InputDateTime from './inputDateTime';
import InputSelectMulti from './inputSelectMulti';
import InputCheckbox from './inputCheckbox';
import InputNumber from './inputNumber';
import InputColor from './inputColor';
import InputFile from './inputFile';
import InputRange from './inputRange';
import Icon from '../icon/icon';
import Button from '../button/button';

export interface IPropertyItem {
  id: number | string | null,
  title: string,
  icon?: string,
  color?: string
  inited?: boolean
  active?: boolean
  count?: number
}


export interface IInput {
  type: 'text' | 'file' | "remote" | 'select' | 'editor' | 'datetime' | 'number' | 'textarea' | 'multiselect' | 'password' | 'range' | 'checkbox' | "json" | "rawJson" | 'color',
  inputType?: string,
  className?: string,
  value?: any,
  error?: any,
  label?: string,
  placeholder?: string,
  options?: IPropertyItem[],
  format?: string,
  disabled?: boolean,
  datevalue?: string[],
  allowRangeDate?: boolean,
  loading?: boolean,
  hourList?: number[],
  minuteList?: number[],
  rows?: number,
  minRows?: number,
  maxRows?: number,
  min?: number,
  max?: number,
  alpha?: boolean,
  maxCount?: number,
  maxSize?: number,
  step?: number,
  decimalScale?: number,
  disableIconColor?: boolean
  align?: 'center' | 'right',
  onChange?: (value: any, title?: string) => void,
  onFileChange?: (files: File[]) => void,
  onInput?: (value: any) => void,
  onFocus?: () => void,
  onBlur?: (value?: any) => void,
  clear?: () => void,
  onKeyDown?: (e: React.KeyboardEvent) => void,
  onFileInputRefMount?: (ref: React.RefObject<HTMLDivElement>) => void;
  onPaste?: (e: React.ClipboardEvent) => void;
  checkbox?: boolean
  autoFocus?: boolean
  mini?: boolean
  showMaxSize?: boolean
  inline?: boolean
  fill?: boolean
  multiple?: boolean
  dragDropRef?: React.RefObject<HTMLDivElement>
  stopPropagation?: boolean
  defaultValue?: any
  empty?: boolean
  search?: boolean
  raw?: boolean
  small?: boolean
  files?: File[] | null,
  filesTypes?: string[]
  showLength?: boolean
  minDate?: Date | string
  fileName?: string
  filePath?: string
  alt?: boolean
  copy?: boolean
  disableTime?: boolean
  showMaxLength?: boolean | number
  asText?: boolean
  keyframe?: string
}

const Input: FC<IInput> = (props: IInput) => {
  const [focused, setFocused] = useState<boolean>(false)
  const [filled, setFilled] = useState<boolean>(false)
  const [zIndex, setZIndex] = useState<boolean>(false)
  const [copied, setCopied] = useState<boolean>(false)
  const ref = useRef<HTMLDivElement>(null);

  const valueRef = useRef(props.value);

  useEffect(() => {
    valueRef.current = props.value; // Обновляем значение ссылки при изменении props.value
    checkLabel()
  }, [props.value]);

  useEffect(() => {
    focused ? setZIndex(true) : setTimeout(() => setZIndex(false), 200)
  }, [focused])

  const onChange = (value: any, title?: string) => {
    props.onChange?.(value, title)
  }
  const onFocus = () => {
    if (props.disabled) return
    setFocused(true)
    props.onFocus?.()
  }
  const onBlur = (value?: any) => {
    setFocused(false)
    checkLabel()
    props.onBlur?.(value)
  }

  function checkLabel() {
    let law = true;
    const value = valueRef.current; // Используем актуальное значение из рефа
    // console.log("value", value)
    if (value === undefined || value === '' || value === null || value?.length === 0) law = false
    setFilled(law)
  }

  const handleClick = (e: MouseEvent) => {
    if (props.stopPropagation) {
      e.stopPropagation()
    }
  }

  const classes = [
    getCl(!!props.type, props.type),
    getCl(filled, 'filled'),
    getCl(focused, 'focused'),
    getCl(zIndex, 'zIndex'),
    getCl(props.disabled, 'disabled'),
    getCl(props.error, 'error'),
    getCl(!!props.label, 'label'),
    getCl(!!props.alt, 'alt'),
    getCl(props.mini, 'mini'),
    getCl(props.raw, 'raw'),
    getCl(props.fill, 'fill'),
    getCl(props.small, 'small'),
    getCl(props.asText, 'asText'),
    getCl(props.checkbox, 'cbx'),
    getCl(!!props.clear, 'withClear'),
    getCl(props.inputType === 'password', 'withEye'),
    getCl(!!props.align, 'align_' + props.align),
    getClR(props.className),
  ].join(' ');

  let maxLength = undefined;
  if (typeof props.showMaxLength === 'number') {
    maxLength = props.showMaxLength
  }

  const copy = async () => {
    if (copied) return
    try {
      // await navigator.clipboard.writeText(JSON.stringify(props.value));
      await navigator.clipboard.writeText(props.value);
      setCopied(true)
      setTimeout(() => {
        setCopied(false)
      }, 2000)
    } catch (error) {
      console.error('Ошибка копирования: ', error);
    }
  };

  return (
    <div className={`inputWrapper ${getCl(!!props.type, props.type)} ${getCl(props.fill, 'fill')}`}>
      <div className={`input ${classes}`} ref={ref} onClick={handleClick}>
        {(props.showLength || props.copy) &&
          <div className='input__info'>
            {props.showLength &&
              <div className='input__length'>
                {parseInt(props.value?.length || '0').toLocaleString('ru') || 0}
                {maxLength && ` / ${maxLength.toLocaleString('ru')}`}
              </div>
            }
            {props.copy &&
              <Button
                type="simple"
                classList={`input__copy ${getCl(copied, 'copied')}`}
                onClick={copy}
                small={true}
                icon={copied ? "check" : "copy"}
              >
              </Button>
            }
          </div>
        }
        {(props.label && props.type !== 'checkbox' && props.type !== 'number' && props.type !== "range") &&
          <div className='input__label'>
            {props.label}
          </div>
        }
        {/* {props.type === 'editor' &&
        <InputEditor
          onFocus={onFocus}
          onBlur={onBlur}
          onChange={onChange}
          value={props.value}
          disabled={props.disabled}
        />
      } */}
        {props.type === 'text' &&
          <InputText
            inputType={props.inputType}
            autoFocus={props.autoFocus}
            onFocus={onFocus}
            onBlur={onBlur}
            onInput={props.onInput}
            onChange={onChange}
            onKeyDown={props.onKeyDown}
            clear={props.clear}
            value={props.value}
            onPaste={props.onPaste}
            disabled={props.disabled}
            defaultValue={props.defaultValue}
          />
        }
        {props.type === 'number' &&
          <InputNumber
            inputType={props.inputType}
            onFocus={onFocus}
            onBlur={onBlur}
            onChange={onChange}
            onKeyDown={props.onKeyDown}
            value={props.value}
            disabled={props.disabled}
            label={props.label}
            step={props.step}
            min={props.min}
            max={props.max}
            decimalScale={props.decimalScale}
          />
        }
        {props.type === 'color' &&
          <InputColor
            onFocus={onFocus}
            onBlur={onBlur}
            clear={props.clear}
            focused={focused}
            onKeyDown={props.onKeyDown}
            inline={props.inline}
            alpha={props.alpha}
            onChange={onChange}
            value={props.value}
            disabled={props.disabled}
          />
        }
        {props.type === 'textarea' &&
          <InputTextArea
            onFocus={onFocus}
            onBlur={onBlur}
            onChange={onChange}
            value={props.value}
            disabled={props.disabled}
            onKeyDown={props.onKeyDown}
            rows={props.rows}
            minRows={props.minRows}
            maxRows={props.maxRows}
          />
        }
        {props.type === 'select' &&
          <InputSelect
            onChange={onChange}
            options={props.options}
            value={props.value}
            onFocus={onFocus}
            onBlur={onBlur}
            inline={props.inline}
            onInput={props.onInput}
            focused={focused}
            empty={props.empty}
            search={props.search}
            disabled={props.disabled}
            loading={props.loading}
            placeholder={props.placeholder}
            disableIconColor={props.disableIconColor}
            alt={props.alt}
          />
        }
        {props.type === 'multiselect' &&
          <InputSelectMulti
            onChange={onChange}
            options={props.options}
            value={props.value}
            onFocus={onFocus}
            inline={props.inline}
            onBlur={onBlur}
            focused={focused}
            disabled={props.disabled}
            alt={props.alt}
          />
        }
        {props.type === 'checkbox' &&
          <InputCheckbox
            onChange={onChange}
            value={props.value}
            onFocus={onFocus}
            onBlur={onBlur}
            focused={focused}
            disabled={props.disabled}
            label={props.label}
            checkbox={props.checkbox}
            loading={props.loading}
          />
        }
        {props.type === 'datetime' &&
          <InputDateTime
            onChange={onChange}
            onFocus={onFocus}
            onBlur={onBlur}
            value={props.value}
            format={props.format}
            datevalue={props.datevalue}
            allowRangeDate={props.allowRangeDate}
            disabled={props.disabled}
            hourList={props.hourList}
            minuteList={props.minuteList}
            componentRef={ref as React.RefObject<HTMLDivElement>}
            minDate={props.minDate}
            disableTime={props.disableTime}
          />
        }
        {props.type === 'range' &&
          <InputRange
            onChange={onChange}
            onFocus={onFocus}
            onBlur={onBlur}
            value={props.value}
            disabled={props.disabled}
            min={props.min}
            max={props.max}
            step={props.step}
            range={true}
            label={props.label}
            small={props.small}
          />
        }
        {props.type === 'file' &&
          <InputFile
            onFilesChange={props.onFileChange}
            disabled={props.disabled}
            multiple={props.multiple}
            files={props.files}
            clear={props.clear}
            alt={true}
            maxCount={props.maxCount}
            maxSize={props.maxSize}
            showMaxSize={props.showMaxSize}
            dragDropRef={props.dragDropRef}
            filesTypes={props.filesTypes}
            onFileInputRefMount={props.onFileInputRefMount}
          />
        }
        {props.error &&
          <div className='input__error'>
            {props.error}
          </div>
        }
      </div>
    </div>
  )
}


export default Input