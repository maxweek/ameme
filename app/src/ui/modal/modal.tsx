import { type FC, type ReactNode, useEffect, useState } from 'react'
import { fixWindow, getCl, getClR } from '../../helper'
import './styles.scss';
import Icon from '../icon/icon';
import { observer } from 'mobx-react-lite';
import { createPortal } from 'react-dom';
import { ScrollBox } from '../scroller/scroller';

export interface IModal {
  isActive: boolean,
  children: ReactNode
  setActive?: (v: boolean) => void,
  isGlobal?: boolean,
  cantClose?: boolean,
  className?: string,
  wide?: boolean,
  side?: boolean,
  fill?: boolean,
  small?: boolean,
  title?: string,
  subtitle?: string,
  needScroll?: boolean,
  disableScroll?: boolean,
  noPadding?: boolean,
}

let _modalZ = 320

const Modal: FC<IModal> = observer((props: IModal) => {
  const [modalZ, setModalZ] = useState<number>(0)
  const [inited, setInited] = useState<boolean>(false);
  const [active, setActive] = useState<boolean>(false);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);


  useEffect(() => {
    fixWindow(props.isActive)
    if (props.isActive) {
      setModalZ(_modalZ++);
      setInited(true);
      setTimeout(() => {
        setActive(true);
      }, 200);
    } else {
      setActive(false);
      setTimeout(() => {
        if (!active) { // Проверяем состояние active перед вызовом setInited(false)
          setInited(false);
        }
      }, 400);
    }
  }, [props.isActive])

  const close = () => {
    if (!props.cantClose) {
      if (typeof props.setActive === 'function') {
        props.setActive(false)
      }
    }
  }

  const classnames = [
    getCl(active, 'active'),
    getCl(props.isGlobal, 'global'),
    // getCl(props.needScroll, 'scroll'),
    getCl(props.wide, 'wide'),
    getCl(props.disableScroll, 'disableScroll'),
    getCl(props.side, 'side'),
    getCl(props.fill, 'fill'),
    getClR(props.className),
    getCl(props.noPadding, 'noPadding'),
    getCl(props.small, 'small'),
  ].join(' ')


  if (!isClient) return null;

  const portalTarget = typeof document !== 'undefined' && document?.getElementById('pageModals');
  if (!portalTarget) return null;


  return createPortal(

    <div className={`modal ${classnames}`} style={{ zIndex: modalZ }}>
      <div className='modal__shadow' onClick={close}></div>
      <ScrollBox className={"modal__scroller"} disable={props.disableScroll}>
        <div className='modal__inner'>
          {(props.title || props.subtitle) &&
            <div className='modal__title'>
              {props.title}
              {props.subtitle &&
                <div className='modal__subtitle'>
                  {props.subtitle}
                </div>
              }
            </div>
          }
          {!props.cantClose &&
            <div className='modal__close' onClick={close}>
              <Icon name='x' />
            </div>
          }
          {inited && (
            <div className='modal__box'>
              <div className='modal__body'>
                {props.children}
              </div>
            </div>
          )}
        </div>
      </ScrollBox>
    </div>
    , document.getElementById('pageModals') as HTMLElement);
})

export default Modal