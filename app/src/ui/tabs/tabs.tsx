import React, { type FC, type ReactElement, type ReactNode, useEffect, useState } from 'react'
import './styles.scss';
import { type ITabItem, TabHead } from './tab';
import { getCl } from '../../helper';

interface ITabList {
  children: ReactElement<ITabItem>[] | ReactNode;
  grow?: boolean
  rawTab?: boolean
  actions?: ReactNode
  tab?: number
  ellipsis?: boolean
  onTabChange?: (tab: number) => void
}

const Tabs: FC<ITabList> = (props: ITabList) => {
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    setActiveTab(props.tab || 0)
  }, [props.tab])

  const setTab = (tab: number) => {
    setActiveTab(tab)
    props.onTabChange?.(tab)
  }

  // useEffect(() => {
  //   React.Children.map(props.children, (child, index) => {
  //     child.props.isActive = index === activeTab
  //   })
  // }, [activeTab])

  // console.log(React.Children)

  const validChildren = React.Children.toArray(props.children).filter(
    (child) => React.isValidElement(child)
  );
  return (
    <div className={`tabs ${getCl(props.grow, 'grow')} ${getCl(props.rawTab, 'rawTab')} ${getCl(props.ellipsis, 'ellipsis')}`}>
      <div className="tabs__head">
        <div className="tabs__head_box">
          {validChildren.map((child, index) => {
            const props = (child as React.ReactElement<ITabItem>).props
            return <TabHead
              key={index}
              isActive={index === activeTab}
              disabled={props.disabled}
              onClick={() => !props.disabled && setTab(index)}
              head={props.head}
              icon={props.icon}
              
              children={<></>}
            />
          })}
        </div>
        {props.actions}
      </div>
      <div className="tabs__body">
        {/* {React.Children.toArray(props.children)[activeTab]} */}
        {validChildren.map((child, index) => {
          if (React.isValidElement<ITabItem>(child)) {
            if (index === activeTab) {
              return React.cloneElement(child, {
                isActive: index === activeTab,
                // onClick: () => setActiveTab(index),
              });
            }
          }
          // return child;
        })}
      </div>
    </div>
  );
}

export default Tabs