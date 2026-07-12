import { type FC } from "react";
import "./styles.scss"
import { getCl, getClR } from "../../helper";

interface Props {
  fill?: boolean
  asIcon?: boolean
  duration?: number
  size?: number
  strokeWidth?: number
  className?: string
  color?: "light" | "dark"
}

export const Loader: FC<Props> = (props: Props) => {
  return (
    <div className={`loader ${getCl(props.fill, 'fill')} ${getCl(!!props.color, props.color)} ${getCl(props.asIcon, 'asIcon')} ${getClR(props.className)}`} style={props.size ? { width: `${props.size}rem` } : undefined}>
      <svg style={{
        width: props.size ? `${props.size}rem` : undefined,
        height: props.size ? `${props.size}rem` : undefined
      }} xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink" width="200px" height="200px" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid">
        <circle cx="50" cy="50" r="32" strokeWidth={props.strokeWidth ?? "5"} stroke={"#2773FF"} strokeDasharray="50.26548245743669 50.26548245743669" fill="none" strokeLinecap="round" style={{ animationDuration: `${props.duration || 1}s` }}>
          {/* <animateTransform attributeName="transform" type="rotate" repeatCount="indefinite" dur="1s" keyTimes="0;1" values="0 50 50;360 50 50"></animateTransform> */}
        </circle>
      </svg>
    </div>
  )
}