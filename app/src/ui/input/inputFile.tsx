import { type ChangeEvent, type DragEvent as DragEventReact, type FC, useCallback, useEffect, useRef, useState } from 'react'
import './styles.scss'
import Icon from '../icon/icon';
import Button from '../button/button';
import { getCl, getSize } from '../../helper';
import { Actions } from '../actions/actions';

interface IInputFile {
  onFilesChange?: (files: File[]) => void;  // Функция для обработки изменения файлов
  multiple?: boolean;
  alt?: boolean;
  disabled?: boolean;
  files?: File[] | null
  dragDropRef?: React.RefObject<HTMLDivElement>;  // Внешняя область для drag&drop через props
  onFileInputRefMount?: (ref: React.RefObject<HTMLInputElement>) => void;  // Внешняя область для drag&drop через props
  filesTypes?: string[]
  maxCount?: number
  maxSize?: number
  showMaxSize?: boolean
  clear?: () => void
}

const InputFile: FC<IInputFile> = (props) => {
  const [files, setFiles] = useState<File[]>(props.files || []);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);  // Реф на скрытый input
  const dragAreaRef = useRef<HTMLDivElement>(null);  // Реф на область drag & drop


  const handleFiles = useCallback((selectedFiles: FileList | null) => {
    if (selectedFiles) {
      let filesArray = Array.from(selectedFiles);

      // Если `multiple` равно `false`, оставляем только первый файл
      if (!props.multiple) {
        filesArray = [filesArray[0]];
      }

      // Если `multiple` = false, заменяем файлы новым массивом
      setFiles(prevFiles => {
        const newFiles = props.multiple ? [...prevFiles, ...filesArray] : filesArray;
        props.onFilesChange?.(newFiles);
        return newFiles;
      });

      if (inputRef.current) {
        inputRef.current.value = ''; // Очищаем значение инпута, чтобы можно было снова добавить тот же файл
      }
    }
  }, [props.multiple, props.onFilesChange]);

  useEffect(() => {
    setFiles(props.files || [])
  }, [props.files])

  const onInputChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
  }, [handleFiles]);

  const onDrop = useCallback((e: DragEvent | DragEventReact<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    handleFiles(e.dataTransfer?.files || null);
    setIsDragging(false);
  }, [handleFiles]);

  const onDragOver = useCallback((e: DragEvent | DragEventReact<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  const onDragEnter = useCallback((e: DragEvent | DragEventReact<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: DragEvent | DragEventReact<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const triggerFileInput = useCallback(() => {
    if (inputRef.current) {
      inputRef.current.click();
    }
  }, []);



  const removeFile = (index: number) => {
    const updatedFiles = [...files];
    updatedFiles.splice(index, 1); // Удаляем файл из списка
    setFiles(updatedFiles);
    props.onFilesChange?.(updatedFiles);
    if (inputRef.current) {
      inputRef.current.value = ''; // Очищаем значение инпута, чтобы можно было снова добавить тот же файл
    }
  };

  const clearFiles = () => {
    setFiles([]);
    props.clear?.();
    props.onFilesChange?.([]);  // Очищаем внешний state
    if (inputRef.current) {
      inputRef.current.value = ''; // Очищаем значение инпута, чтобы можно было снова добавить тот же файл
    }
  };

  useEffect(() => {
    const externalDragRef = props.dragDropRef?.current;
    if (externalDragRef) {
      externalDragRef.addEventListener('click', triggerFileInput);
      externalDragRef.addEventListener('drop', onDrop as EventListener);
      externalDragRef.addEventListener('dragover', onDragOver as EventListener);
      externalDragRef.addEventListener('dragenter', onDragEnter as EventListener);
      externalDragRef.addEventListener('dragleave', onDragLeave as EventListener);

      return () => {
        externalDragRef.removeEventListener('click', triggerFileInput);
        externalDragRef.removeEventListener('drop', onDrop as EventListener);
        externalDragRef.removeEventListener('dragover', onDragOver as EventListener);
        externalDragRef.removeEventListener('dragenter', onDragEnter as EventListener);
        externalDragRef.removeEventListener('dragleave', onDragLeave as EventListener);
      };
    }
  }, [props.dragDropRef, triggerFileInput, onDrop, onDragOver, onDragEnter, onDragLeave]);

  useEffect(() => {
    if (!inputRef.current) return
    props.onFileInputRefMount?.(inputRef as React.RefObject<HTMLInputElement>)
  }, [props.onFileInputRefMount, inputRef])

  return (
    <div className='input__box'>
      {(props.multiple || !files.length) &&
        (!props.maxCount || files.length < props.maxCount) && (
          <div
            ref={dragAreaRef}
            className={`input__dragArea ${getCl(isDragging, 'dragging')} ${getCl(!!files.length, 'small')}`}
            onClick={triggerFileInput}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragEnter={onDragEnter}
            onDragLeave={onDragLeave}
          >
            <div className='input__dragArea_icon'>
              <Icon name="file-plus" />
            </div>
            <p className='t2 __color_gray'>`inputs.file.dragFileHere`<br />`inputs.file.or`<br />`inputs.file.clickToUpload`</p>
            {props.filesTypes &&
              <p className='t2 __color_gray'>{props.filesTypes?.map(el => `.${el}`).join(', ')}</p>
            }
            {props.maxSize &&
              <p className='t2 __color_gray'>`inputs.file.maxFileSize`, { getSize(props.maxSize) }</p>
            }
            {props.showMaxSize &&
              <p className='t2 __color_gray'>`inputs.file.maxFileSize`, { getSize(20 * 1024 * 1024) }</p>
            }
            {!!files.length && (
              <p className='t2 __color_gray'>`inputs.file.uploaded {files.length}{props.maxCount ? `/${props.maxCount} ` : ''}`inputs.file.countable`</p>
            )}
          </div>
        )}

      <input
        ref={inputRef}
        type="file"
        accept={props.filesTypes?.map(el => `.${el}`).join(', ')}
        multiple={props.multiple}
        maxLength={props.maxCount}
        size={props.maxSize}
        style={{ display: 'none' }}
        onChange={onInputChange}
      />
      {files.length ?
        <div className="input__fileList">
          {files.map((file, index) => (
            <div key={index} className="input__fileItem">
              <div className="input__fileItem_icon">{getFileIcon(file)}</div>
              <div className="input__fileItem_info">
                <p className="input__fileItem_name">{file.name}</p>
                {/* <p className="input__fileItem_size">{formatFileSize(file.size)}</p> */}
                <div className="input__fileItem_info_row">
                  <p className="input__fileItem_size">#{index + 1}</p>
                  <p className="input__fileItem_ext">{getFileExt(file.name) || 'Unknown'}</p>
                  <p className="input__fileItem_size">{getFileSize(file.size)}</p>
                </div>
              </div>

              <Button type='primary' color='red' icon='trash' onClick={() => removeFile(index)} />
            </div>
          ))}
        </div>
        : null}
      {(files.length > 0 && props.multiple) &&
        <Actions grow={true}>
          <Button type="primary" color='red' onClick={clearFiles}>
            inputs.file.clear
          </Button>
        </Actions>
      }
    </div>
  );
};

export default InputFile;


export const getFileIcon = (file: File) => {
  // console.log(file)
  if (file.type.startsWith('image/')) {
    return <img src={URL.createObjectURL(file)} alt={file.name} className="file-thumbnail" />;
  }
  if (file.type.startsWith('video/')) {
    return <video src={URL.createObjectURL(file)} autoPlay={true} muted={true} className="file-thumbnail" playsInline={true} />;
  }
  return <Icon name="file" />;
};


export const getFileExt = (fullname?: string) => {
  // console.log('fullname', fullname)
  if (!fullname) return ''; // Если fullname не передан, возвращаем пустую строку
  const parts = fullname.trim().split('.'); // Разбиваем имя на части по точкам
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : ''; // Возвращаем последнюю часть как расширение
};
export const getFileSize = (size?: number) => {
  if (size === undefined) return;
  return getSize(size)
}