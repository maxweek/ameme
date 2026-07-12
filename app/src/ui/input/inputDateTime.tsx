import { type FC, useEffect, useRef, useState, useCallback } from 'react'
import './styles.scss'
import 'react-calendar/dist/Calendar.css';
import Calendar from 'react-calendar'
import Input from './input';
import IMask from 'imask';
import { Actions } from '../actions/actions';
import Button from '../button/button';

interface IInputDateTime {
  onFocus: () => void,
  onBlur: (value: any) => void,
  onChange: (value: any) => void,
  value: any,
  format?: string,
  datevalue?: string[],
  allowRangeDate?: boolean,
  hourList?: number[],
  minuteList?: number[],
  disabled?: boolean,
  componentRef: React.RefObject<HTMLDivElement> | null
  minDate?: Date | string
  disableTime?: boolean
}


const InputDateTime: FC<IInputDateTime> = (props: IInputDateTime) => {
  const calendarRef = useRef(null);
  const [text, setText] = useState<string>('');
  const [hours, setHours] = useState<number>(0);
  const [minutes, setMinutes] = useState<number>(0);
  const [seconds, setSeconds] = useState<number>(0);
  const [initialized, setInitialized] = useState(false); // Флаг инициализации

  useEffect(() => {
    if (props.value) {
      const date = new Date(props.value); // Копируем дату

      setText(formatDateTime(date));
      setHours(date.getHours());
      setMinutes(date.getMinutes());
      setSeconds(date.getSeconds());
    } else {
      setText('');
      setHours(0);
      setMinutes(0);
      setSeconds(0);
    }
    setInitialized(true);
  }, [props.value]);

  const transformDate = useCallback((value: string): Date | null => {
    const [datePart, timePart] = value.split(' ');
    if (!datePart || !timePart) return null;

    const [day, month, year] = datePart.split('.').map(Number);
    const [hour, minute, second] = timePart.split(':').map(Number);

    if (
      isNaN(day) ||
      isNaN(month) ||
      isNaN(year) ||
      isNaN(hour) ||
      isNaN(minute) ||
      isNaN(second)
    ) {
      return null;
    }

    return new Date(year, month - 1, day, hour, minute, second);
  }, []);

  const handleClickOutside = useCallback((event: any) => {
    if (props.componentRef?.current && !props.componentRef.current.contains(event.target)) {
      if (!event.target.classList.contains('input__calendar')) {
        props.onBlur(transformDate(text));
      }
    }
  }, [props.componentRef, props.onBlur, text, transformDate]);

  useEffect(() => {
    window.addEventListener('click', handleClickOutside);
    return () => {
      window.removeEventListener('click', handleClickOutside);
    };
  }, [handleClickOutside]);

  const formatDateTime = (date: Date) => {
    const formattedDate = `${date
      .getDate()
      .toString()
      .padStart(2, '0')}.${(date.getMonth() + 1)
        .toString()
        .padStart(2, '0')}.${date.getFullYear()}`;
    const formattedTime = `${date
      .getHours()
      .toString()
      .padStart(2, '0')}:${date
        .getMinutes()
        .toString()
        .padStart(2, '0')}:${date
          .getSeconds()
          .toString()
          .padStart(2, '0')}`;
    return `${formattedDate} ${formattedTime}`;
  };

  const onBlurHandler = () => {
    const newDate = transformDate(text);

    props.onChange(newDate);
  };

  const onTimeChange = () => {
    if (!initialized || !props.value) return; // Не вызываем при первой загрузке

    const updatedDate = new Date(props.value); // Копируем дату
    // console.log('date', updatedDate, hours, minutes, seconds)
    updatedDate.setHours(hours, minutes, seconds, 0); // Устанавливаем локальное время
    props.onChange(updatedDate);

  };

  const onCalendarChange = (date: Date) => {
    if (date) {
      const updatedDate = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        hours,
        minutes,
        seconds
      );
      setText(formatDateTime(updatedDate));
      props.onChange(updatedDate);
    }
  };

  useEffect(() => {
    onTimeChange();
  }, [hours, minutes, seconds]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // console.log(e.target.value)
    setText(e.target.value); // Обновляем состояние вручную, если нужно
  };

  const inputRef = useRef<HTMLInputElement>(null); // Ссылка на реальный DOM-элемент input

  useEffect(() => {
    if (!inputRef.current) return; // Убедимся, что input существует

    // Настройка маски
    const mask = IMask(inputRef.current, {
      mask: "d.M.Y h:m:s",
      blocks: {
        d: {
          mask: IMask.MaskedRange,
          from: 1,
          to: 31, // День от 1 до 31
        },
        M: {
          mask: IMask.MaskedRange,
          from: 1,
          to: 12, // Месяц от 1 до 12
        },
        Y: {
          mask: IMask.MaskedRange,
          from: 1000,
          to: 3000, // Год от 1000 до 3000
        },
        h: {
          mask: IMask.MaskedRange,
          from: 0,
          to: 23, // Часы от 0 до 23
        },
        m: {
          mask: IMask.MaskedRange,
          from: 0,
          to: 59, // Минуты от 0 до 59
        },
        s: {
          mask: IMask.MaskedRange,
          from: 0,
          to: 59, // Секунды от 0 до 59
        },
      },
      placeholderChar: "_", // Символ плейсхолдера
      lazy: false, // Показываем всю маску сразу
    });

    mask.on("accept", () => {
      setText(mask.value); // Обновляем стейт
    });

    return () => mask.destroy(); // Удаляем маску при размонтировании компонента
  }, []); // Выполняем один раз при монтировании

  const handleFocus = () => {
    if (inputRef.current) {
      // const length = inputRef.current.value.length;
      // Ставим курсор в конец
      // inputRef.current.setSelectionRange(length, length);
      props.onFocus?.()
    }
  }

  const getTimeZone = (offset: number) => {
    return `GMT +` + offset * -1 / 60
  }

  const handleToday = () => {
    const now = new Date();
    const updatedDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(), // Устанавливаем текущую дату
      hours, // Сохраняем текущее время из состояния
      minutes,
      seconds
    );

    setText(formatDateTime(updatedDate)); // Обновляем текстовое представление
    props.onChange(updatedDate); // Вызываем onChange с новой датой
  };

  const handleNow = () => {
    // if (!props.value) return; // Если нет установленной даты, ничего не делаем

    const currentDate = props.value ? new Date(props.value) : new Date(); // Берем текущую установленную дату
    const now = new Date();

    const updatedDate = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      currentDate.getDate(), // Сохраняем текущую дату
      now.getHours(), // Устанавливаем текущее время
      now.getMinutes(),
      now.getSeconds()
    );

    setHours(now.getHours());
    setMinutes(now.getMinutes());
    setSeconds(now.getSeconds());
    setText(formatDateTime(updatedDate)); // Обновляем текстовое представление
    props.onChange(updatedDate); // Вызываем onChange с обновленным временем
  };

  return (
    <>
      <div className="input__box">
        <input
          ref={inputRef} // Передаем ссылку на реальный DOM-элемент
          value={text} // Реактивное значение
          // value={text}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={onBlurHandler}
          disabled={props.disabled}
        />
      </div>
      <div className="input__calendar">
        <div className="input__calendarDrop">
          <div className="input__calendarList">
            <Calendar
              value={props.value ? new Date(props.value) : null}
              onChange={(date: any) => onCalendarChange(date)}
              inputRef={calendarRef}
              minDate={props.minDate ? new Date(props.minDate) : undefined}
            />
            {!props.disableTime && <>
              <div className="input__timeBox">
                <div className="input__timeBox_slider">
                  <Input
                    label='Часы'
                    type='range'
                    min={0}
                    max={23}
                    value={hours}
                    onChange={setHours}
                  />
                </div>
                <div className="input__timeBox_slider">
                  <Input
                    label='Минуты'
                    type='range'
                    min={0}
                    max={59}
                    value={minutes}
                    onChange={setMinutes}
                  />
                </div>
                <div className="input__timeBox_slider">
                  <Input
                    label='Секунды'
                    type='range'
                    min={0}
                    max={59}
                    value={seconds}
                    onChange={setSeconds}
                  />
                </div>
              </div>
              <div className="input__timeZone">
                <div className="input__timeZone_item">
                  Ваш часовой пояс: <span>{getTimeZone(new Date().getTimezoneOffset())}</span>
                </div>
              </div>
              <Actions grow={true}>
                <Button type='secondary' onClick={handleToday}>Сегодня</Button>
                <Button type='secondary' onClick={handleNow}>Сейчас</Button>
              </Actions>
            </>
            }
          </div>
        </div>
      </div>
    </>
  );
};

export default InputDateTime