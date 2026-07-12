import { type FC, type ReactNode, useEffect, useState } from 'react'
import './styles.scss';
import { getCl } from '../../helper';

import * as router from 'react-router-dom';
import Icon, { type IIconName } from '../icon/icon';
import { ScrollBox } from '../scroller/scroller';
const { NavLink } = router;

export interface ITabItem {
  isActive?: boolean,
  onClick?: () => void,
  children: ReactNode,
  head?: string | ReactNode
  header?: string | ReactNode
  headIcon?: IIconName
  icon?: IIconName
  disabled?: boolean
  padding?: boolean
  scrollable?: boolean
}

const Tab: FC<ITabItem> = (props: ITabItem) => {
  const [active, setActive] = useState(false)

  useEffect(() => {
    setActive(!!props.isActive)
  }, [props.isActive])

  return ( 
    <div className={`tab ${getCl(active, 'active')} ${getCl(props.disabled, 'disabled')} ${getCl(props.padding, 'padding')}`}>
      {props.header &&
        <div className="tab__header">
          {(props.headIcon || props.icon) && <Icon name={props.headIcon ?? props.icon} />}
          {typeof props.header === 'string' ? <span>{props.header}</span> : props.header}
        </div>
      }
      {props.scrollable ?
        <ScrollBox>
          {props.children}
        </ScrollBox>
        :
        props.children
      }
    </div>
  );
}

export const TabHead: FC<ITabItem> = (props: ITabItem) => {
  return (
    <div className={`tab__head ${getCl(props.isActive, 'active')} ${getCl(props.disabled, 'disabled')}`} onClick={props.onClick}>
      {props.icon && <Icon name={props.icon} />}{props.head && <span>{props.head}</span>}
    </div>
  );
}

export default Tab