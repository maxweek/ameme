import { useRef, type FC, type ReactNode } from "react";
import { getCl, getClR } from "../../helper";
import "./styles.scss"
import Icon from "../icon/icon";
import Button from "../button/button";
import { Tooltip } from "../tooltip/tooltip";

interface Props {
  children: ReactNode,
  className?: string,
  align?: 'center' | 'end' | 'baseline' | 'start',
  justify?: 'center' | 'end' | 'between' | 'start',
  grow?: boolean
  wrap?: boolean
  mini?: boolean
  noGap?: boolean
  fillChilds?: boolean
  vertical?: boolean
  fixed?: boolean
}

export const Actions: FC<Props> = (props: Props) => {
  const classnames = [
    'actions',
    getClR(props.className),
    getCl(!!props.align, `a_${props.align}`),
    getCl(!!props.justify, `j_${props.justify}`),
    getCl(props.grow, `grow`),
    getCl(props.wrap, `wrap`),
    getCl(props.fillChilds, `fillChilds`),
    getCl(props.vertical, `vertical`),
    getCl(props.mini, `mini`),
    getCl(props.noGap, `noGap`),
    getCl(props.fixed, `fixed`),
  ].join(' ')
  return (
    <div className={classnames}>
      {props.children}
    </div>
  )
}

interface IActionsDrop {
  children: ReactNode
  disabled?: boolean
  stopPropagation?: any
  display?: boolean
}

export const ActionsDrop: FC<IActionsDrop> = props => {
  const ref = useRef<HTMLDivElement>(null)
  if (!props.display) return
  if (props.disabled) return props.children
  const handleClick = (e: React.MouseEvent<any>) => {
    if (props.stopPropagation) e.stopPropagation()
  }
  return (
    <div className="actionsDrop" onClick={handleClick}>
      <div className="actionsDrop__icon" ref={ref}>
        <Button type="secondary" icon="share-2" onClick={e => e?.stopPropagation()} />
      </div>
      <Tooltip headRef={ref} align="right" events={true}>
        {props.children}
      </Tooltip>
    </div>
  )
} 