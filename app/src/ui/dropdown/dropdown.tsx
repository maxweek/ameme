import { createContext, type FC, type ReactNode, useContext, useEffect, useState } from "react"
import s from "./styles.module.scss"
import { getCl, getClR } from "../../helper"
import { Actions } from "../actions/actions"
import Icon from "../icon/icon"


interface Props {
  children: ReactNode,
  className?: string,
  target?: ReactNode,
  raw?: boolean
  indicator?: boolean
  active?: boolean
  disabled?: boolean
  disableMinWidth?: boolean
  preserveAction?: boolean

  align?: "left" | "center" | "right"
  valign?: "top" | "bottom"
}

export const Dropdown: FC<Props> = (props) => {
  const [active, setActive] = useState<boolean>(false)
  const [id] = useState<string>(Math.random().toString(36).substring(2, 15))

  useEffect(() => {
    if (props.preserveAction) return;
    const handleClickOutside = (event: MouseEvent) => {
      const dropper = document.querySelector(`#_${id}`);
      if (dropper && !dropper.contains(event.target as Node)) {
        setActive(false);
      }
    };

    document.addEventListener("click", handleClickOutside);
    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  }, [id, props.preserveAction]);

  useEffect(() => {
    if (props.active !== undefined) {
      setActive(props.active)
    }
  }, [props.active])

  const classnames = [
    "dropdown",
    s.dropdown,
    getClR(props.className),
    getCl(active, 'active'),
    getCl(!!props.disabled, 'disabled'),
    getCl(!!props.disableMinWidth, 'disableMinWidth'),
    getCl(!!props.align, `align_${props.align}`),
    getCl(!!props.valign, `valign_${props.valign}`)
  ].join(" ")

  const contextValue = {
    close: () => setActive(false)
  };

  const toggle = () => {
    if (props.disabled) return;
    if (props.preserveAction) return;
    setActive(!active)
  }

  return (
    <DropdownContext.Provider value={contextValue}>
      <div className={classnames} id={`_${id}`}>
        <div className={s.dropdown__header} onClick={toggle}>
          {props.target}
          {props.indicator && <div className={s.dropdown__indicator} >
            <Icon name="chevron-down" />
          </div>}
        </div>
        <div className={`${s.dropdown__body} drop_body`}>
          {props.raw ? props.children : <Actions vertical={true}>
            {props.children}
          </Actions>}
        </div>
      </div>
    </DropdownContext.Provider>
  )
}


type DropdownContextType = {
  close: () => void;
};

export const DropdownContext = createContext<DropdownContextType | null>(null);

export const useDropdown = () => {
  const context = useContext(DropdownContext);
  if (!context) throw new Error('useDropdown must be used within Dropdown');
  return context;
};