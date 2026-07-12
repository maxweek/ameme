import { type ChangeEvent, type FC, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './styles.scss'
import Button from '../button/button';
import { useDebouncedCallback } from 'use-debounce';


interface IInputRange {
  inputType?: string,
  onFocus?: () => void,
  onBlur?: () => void,
  onChange?: (value: number | null) => void,
  value?: number,
  textarea?: boolean,
  disabled?: boolean
  min?: number
  max?: number,
  step?: number,
  range?: boolean
  label?: string
  small?: boolean
}

// Вычисляет количество знаков после запятой из step
const getDecimalScaleFromStep = (step: number): number => {
  if (step >= 1) return 0;
  
  const stepString = step.toString();
  
  if (stepString.includes('e')) {
    const exponent = parseInt(stepString.split('e-')[1]);
    return exponent;
  }
  
  const decimalPart = stepString.split('.')[1];
  if (!decimalPart) return 0;
  
  return decimalPart.length;
};

// Порог в пикселях для определения drag vs click
const DRAG_THRESHOLD = 3;

const InputRange: FC<IInputRange> = (props) => {
  const step = props.step ?? 1;
  const sliderRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const [value, setValue] = useState<number | undefined>(props.value);
  const [isDraggingSlider, setIsDraggingSlider] = useState(false);
  const [isDraggingLabel, setIsDraggingLabel] = useState(false);
  const [isMouseDownOnInput, setIsMouseDownOnInput] = useState(false);
  
  const startX = useRef(0);
  const startValue = useRef(0);
  const wasSliderDragged = useRef(false);
  const wasInputDragged = useRef(false);

  // Вычисляем decimalScale из step
  const decimalScale = useMemo(() => {
    return getDecimalScaleFromStep(step);
  }, [step]);

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

  // Debounced callback для onChange
  const debouncedOnChange = useDebouncedCallback((value: number) => {
    props.onChange?.(value);
  }, 20);

  // Обработчик изменения значения
  const handleChange = useCallback((inputValue: string | number) => {
    if (props.disabled) return;
    
    // Пустое значение
    if (inputValue === '' || inputValue === undefined || inputValue === null) {
      setValue(undefined);
      props.onChange?.(null);
      return;
    }

    // Парсим число
    const numValue = typeof inputValue === 'string' 
      ? parseFloat(inputValue.replace(/,/g, '.').replace(/[^\d.-]/g, ''))
      : inputValue;

    if (isNaN(numValue)) {
      setValue(undefined);
      props.onChange?.(null);
      return;
    }

    const normalized = normalizeValue(numValue);
    setValue(normalized);
    debouncedOnChange(normalized);
  }, [props.disabled, props.onChange, normalizeValue, debouncedOnChange]);

  // Синхронизация с props.value
  useEffect(() => {
    if (props.value !== undefined) {
      setValue(props.value);
    }
  }, [props.value]);

  // Обработчик onChange от input
  const onInputChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    handleChange(e.target.value);
  }, [handleChange]);

  // Обработчик blur
  const onBlur = useCallback(() => {
    if (value !== undefined) {
      const normalized = normalizeValue(value);
      setValue(normalized);
      debouncedOnChange(normalized);
    } else {
      setValue(props.min ?? 0);
      debouncedOnChange(props.min ?? 0);
    }
    props.onBlur?.();
  }, [value, normalizeValue, debouncedOnChange, props.min, props.onBlur]);

  // ============================================================================
  // INPUT SCRUBBING (клик = фокус, drag = изменение значения)
  // ============================================================================

  const handleInputMouseDown = useCallback((e: React.MouseEvent) => {
    if (props.disabled) return;
    
    setIsMouseDownOnInput(true);
    wasInputDragged.current = false;
    startX.current = e.clientX;
    startValue.current = value ?? props.min ?? 0;
  }, [props.disabled, value, props.min]);

  const handleInputMouseMove = useCallback((e: MouseEvent) => {
    if (!isMouseDownOnInput) return;

    const deltaX = e.clientX - startX.current;
    const pixelsPerStep = 10;
    
    // Если превысили threshold - это drag
    if (Math.abs(deltaX) > DRAG_THRESHOLD && !wasInputDragged.current) {
      wasInputDragged.current = true;
      document.body.classList.add('__input_drag');
      inputRef.current?.blur();
    }
    
    if (wasInputDragged.current) {
      const newValue = startValue.current + Math.round(deltaX / pixelsPerStep) * step;
      handleChange(newValue);
    }
  }, [isMouseDownOnInput, step, handleChange]);

  const handleInputMouseUp = useCallback(() => {
    if (isMouseDownOnInput && !wasInputDragged.current) {
      // Это был клик - фокусируем input
      inputRef.current?.focus();
    }
    
    setIsMouseDownOnInput(false);
    
    if (wasInputDragged.current) {
      wasInputDragged.current = false;
      document.body.classList.remove('__input_drag');
    }
  }, [isMouseDownOnInput]);

  useEffect(() => {
    if (isMouseDownOnInput) {
      document.addEventListener('mousemove', handleInputMouseMove);
      document.addEventListener('mouseup', handleInputMouseUp);
      document.addEventListener('mouseleave', handleInputMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleInputMouseMove);
      document.removeEventListener('mouseup', handleInputMouseUp);
      document.removeEventListener('mouseleave', handleInputMouseUp);
    };
  }, [isMouseDownOnInput, handleInputMouseMove, handleInputMouseUp]);

  // ============================================================================
  // SLIDER DRAG (ползунок)
  // ============================================================================

  const handleSliderMove = useCallback((e: MouseEvent) => {
    if (!isDraggingSlider) return;
    if (props.max === undefined || props.min === undefined) return;
    if (!sliderRef.current) return;

    const rect = sliderRef.current.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const width = rect.width;

    let newValue = ((offsetX / width) * (props.max - props.min) + props.min);
    newValue = Math.round(newValue / step) * step;
    newValue = Math.max(props.min, Math.min(props.max, newValue));

    const normalized = normalizeValue(newValue);
    setValue(normalized);
    debouncedOnChange(normalized);
    wasSliderDragged.current = true;
  }, [isDraggingSlider, props.max, props.min, step, normalizeValue, debouncedOnChange]);

  const handleSliderUp = useCallback(() => {
    setIsDraggingSlider(false);
  }, []);

  useEffect(() => {
    if (isDraggingSlider) {
      window.addEventListener('mousemove', handleSliderMove);
      window.addEventListener('mouseup', handleSliderUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleSliderMove);
      window.removeEventListener('mouseup', handleSliderUp);
    };
  }, [isDraggingSlider, handleSliderMove, handleSliderUp]);

  const handleThumbMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDraggingSlider(true);
    wasSliderDragged.current = false;
  }, []);

  const handleSliderClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (wasSliderDragged.current) {
      wasSliderDragged.current = false;
      return;
    }
    if (!sliderRef.current) return;
    if (props.max === undefined || props.min === undefined) return;

    const rect = sliderRef.current.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const width = rect.width;

    let newValue = ((offsetX / width) * (props.max - props.min) + props.min);
    newValue = Math.round(newValue / step) * step;
    newValue = Math.max(props.min, Math.min(props.max, newValue));

    const normalized = normalizeValue(newValue);
    setValue(normalized);
    debouncedOnChange(normalized);
  }, [props.max, props.min, step, normalizeValue, debouncedOnChange]);

  // ============================================================================
  // LABEL DRAG (перетаскивание за label)
  // ============================================================================

  const handleLabelMouseDown = useCallback((e: React.MouseEvent) => {
    if (props.disabled) return;
    
    setIsDraggingLabel(true);
    startX.current = e.clientX;
    startValue.current = value ?? props.min ?? 0;
    
    e.preventDefault();
    document.body.classList.add('__input_drag');
  }, [props.disabled, value, props.min]);

  const handleLabelMouseMove = useCallback((e: MouseEvent) => {
    if (!isDraggingLabel) return;

    const deltaX = e.clientX - startX.current;
    const pixelsPerStep = 10; // 10 пикселей на 1 step
    const newValue = startValue.current + Math.round(deltaX / pixelsPerStep) * step;
    
    handleChange(newValue);
  }, [isDraggingLabel, step, handleChange]);

  const handleLabelMouseUp = useCallback(() => {
    if (isDraggingLabel) {
      setIsDraggingLabel(false);
      document.body.classList.remove('__input_drag');
    }
  }, [isDraggingLabel]);

  useEffect(() => {
    if (isDraggingLabel) {
      document.addEventListener('mousemove', handleLabelMouseMove);
      document.addEventListener('mouseup', handleLabelMouseUp);
      document.addEventListener('mouseleave', handleLabelMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleLabelMouseMove);
      document.removeEventListener('mouseup', handleLabelMouseUp);
      document.removeEventListener('mouseleave', handleLabelMouseUp);
    };
  }, [isDraggingLabel, handleLabelMouseMove, handleLabelMouseUp]);

  // ============================================================================
  // RENDER
  // ============================================================================

  const currentValue = value ?? 0;
  let percentage = (props.min !== undefined && props.max !== undefined) 
    ? ((currentValue - props.min) / (props.max - props.min)) * 100 
    : 0;
  percentage = Math.max(0, Math.min(100, percentage));

  return (
    <>
      {props.label && (
        <div className="input__label" onMouseDown={handleLabelMouseDown}>
          {props.label}
        </div>
      )}
      <div className='input__box'>
        <input
          ref={inputRef}
          type='text'
          value={value ?? ''}
          onChange={onInputChange}
          onBlur={onBlur}
          onFocus={props.onFocus}
          onMouseDown={handleInputMouseDown}
          disabled={props.disabled}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
        />
        {!props.small && (
          <div className='input__box_numberic_actions'>
            <Button 
              type='secondary' 
              icon='minus' 
              onClick={() => handleChange((currentValue - step).toString())} 
            />
            <Button 
              type='secondary' 
              icon='plus' 
              onClick={() => handleChange((currentValue + step).toString())} 
            />
          </div>
        )}
      </div>
      {!props.small && (
        <div
          className="input__box_range"
          ref={sliderRef}
          onClick={handleSliderClick}
        >
          <div className="input__box_range_track" />
          <div className="input__box_range_progress" style={{ width: `${percentage}%` }} />
          <div 
            className="input__box_range_thumb"
            onMouseDown={handleThumbMouseDown}
            style={{ 
              left: `${percentage}%`, 
              cursor: isDraggingSlider ? 'grabbing' : 'grab' 
            }}
          />
        </div>
      )}
    </>
  );
};

export default InputRange;