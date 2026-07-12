// import _ from "lodash";

export function getCl(condition?: boolean, conditionTrue?: string, conditionFalse: string = ''): string {
  return condition ? `__${conditionTrue}` : (conditionFalse ? `__${conditionFalse}` : '');
}

export function getClR(className: any): string {
  return className ? className : ''
}

export function getRawHtml(element: any) {
  return { __html: element }
}

export function getRandomInRange(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export const _WIDTH_MOBILE = 495;
export const _WIDTH_TABLET = 820;

export async function fetchSvgMarkup(src: string, setter: (markup: any) => void, loader: (status: boolean) => void = () => { }): Promise<void> {
  try {
    const response = await fetch(src);
    const svgMarkup = await response.text();
    if (svgMarkup.includes('<svg')) {
      setter(svgMarkup)
      loader(true)
    } else {
      setter(null)
      loader(false)
    }
    // console.log('icon success', src)
  } catch (error) {
    console.error('Failed to fetch SVG markup:', error);
    setter(null)
    loader(false)
  }
}

export function loadImage(url: string) {
  return new Promise((resolve: (url: string) => void, reject) => {
    const image = new Image();

    image.onload = () => {
      resolve(url);
    };

    image.onerror = () => {
      reject(new Error(`Failed to load image from ${url}`));
    };

    image.src = url;
  });
}

export function setCookie(name: string, value: any, options: any = {}) {
  options = {
    path: '/',
    ...options
  };

  if (options.expires instanceof Date) {
    options.expires = options.expires.toUTCString();
  }

  let updatedCookie = encodeURIComponent(name) + "=" + encodeURIComponent(value);

  for (let optionKey in options) {
    updatedCookie += "; " + optionKey;
    let optionValue = options[optionKey];
    if (optionValue !== true) {
      updatedCookie += "=" + optionValue;
    }
  }

  document.cookie = updatedCookie;
}
export function getCookie(name: string) {
  let matches = document?.cookie.match(new RegExp(
    "(?:^|; )" + name.replace(/([\.$?*|{}\(\)\[\]\\\/\+^])/g, '\\$1') + "=([^;]*)"
  ));
  return matches ? decodeURIComponent(matches[1]) : undefined;
}
export function getParsedCookieObject(name: string): { [key: string]: any } {
  let obj = {}
  if (!name) return obj
  try {
    const cookie = getCookie(name)
    if (cookie) {
      obj = JSON.parse(cookie)
    }
  } catch {
    obj = {}
  }
  return obj;
}
export function deleteCookie(name: string) {
  setCookie(name, "", {
    'max-age': -1
  })
}

export const _MONTH = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
]

export function getFormattedDate(dateOrTimestamp: Date | number, expectedFormat?: string, locale = 'ru-RU'): string {
  if (!dateOrTimestamp) {
    return ''
  }
  let date: Date;
  let format: string = 'dd.MM.yyyy';

  if (dateOrTimestamp instanceof Date) {
    date = dateOrTimestamp;
  } else {
    date = new Date(dateOrTimestamp);
  }

  if (expectedFormat) {
    format = expectedFormat
  }

  const formattedDate = format.replace(/(yyyy|MM|MW|dd|hh|mm|ss)/g, (match) => {
    switch (match) {
      case 'yyyy':
        return date.toLocaleDateString(locale, { year: 'numeric' });
      case 'MM':
        return date.toLocaleDateString(locale, { month: '2-digit' });
      case 'MW':
        return date.toLocaleDateString(locale, { month: 'long', day: 'numeric' }).split(' ')[1];
      case 'dd':
        return date.toLocaleDateString(locale, { day: '2-digit' });
      case 'hh':
        return date.toLocaleTimeString(locale, { hour: '2-digit' });
      case 'mm':
        const minutes = date.getMinutes();
        return minutes < 10 ? `0${minutes}` : minutes.toString();
      case 'ss':
        const seconds = date.getSeconds();
        return seconds < 10 ? `0${seconds}` : seconds.toString();
      default:
        return match;
    }
  });

  return formattedDate
}

export function getDateFromFormattedDate(date: string, expectedFormat?: string): Date | number | null {
  if (!date) {
    return null;
  }

  const matchResult = date.match(/\d+/g);
  let format: string = 'dd.MM.yyyy';
  if (!matchResult) {
    return null;
  }

  if (expectedFormat) {
    format = expectedFormat
  }

  const parsedValues = matchResult.map(Number);
  const now = new Date();
  const parts: any = {};

  format.split(/[.-/: ]/).forEach((segment, index) => {
    switch (segment) {
      case 'yyyy':
        parts.year = parsedValues[index];
        break;
      case 'MM':
        parts.month = parsedValues[index] - 1;
        break;
      case 'dd':
        parts.day = parsedValues[index];
        break;
      case 'hh':
        parts.hour = parsedValues[index];
        break;
      case 'mm':
        parts.minute = parsedValues[index];
        break;
      case 'ss':
        parts.second = parsedValues[index];
        break;
    }
  });

  const parsedDate = new Date(
    parts.year || now.getFullYear(),
    parts.month ?? now.getMonth(),
    parts.day ?? 1,
    parts.hour ?? 0,
    parts.minute ?? 0,
    parts.second ?? 0
  );

  if (isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate;
}
export function getTimestampFromDate(date: Date): number {

  return date.getTime();
}

export function getTimestampWithoutTimeZone(date: Date): number {
  return Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
    date.getMilliseconds()
  );
}


export function fixWindow(type: boolean) {
  if (type) {
    setTimeout(function () {
      /* Ставим необходимую задержку, чтобы не было «конфликта» в случае, если функция фиксации вызывается сразу после расфиксации (расфиксация отменяет действия расфиксации из-за одновременного действия) */
      if (!document.body.hasAttribute('data-body-scroll-fix')) {
        // Получаем позицию прокрутки
        let scrollPosition = window.pageYOffset || document.documentElement.scrollTop;
        // Ставим нужные стили
        document.body.setAttribute('data-body-scroll-fix', scrollPosition.toString()); // Cтавим атрибут со значением прокрутки
        document.body.style.overflow = 'hidden';
        document.body.style.position = 'fixed';
        document.body.style.top = '-' + scrollPosition + 'px';
        document.body.style.left = '0';
        document.body.style.width = '100%';
      }
    }, 15);
  } else {
    if (document.body.hasAttribute('data-body-scroll-fix')) {
      // Получаем позицию прокрутки из атрибута
      let scrollPosition = document.body.getAttribute('data-body-scroll-fix');
      // Удаляем атрибут
      document.body.removeAttribute('data-body-scroll-fix');
      // Удаляем ненужные стили
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.width = '';
      // Прокручиваем страницу на полученное из атрибута значение
      if (scrollPosition !== null) {
        window.scroll(0, parseInt(scrollPosition));
      }
    }
  }
}

export function isImageFile(file: File): boolean {
  const imageExtensions: string[] = ['.jpg', '.jpeg', '.png', '.tiff', '.bmp', '.svg'];
  const fileName: string = file.name.toLowerCase();

  for (const extension of imageExtensions) {
    if (fileName.endsWith(extension)) {
      return true;
    }
  }

  return false;
}

export const getSize = (gsize: number, locale: 'ru' | 'en' = 'ru') => {
  const units = locale === 'ru' ? ['Б', 'Кб', 'Мб', 'Гб'] : ['B', 'KB', 'MB', 'GB'];
  let bytes = gsize;
  let unitIndex = 0;

  while (bytes >= 1024 && unitIndex < units.length - 1) {
    bytes /= 1024;
    unitIndex++;
  }

  return bytes.toFixed(2).replace(/\.?0+$/, '').toLocaleString() + ' ' + units[unitIndex];
}


export const getEditItemForDB = (_item: any) => {
  let item = { ..._item }
  // debugger
  Object.keys(item).map(key => {
    if (item[key] === "") item[key] = null
    if (item[key] === "null") item[key] = null
    // if (item[key] === null) item[key] = undefined
  })
  return item
}

export const _changeSort = (name: string, sortType: "DESC" | "ASC", sortField: string, setSortType: (val: "DESC" | "ASC") => void, setSortField: (val: string) => void) => {
  if (name === 'id') {
    if (sortType === 'DESC') {
      setSortType("ASC")
    } else {
      setSortType('DESC')
    }
    return
  }
  if (sortType === 'DESC') {
    setSortField('id')
    setSortType('ASC')
  }
  if (sortField === name) {
    setSortType('DESC')
  } else {
    setSortField(name)
    setSortType('ASC')
  }
}


export const transformJSON = (jsonString: string) => {
  // console.log(jsonString)
  try {
    let parsed = '';
    if (typeof jsonString === 'object') {
      parsed = jsonString;
    }
    if (typeof jsonString === 'string') {
      parsed = JSON.parse(jsonString);
    }
    if (jsonString === 'null') {
      parsed = jsonString;
    }
    const transform = (obj: any): any => {
      if (Array.isArray(obj)) {
        // Если это массив, рекурсивно применяем transform к каждому элементу
        return obj.map(transform);
      } else if (obj !== null && typeof obj === 'object') {
        // Проверяем, есть ли в объекте 'type' и 'value'
        if ('type' in obj && 'value' in obj) {
          switch (obj.type) {
            case 'text':
            case 'number':
            case 'boolean':
            case 'html':
            case 'date':
            case 'uuid':
            case 'pages':
            case 'elements':
            case 'statics':
            case 'file':
            case 'files':
            case 'color':
              // Если тип соответствует одному из примитивов, возвращаем значение примитива
              return obj.value;
            case 'element':
            case 'static':
            case 'page':
              return obj.value?.[0]
            case 'json':
            case 'rawJson':
              return transformJSON(obj.value)
            default:
              // Если тип другой, продолжаем рекурсивно преобразовывать объект
              break;
          }
        }

        const newObj: any = {};
        for (const key in obj) {
          // Игнорируем поле 'type'
          if (key !== 'type') {
            newObj[key] = transform(obj[key]);
          }
        }
        return newObj;
      } else {
        // Если это примитив, просто возвращаем его
        return obj;
      }
    };

    return transform(parsed);
  } catch (error) {
    // console.error(error);
    if (typeof jsonString === 'string') {
      return jsonString
    }
    return null;
  }
};

export const transliterate = (input: string): string => {
  const transliterationMap: { [key: string]: string } = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
    'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
    'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
    'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch',
    'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
    'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Е': 'E', 'Ё': 'Yo',
    'Ж': 'Zh', 'З': 'Z', 'И': 'I', 'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M',
    'Н': 'N', 'О': 'O', 'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T', 'У': 'U',
    'Ф': 'F', 'Х': 'Kh', 'Ц': 'Ts', 'Ч': 'Ch', 'Ш': 'Sh', 'Щ': 'Shch',
    'Ъ': '', 'Ы': 'Y', 'Ь': '', 'Э': 'E', 'Ю': 'Yu', 'Я': 'Ya'
  };

  return input.split('').map(char => transliterationMap[char] === undefined ? char : transliterationMap[char]).join('');
}

export const pluralize = (word: string): string => {
  if (word.length === 0) {
    return word;
  }

  const lastChar = word[word.length - 1];
  const secondLastChar = word[word.length - 2];

  if (lastChar === 'y' && 'aeiou'.indexOf(secondLastChar) === -1) {
    return word.slice(0, -1) + 'ies';
  } else if (lastChar === 's' || lastChar === 'x' || lastChar === 'z' || (lastChar === 'h' && secondLastChar === 'c') || (lastChar === 'h' && secondLastChar === 's')) {
    return word + 'es';
  } else {
    return word + 's';
  }
}


interface ISanitizeStringFunction {
  onlyEng?: boolean,
  spaces?: boolean,
  trim?: boolean,
}



export const getDefaultDate = (date?: string) => {
  if (!date) return
  const d = new Date(date);
  return `${d.toLocaleString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })} ${d.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
  })}`
}

export function removeNonDigitsAndPeriods(str: string): number {
  const numStr = str.replace(/[^\d.-]/g, '').replace(/(?!^)-/g, ''); // Убирает все символы, кроме цифр, точек и одного начального минуса
  return Number(numStr);
}


export const generateRandomPassword = (length: number = 12): string => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!$&_-'; // Набор символов
  let password = '';

  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    password += characters[randomIndex];
  }

  return password;
}

export const getWordsEnding = (number: number | string, items: [string, string, string]) => {
  const cases = [2, 0, 1, 1, 1, 2];
  const num = Math.abs(parseInt(number.toString()));
  if (num === 0) return items[1];
  const key = (num % 100 > 4 && num % 100 < 20) ? 2 : cases[Math.min(num % 10, 5)];
  return items[key];
}


export const getUrlFields = (object: { [key: string]: any }) => {
  const keys = Object.keys(object)
  if (keys.length) return ''
  let arr: string[] = []
  keys.map(key => {
    arr.push(`${key}=${object[key]}`)
  })

  return `?${arr.join('&')}`
}









export const dataURLtoFile = (dataURL: string, filename: string): File => {
  const arr = dataURL.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] || '';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);

  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }

  return new File([u8arr], filename, { type: mime });
};

export const blobToDataURL = async (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export const fileToDataURL = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export const resizeAndCropImage = async (dataURL: string, maxWidth: number, aspectRatio: number): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const originalWidth = img.width;
      const originalHeight = img.height;

      // Вычисляем размеры для обрезки
      let cropWidth = originalWidth;
      let cropHeight = cropWidth / aspectRatio;

      if (cropHeight > originalHeight) {
        cropHeight = originalHeight;
        cropWidth = cropHeight * aspectRatio;
      }

      const cropX = (originalWidth - cropWidth) / 2;
      const cropY = (originalHeight - cropHeight) / 2;

      // Вычисляем размеры после уменьшения
      let targetWidth = Math.min(maxWidth, cropWidth);
      let targetHeight = targetWidth / aspectRatio;

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');

      ctx?.drawImage(
        img,
        cropX, cropY, cropWidth, cropHeight,
        0, 0, targetWidth, targetHeight
      );

      resolve(canvas.toDataURL('image/png'));
    };
    img.src = dataURL;
  });
};