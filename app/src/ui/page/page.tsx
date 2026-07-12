import { useEffect, useState, type FC, type ReactNode } from "react";
import "./style.scss"
import { getCl } from "../../helper";
import { Actions } from "../actions/actions";

interface Props {
  children: ReactNode
  title?: string
  actions?: ReactNode
}

export const Page: FC<Props> = props => {

  const [active, setActive] = useState<boolean>(false);

  useEffect(() => {
    setTimeout(() => {
      setActive(true)
    }, 10)
  }, [])

  return <section className={`page ${getCl(active, 'active')}`}>
    <div className="page__header">
      {props.title && <div className="page__title">
        {props.title}
      </div>}
      {props.actions && <div className="page__actions">
        <Actions>
          {props.actions}
        </Actions>
      </div>}
    </div>
    <div className="page__body">
      {props.children}
    </div>
  </section>
}