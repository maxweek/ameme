import { useEffect, useState } from "react";
// import type { FC } from "react";
import type { ReactNode } from "react";
import React, { type FC } from 'react';

import './styles.scss';
import { getCl, getClR } from "../../helper";
import Icon from "../icon/icon";
import type { IIconName } from "../icon/icon";

export interface ButtonProps {
  type: 'primary' | 'secondary' | 'tretiary' | 'simple' | 'arrow' | 'indicator' | 'action',
  children?: ReactNode,
  icon?: IIconName,
  loading?: boolean,
  onClick?: (e?: React.MouseEvent<any>) => void,
  disabled?: boolean,
  classList?: string,
  isRound?: boolean,
  locked?: boolean
  fGrow?: boolean,
  href?: string,
  noAction?: boolean
  download?: string
  spec?: boolean
  disableMinWidth?: boolean
  smallPadding?: boolean
  stopPropagation?: any
  text?: string
  tip?: string
  tipPos?: "topCenter" | "topLeft" | "topRight" | "left" | "right" | "botCenter" | "botLeft" | "botRight"
  color?: 'yellow' | 'red' | 'green' | 'purple' | "" | "blue",
  asDiv?: boolean
  small?: boolean
  target?: "_blank" | "_self"
  btnKey?: {
    name: string,
    ctrl?: boolean,
    shift?: boolean,
    alt?: boolean,
    asClick?: boolean,
  }
}
let btnTimer: any;

const Button: FC<ButtonProps> = (props: ButtonProps) => {

  const [hovered, setHovered] = useState<boolean>(false);
  const [pressed, setPressed] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(props.loading || false);
  // const navigate = useNavigate()

  useEffect(() => {
    if (props.loading !== undefined) {
      setLoading(props.loading);
    } else {
      setLoading(false);
    }
  }, [props.loading])

  const handleClick = async (e?: React.MouseEvent<any>) => {
    if (props.stopPropagation) e?.stopPropagation()
    if (props.locked || props.disabled) return;
    if (props.download && props.href) {
      e?.preventDefault();
      setLoading(true);
      await downloadCrossOriginImage(props.href, props.download);
      setLoading(false);
      return;
    }
    props.onClick?.(e)
  }


  const handlePointerEnter = () => {
    if (props.tip) btnTimer = setTimeout(() => setHovered(true), 400);
  }

  const handlePointerLeave = () => {
    clearTimeout(btnTimer)
    setHovered(false)
  }
  useEffect(() => {
    // console.log(props.btnKey, props.disabled || !props.btnKey)
    if (props.disabled || !props.btnKey) {
      setPressed(false)
      return;
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      setPressed(false)
    }
  }, [props.btnKey])


  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return
    // if(props.btnKey?.name !== 'KeyS') return
    // console.log(e, props.btnKey?.name, props.btnKey)
    // console.log('e', e.ctrlKey, e.shiftKey)
    // console.log('props', !!props.btnKey?.ctrl, !!props.btnKey?.shift)
    // console.log('equal', !!props.btnKey?.ctrl === e.ctrlKey, !!props.btnKey?.shift === e.shiftKey)
    if (!!props.btnKey?.ctrl !== e.ctrlKey) return
    if (!!props.btnKey?.alt !== e.altKey) return
    if (!!props.btnKey?.shift !== e.shiftKey) return
    if (e.code === props.btnKey?.name) setPressed(true)
  }
  const handleKeyUp = (e: KeyboardEvent) => {
    if (!!props.btnKey?.ctrl !== e.ctrlKey) return
    if (!!props.btnKey?.alt !== e.altKey) return
    if (!!props.btnKey?.shift !== e.shiftKey) return

    if (e.code === props.btnKey?.name) {
      setPressed(false)
      if (props.btnKey.asClick) handleClick()
    }
  }


  const Tag = props.asDiv ? 'div' : 'button';
  const renderIcon = props.icon && <Icon name={props.icon} />;
  const renderLockedIcon = props.locked && <Icon name="lock" />;
  const renderTip = props.tip && hovered && <div className={`btn__tip ${getCl(!!props.tipPos, props.tipPos, "botCenter")}`}>{props.tip}</div>;
  const renderKey = props.btnKey?.name && <div className={`btn__key`}>
    {props.btnKey?.ctrl && '^'}
    {props.btnKey?.shift && '_'}
    {props.btnKey?.alt && 'Alt+'}
    {props.btnKey?.name.replace('Key', '').replace('Digit', '')}
  </div>;

  const classnames = [
    getClR(props.classList),
    getCl(true, props.type),
    getCl(props.disabled, 'disabled'),
    getCl(!!props.color, props.color),
    getCl(!props.children, 'icon'),
    getCl(loading, 'loading'),
    getCl(props.locked, 'locked'),
    getCl(props.disableMinWidth, 'noMinWidth'),
    getCl(props.smallPadding, 'smallPadding'),
    getCl(props.fGrow, 'fGrow'),
    getCl(props.spec, 'spec'),
    getCl(pressed, 'pressed'),
    getCl(!!props.btnKey?.name, 'withKey'),
    getCl(props.small, 'small'),
    getCl(props.noAction, 'noActions'),
    getCl((!props.children && !!props.icon), 'asIcon'),
  ].join(' ')

  if (props.href) {
    return <a
      href={props.href}
      target={props.target}
      className={`btn ${classnames}`}
      onClick={handleClick}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      {(props.type === 'action' && props.icon) ?
        <Button noAction={true} type="primary" color={props.color} icon={props.icon} asDiv={true} />
        :
        renderIcon
      }
      {props.type === 'action' && props.text}
      {props.children}
      {renderLockedIcon}
      {renderTip}
      {renderKey}
    </a>
  }

  return (
    <Tag
      className={`btn ${classnames}`}
      onClick={handleClick}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      {(props.type === 'action' && props.icon) ?
        <Button noAction={true} type="primary" color={props.color} icon={props.icon} asDiv={true} />
        :
        renderIcon
      }
      {props.type === 'action' && props.text}
      {props.children}
      {renderLockedIcon}
      {renderTip}
      {renderKey}
    </Tag>
  )
}

export default Button;


async function downloadCrossOriginImage(imageUrl: string, filename: string) {
  await fetch(imageUrl, { mode: 'cors' })
    .then(response => response.blob())
    .then(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });
}