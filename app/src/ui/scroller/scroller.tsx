import Scroller, { type IScroller, type IScrollerRef } from "@maxweek/react-scroller";
import { type FC, type ReactNode, type Ref } from "react";
import "./styles.scss"
import { getClR } from "../../helper";

interface Props {
  children: ReactNode
  className?: string
  barAltPosition?: boolean
  showWhenMinimal?: boolean
  scroller?: IScroller
  borderPadding?: boolean
  sRef?: Ref<IScrollerRef>
  onScroll?: (progress: number) => void
  fade?:boolean
  disable?:boolean
}

export const ScrollBox: FC<Props> = (props: Props) => {
  if(props.disable) return props.children
  return (
    <Scroller
      className={`scrollBox ${getClR(props.className)}`}
      barClassName="scrollBox__bar"
      barRollerClassName="scrollBox__roller"
      contentClassName="scrollBox__content"
      autoHide={true}
      barAltPosition={props.barAltPosition}
      showWhenMinimal={props.showWhenMinimal}
      borderFade={props.fade ?? true}
      borderPadding={props.borderPadding ?? props.fade ?? true}
      needBar={true}
      vertical={true}
      horizontal={false}
      
      ref={props.sRef}
      
      {...props.scroller}
    >
      {props.children}
    </Scroller>
  )
}