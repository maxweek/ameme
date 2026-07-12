import { ChangeEvent, FC, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './styles.scss'
import { NumericFormat } from 'react-number-format';
import { useThrottledCallback } from 'use-debounce';



interface IInputText {
  inputType?: string,
  onFocus?: () => void,
  onBlur?: () => void,
  onChange?: (value: number) => void,
  onKeyDown?: (e: React.KeyboardEvent) => void,
  value?: number,
  textarea?: boolean,
  disabled?: boolean,
  label?: string
  step?: number
  decimalScale?: number
  min?: number
  max?: number
}

// Вычисляет количество знаков после запятой из step
const getDecimalScaleFromStep = (step: number): number => {
  if (step >= 1) return 0;
  
  const stepString = step.toString();
  
  // Научная нотация (например, 1e-5)
  if (stepString.includes('e')) {
    const exponent = parseInt(stepString.split('e-')[1]);
    return exponent;
  }
  
  // Обычная десятичная запись
  const decimalPart = stepString.split('.')[1];
  if (!decimalPart) return 0;
  
  // Считаем значащие цифры после запятой
  // 0.01 -> "01" -> 2
  // 0.1 -> "1" -> 1
  // 0.005 -> "005" -> 3
  return decimalPart.length;
};

const DRAG_THRESHOLD = 3; // Порог в пикселях для определения drag vs click

const InputNumber: FC<IInputText> = (props) => {
  const dragCoefficient = props.step ?? 0.1;
  
  // Вычисляем decimalScale из step или используем переданный
  const decimalScale = useMemo(() => {
    if (props.decimalScale !== undefined) {
      return props.decimalScale;
    }
    if (props.step !== undefined) {
      return getDecimalScaleFromStep(props.step);
    }
    return 2; // default
  }, [props.decimalScale, props.step]);
  
  const [isDragging, setIsDragging] = useState(false);
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [value, setValue] = useState<number | undefined>(props.value);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const startX = useRef(0);
  const startValue = useRef(0);
  const wasDragged = useRef(false);

  // Нормализация и округление числа
  const normalizeValue = useCallback((num: number): number => {
    const clamped = Math.min(
      props.max ?? Infinity, 
      Math.max(props.min ?? -Infinity, num)
    );
    // Используем Math.round вместо toFixed для избежания floating-point ошибок
    const multiplier = Math.pow(10, decimalScale);
    return Math.round(clamped * multiplier) / multiplier;
  }, [props.min, props.max, decimalScale]);

  // Throttled callback для onChange
  const throttledOnChange = useThrottledCallback((value: number) => {
    props.onChange?.(value);
  }, 100, {
    leading: false,
    trailing: true
  });

  // Обработчик изменения значения
  const handleChange = useCallback((inputValue: string | number) => {
    if (props.disabled) return;
    
    // Пустое значение
    if (inputValue === '' || inputValue === undefined || inputValue === null) {
      setValue(undefined);
      throttledOnChange(props.min ?? 0);
      return;
    }

    // Парсим число
    const numValue = typeof inputValue === 'string' 
      ? parseFloat(inputValue.replace(/,/g, '.').replace(/[^\d.-]/g, ''))
      : inputValue;

    if (isNaN(numValue)) {
      setValue(undefined);
      throttledOnChange(props.min ?? 0);
      return;
    }

    const normalized = normalizeValue(numValue);
    setValue(normalized);
    throttledOnChange(normalized);
  }, [props.disabled, props.min, normalizeValue, throttledOnChange]);

  // Синхронизация с props.value
  useEffect(() => {
    if (props.value !== undefined) {
      setValue(props.value);
    }
  }, [props.value]);

  // Обработчик onChange от NumericFormat
  const onInputChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    handleChange(e.target.value);
  }, [handleChange]);

  // Обработчик blur
  const onBlur = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    // Принудительно применяем текущее значение
    if (value !== undefined) {
      const normalized = normalizeValue(value);
      setValue(normalized);
      throttledOnChange(normalized);
    } else {
      const fallback = props.min ?? 0;
      setValue(fallback);
      throttledOnChange(fallback);
    }
    props.onBlur?.();
  }, [value, normalizeValue, throttledOnChange, props.min, props.onBlur]);

  // ============================================================================
  // INPUT SCRUBBING (клик = фокус, drag = изменение значения)
  // ============================================================================

  const handleInputMouseDown = useCallback((e: React.MouseEvent) => {
    if (props.disabled) return;
    
    setIsMouseDown(true);
    wasDragged.current = false;
    startX.current = e.clientX;
    startValue.current = value ?? props.min ?? 0;
  }, [props.disabled, value, props.min]);

  const handleInputMouseMove = useCallback((e: MouseEvent) => {
    if (!isMouseDown) return;

    const deltaX = e.clientX - startX.current;
    
    // Если превысили threshold - это drag
    if (Math.abs(deltaX) > DRAG_THRESHOLD && !wasDragged.current) {
      wasDragged.current = true;
      setIsDragging(true);
      document.body.classList.add('__input_drag');
      inputRef.current?.blur();
    }
    
    if (wasDragged.current) {
      const newValue = startValue.current + deltaX * dragCoefficient;
      handleChange(newValue);
    }
  }, [isMouseDown, dragCoefficient, handleChange]);

  const handleInputMouseUp = useCallback(() => {
    if (isMouseDown && !wasDragged.current) {
      // Это был клик - фокусируем input
      inputRef.current?.focus();
    }
    
    setIsMouseDown(false);
    
    if (wasDragged.current) {
      wasDragged.current = false;
      setIsDragging(false);
      document.body.classList.remove('__input_drag');
    }
  }, [isMouseDown]);

  useEffect(() => {
    if (isMouseDown) {
      document.addEventListener('mousemove', handleInputMouseMove);
      document.addEventListener('mouseup', handleInputMouseUp);
      document.addEventListener('mouseleave', handleInputMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleInputMouseMove);
      document.removeEventListener('mouseup', handleInputMouseUp);
      document.removeEventListener('mouseleave', handleInputMouseUp);
    };
  }, [isMouseDown, handleInputMouseMove, handleInputMouseUp]);

  // ============================================================================
  // LABEL DRAG (перетаскивание за label - сразу начинает drag)
  // ============================================================================

  const handleLabelMouseDown = useCallback((e: React.MouseEvent) => {
    if (props.disabled) return;
    
    setIsDragging(true);
    startX.current = e.clientX;
    startValue.current = value ?? props.min ?? 0;
    
    e.preventDefault();
    document.body.classList.add('__input_drag');
  }, [props.disabled, value, props.min]);

  const handleLabelMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;

    const deltaX = e.clientX - startX.current;
    const newValue = startValue.current + deltaX * dragCoefficient;
    
    handleChange(newValue);
  }, [isDragging, dragCoefficient, handleChange]);

  const handleLabelMouseUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      document.body.classList.remove('__input_drag');
    }
  }, [isDragging]);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleLabelMouseMove);
      document.addEventListener('mouseup', handleLabelMouseUp);
      document.addEventListener('mouseleave', handleLabelMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleLabelMouseMove);
      document.removeEventListener('mouseup', handleLabelMouseUp);
      document.removeEventListener('mouseleave', handleLabelMouseUp);
    };
  }, [isDragging, handleLabelMouseMove, handleLabelMouseUp]);

  return (
    <>
      {props.label && (
        <div className="input__label" onMouseDown={handleLabelMouseDown}>
          {props.label}
        </div>
      )}
      <div className='input__box'>
        <NumericFormat
          getInputRef={inputRef}
          thousandSeparator={' '}
          allowNegative={true}
          allowedDecimalSeparators={['.', ',']}
          decimalSeparator="."
          decimalScale={decimalScale}
          fixedDecimalScale={false}
          allowLeadingZeros={false}
          onFocus={props.onFocus}
          onMouseDown={handleInputMouseDown}
          onBlur={onBlur}
          onChange={onInputChange}
          onKeyDown={props.onKeyDown}
          value={value ?? ''}
          disabled={props.disabled}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
        />
      </div>
    </>
  );
};

export default InputNumber;