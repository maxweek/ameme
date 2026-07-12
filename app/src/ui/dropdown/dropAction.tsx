
import { type FC, type HTMLAttributeAnchorTarget, type ReactNode } from "react"
import s from "./styles.module.scss"
import Icon, { type IIconName } from "../icon/icon"
import { getCl, getClR } from "../../helper"
import { useDropdown } from "./dropdown"

interface Props {
  children: ReactNode
  className?: string
  onClick?: () => void
  disabled?: boolean
  href?: string
  color?: "red"
  target?: HTMLAttributeAnchorTarget
  icon?: IIconName
  disableAutoClose?: boolean
}

export const DropAction: FC<Props> = (props) => {
  const { close } = useDropdown();

  const handleClick = () => {
    if (props.disabled) return
    if (props.disableAutoClose) {
      close()
    }
    props.onClick?.()
  }

  const classlist = [
    s.dropAction,
    getClR(props.className),
    getCl(props.disabled, 'disabled'),
    getCl(!!props.color, props.color),
  ].join(' ')

  if (props.href) {
    return <a href={props.href} target={props.target} className={classlist} onClick={handleClick}>
      {props.icon && <Icon name={props.icon} />}
      {props.children}
    </a>
  }
  return <div className={classlist} onClick={handleClick}>
    {props.icon && <Icon name={props.icon} />}
    {props.children}
  </div>
}